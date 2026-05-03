/**
 * Claude Agent SDK runtime.
 *
 * Spins up an in-process Claude Code agent (via `query()` from
 * `@anthropic-ai/claude-agent-sdk`) and translates its message stream
 * into our `AgentEvent` shape. Locked to Anthropic by design — the
 * SDK only speaks to Claude — so the harness falls back to the AI
 * SDK runtime for users without Anthropic credentials.
 *
 * `available()` is intentionally strict: BOTH an opt-in env flag AND
 * a decryptable Anthropic credential are required. The flag exists
 * because the SDK launches a subprocess (the `claude` binary) which
 * doesn't fit Vercel's serverless runtime; the desktop and a
 * dedicated long-running server can opt in by setting
 * `NOTEBOOKLM_ENABLE_CLAUDE_AGENT_SDK=1`.
 *
 * Importing this module side-effect-registers the adapter via
 * `registerAdapter`. The `runtimes/index.ts` barrel pulls us in.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { and, eq } from "drizzle-orm";
import {
  loadUserCredential,
  NoAiConfigError,
} from "../../../ai/factory";
import { sources, userAiConfig } from "../../../db/schema";
import { coreDb } from "../../../runtime";
import { registerAdapter } from "../../harness";
import type {
  AgentAdapter,
  AgentContext,
  AgentEvent,
  AgentTask,
} from "../../types";
import {
  type CitationCollector,
  makePostToolUseHook,
  makePreToolUseHook,
  makeUserPromptSubmitHook,
  sessionEndHook,
  sessionStartHook,
} from "./hooks";
import { researchCoordinatorPrompt } from "./prompts/research";
import {
  reportWriterAgent,
  researchPlannerAgent,
  selfCriticAgent,
  sourceSummarizerAgent,
} from "./subagents";
import { createNotebookMcpServer } from "./tools";

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

type ChatTask = Extract<AgentTask, { kind: "chat" }>;
type ResearchTask = Extract<AgentTask, { kind: "research" }>;
type StudioTask = Extract<AgentTask, { kind: "studio" }>;

const ENV_FLAG = "NOTEBOOKLM_ENABLE_CLAUDE_AGENT_SDK";

export const claudeAgentSdkAdapter: AgentAdapter = {
  id: "claude-agent-sdk",

  async available(ctx: AgentContext): Promise<boolean> {
    if (process.env[ENV_FLAG] !== "1") return false;
    try {
      const db = coreDb();
      const [cfg] = await db
        .select()
        .from(userAiConfig)
        .where(eq(userAiConfig.userId, ctx.userId))
        .limit(1);
      if (!cfg || cfg.chatProvider !== "anthropic") return false;
      const cred = await loadUserCredential(ctx.userId, "anthropic");
      return Boolean(cred.apiKey);
    } catch (err) {
      if (err instanceof NoAiConfigError) return false;
      // Any other failure (DB down, decryption error) — fall back to ai-sdk
      // rather than break the request.
      return false;
    }
  },

  /**
   * Per the plan: chat, research, studio supported; rerank skipped
   * because the SDK's session overhead outweighs single-shot scoring.
   */
  supports(task: AgentTask): boolean {
    return task.kind !== "rerank";
  },

  async *run(task: AgentTask, ctx: AgentContext): AsyncIterable<AgentEvent> {
    switch (task.kind) {
      case "chat":
        yield* runChat(task, ctx);
        return;
      case "research":
        yield* runResearch(task, ctx);
        return;
      case "studio":
        yield* runStudio(task, ctx);
        return;
      case "rerank":
        // supports() returned false; if we got here the harness has a bug.
        yield {
          type: "error",
          message: "claude-agent-sdk does not support rerank tasks",
        };
        return;
    }
  },
};

registerAdapter(claudeAgentSdkAdapter);

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Resolve the user's Anthropic credential into an env block we can pass
 * to `query({ options: { env } })`. The SDK reads `ANTHROPIC_API_KEY`
 * (and `ANTHROPIC_BASE_URL` for proxy / Bedrock-style setups).
 */
async function resolveAnthropicEnv(
  userId: string,
): Promise<Record<string, string | undefined>> {
  const cred = await loadUserCredential(userId, "anthropic");
  return {
    ...process.env,
    ANTHROPIC_API_KEY: cred.apiKey,
    ANTHROPIC_BASE_URL: cred.baseUrl ?? undefined,
  };
}

/**
 * Pull the current notebook's "ready" source titles + content excerpts
 * into a single string we feed to the UserPromptSubmit hook (research)
 * or splice into a chat preamble. Best-effort — fails open with the
 * empty-context placeholder.
 */
async function buildExistingContext(notebookId: string): Promise<string> {
  try {
    const db = coreDb();
    const rows = await db
      .select({ title: sources.title, content: sources.content })
      .from(sources)
      .where(
        and(eq(sources.notebookId, notebookId), eq(sources.status, "ready")),
      );
    return (
      rows
        .filter((s) => s.content)
        .map((s) => `- ${s.title}: ${s.content!.slice(0, 500)}`)
        .join("\n")
        .slice(0, 3000) || "(no existing sources)"
    );
  } catch {
    return "(no existing sources)";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Translate a single SDK message into zero or more `AgentEvent`s. Pulled
 * out into a generator helper so the per-task runners stay focused on
 * orchestration.
 */
function* translateSdkMessage(
  msg: any,
  collector: CitationCollector,
): Generator<AgentEvent> {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "assistant" && msg.message?.content) {
    const isSubagent = msg.parent_tool_use_id != null;
    for (const block of msg.message.content as any[]) {
      if (block?.type === "text" && typeof block.text === "string") {
        // Sub-agent text becomes a structured progress event so the
        // top-level transcript reflects the parent agent's reply only.
        if (isSubagent) {
          yield {
            type: "subagent",
            name: "delegated",
            phase: "end",
            data: { text: block.text },
          };
        } else {
          yield { type: "text-delta", text: block.text };
        }
      } else if (block?.type === "tool_use") {
        yield {
          type: "tool-call",
          id: block.id,
          name: block.name,
          input: block.input,
        };
        // The SDK uses a "Task" tool to spawn subagents; surface that
        // as a friendly subagent:start event the client can show.
        if (block.name === "Task") {
          const sub =
            (block.input as { subagent_type?: string } | undefined)
              ?.subagent_type ?? "subagent";
          yield {
            type: "subagent",
            name: sub,
            phase: "start",
            data: block.input,
          };
        }
      } else if (block?.type === "tool_result") {
        yield {
          type: "tool-result",
          id: block.tool_use_id,
          output: block.content ?? null,
        };
      }
    }
  } else if (msg.type === "result") {
    if (msg.subtype === "success" && typeof msg.result === "string") {
      yield { type: "done", finalText: msg.result };
    } else {
      yield {
        type: "error",
        message: msg.result?.toString() ?? "claude-agent-sdk error",
      };
    }
  }

  // Drain any citations the post-tool-use hook collected since the
  // previous SDK message — emitting them here keeps ordering stable
  // (a citation appears before the text that references it).
  while (collector.citations.length > 0) {
    const c = collector.citations.shift()!;
    yield {
      type: "citation",
      chunkId: c.chunkId,
      sourceId: c.sourceId,
      sourceTitle: c.sourceTitle,
      snippet: c.snippet,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  chat                                                               */
/* ------------------------------------------------------------------ */

async function* runChat(
  task: ChatTask,
  ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const env = await resolveAnthropicEnv(task.userId);
  const collector: CitationCollector = { citations: [], urlsRead: [] };
  const mcp = createNotebookMcpServer({
    userId: task.userId,
    notebookId: task.notebookId,
    sourceIds: task.sourceIds,
  });

  // Flatten the UI message history into a single coordinator prompt.
  // The SDK accepts `prompt: string` for one-shot turns; multi-turn
  // would use the streaming-input variant which we don't need here.
  const history = task.messages
    .map((m) => {
      const text = (m.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      return `${m.role.toUpperCase()}: ${text}`;
    })
    .join("\n\n");

  const prompt = `You are a research assistant answering strictly from the user's notebook sources. Use the retrieve_sources tool to fetch relevant chunks before answering. Cite every non-trivial claim with [^n] markers.

Conversation so far:
${history}

Provide a concise, well-cited answer.`;

  yield { type: "step", label: "generate" };

  const ctrl = new AbortController();
  if (ctx.signal) {
    if (ctx.signal.aborted) ctrl.abort();
    else ctx.signal.addEventListener("abort", () => ctrl.abort());
  }

  const q = query({
    prompt,
    options: {
      env,
      abortController: ctrl,
      mcpServers: { "notebook-tools": mcp },
      hooks: {
        PreToolUse: [
          { hooks: [makePreToolUseHook({ allowWebSearch: false })] },
        ],
        PostToolUse: [{ hooks: [makePostToolUseHook(collector)] }],
        SessionStart: [{ hooks: [sessionStartHook] }],
        SessionEnd: [{ hooks: [sessionEndHook] }],
      },
    },
  });

  for await (const msg of q) {
    yield* translateSdkMessage(msg, collector);
  }
}

/* ------------------------------------------------------------------ */
/*  research                                                           */
/* ------------------------------------------------------------------ */

async function* runResearch(
  task: ResearchTask,
  ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const env = await resolveAnthropicEnv(task.userId);
  const existingContext = await buildExistingContext(task.notebookId);
  const collector: CitationCollector = { citations: [], urlsRead: [] };
  const mcp = createNotebookMcpServer({
    userId: task.userId,
    notebookId: task.notebookId,
  });

  const numSub = task.mode === "deep" ? 5 : 3;

  yield { type: "step", label: "generate" };

  const ctrl = new AbortController();
  if (ctx.signal) {
    if (ctx.signal.aborted) ctrl.abort();
    else ctx.signal.addEventListener("abort", () => ctrl.abort());
  }

  const q = query({
    prompt: researchCoordinatorPrompt({
      query: task.query,
      mode: task.mode,
      existingContext,
    }),
    options: {
      env,
      abortController: ctrl,
      mcpServers: { "notebook-tools": mcp },
      // Each sub-agent definition is keyed by name so the coordinator
      // can call it via Task. Tool whitelists per sub-agent come from
      // the AgentDefinition.
      agents: {
        "research-planner": researchPlannerAgent({
          numSub,
          existingContext,
        }),
        "source-summarizer": sourceSummarizerAgent(task.query),
        "report-writer": reportWriterAgent(task.query),
        "self-critic": selfCriticAgent(task.query),
      },
      hooks: {
        PreToolUse: [
          {
            hooks: [
              makePreToolUseHook({
                // fast mode = no web_search (and the runtime expects
                // any web_search call via the post hook to populate
                // urlsRead, which the handler can use to render
                // sources).
                allowWebSearch: task.mode === "deep",
              }),
            ],
          },
        ],
        PostToolUse: [{ hooks: [makePostToolUseHook(collector)] }],
        UserPromptSubmit: [
          { hooks: [makeUserPromptSubmitHook({ existingContext })] },
        ],
        SessionStart: [{ hooks: [sessionStartHook] }],
        SessionEnd: [{ hooks: [sessionEndHook] }],
      },
    },
  });

  for await (const msg of q) {
    yield* translateSdkMessage(msg, collector);
  }

  // Final-sources structured event so the handler can save the
  // full sources list alongside the report.
  if (collector.urlsRead.length > 0) {
    yield {
      type: "structured",
      data: {
        stage: "final-sources",
        sources: collector.urlsRead.map((u, i) => ({
          n: i + 1,
          url: u.url,
          title: u.title ?? u.url,
          snippet: "",
        })),
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  studio                                                             */
/* ------------------------------------------------------------------ */

async function* runStudio(
  task: StudioTask,
  ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  // Only kinds that benefit from an agent loop (those that might want
  // to fetch additional sources / search the web during composition)
  // get the full SDK treatment. Single-shot generations (auto-title,
  // quiz-summary) fall back to the AI SDK runtime — we return false
  // from `supports()` for those? Actually no — supports() returns true
  // for studio at large. We just delegate to a one-shot prompt here
  // that the SDK runs without sub-agents.
  const env = await resolveAnthropicEnv(task.userId);
  const opts = task.opts ?? {};

  // The chat-style prompt; matches the AI SDK runtime's `studioPrompt`
  // shape but we let the model use retrieve_sources if more context is
  // wanted.
  const prompt = buildStudioPrompt(task.outputKind, opts);
  if (!prompt) {
    yield {
      type: "error",
      message: `claude-agent-sdk: no prompt builder for outputKind "${task.outputKind}"`,
    };
    return;
  }

  yield { type: "step", label: "generate" };

  const collector: CitationCollector = { citations: [], urlsRead: [] };
  const ctrl = new AbortController();
  if (ctx.signal) {
    if (ctx.signal.aborted) ctrl.abort();
    else ctx.signal.addEventListener("abort", () => ctrl.abort());
  }

  const q = query({
    prompt,
    options: {
      env,
      abortController: ctrl,
      hooks: {
        SessionStart: [{ hooks: [sessionStartHook] }],
        SessionEnd: [{ hooks: [sessionEndHook] }],
      },
    },
  });

  for await (const msg of q) {
    yield* translateSdkMessage(msg, collector);
  }
}

/**
 * Cheap prompt builder for studio kinds. Mirrors the AI SDK runtime's
 * dispatch but without the citation/source niceties — these are
 * one-shot generations the user asked for explicitly.
 */
function buildStudioPrompt(
  kind: string,
  opts: Record<string, any>,
): string | null {
  const sourceContent = typeof opts.sourceContent === "string"
    ? opts.sourceContent
    : "";
  const base = sourceContent
    ? `Source Material:\n${sourceContent}\n\n`
    : "";

  switch (kind) {
    case "audio-script":
      return `${base}Generate a podcast-style conversation between two hosts (Alex, Sam) discussing the source material. Return ONLY a JSON array: [{ "speaker": "Alex" | "Sam", "text": "..." }, ...]`;
    case "study-guide":
      return `${base}Generate a comprehensive study guide with key concepts, definitions, review questions, and summaries. Use markdown.`;
    case "briefing-doc":
      return `${base}Generate an executive briefing document. Include summary, key findings, analysis, implications, recommendations.`;
    case "faq":
      return `${base}Generate a FAQ with 10-15 questions and detailed answers based on the source material.`;
    case "timeline":
      return `${base}Generate a chronological timeline of key events. Use markdown.`;
    case "mind-map":
      return `${base}Generate a mind map in Markdown heading format (# central, ## branches, ### sub-topics). Return ONLY the markdown.`;
    case "flashcards":
      return `${base}Generate flashcards as a JSON array: [{ "front": "...", "back": "..." }]. Return ONLY valid JSON.`;
    case "quiz": {
      const count = typeof opts.questionCount === "number" ? opts.questionCount : 10;
      return `${base}Generate exactly ${count} quiz questions as a JSON array: [{ "question": "...", "options": [...], "answer": <int> }]. Return ONLY valid JSON.`;
    }
    case "auto-title":
    case "quiz-summary":
      // These don't benefit from agent overhead — supports() should
      // arguably return false. For now fall back via null which the
      // runner translates to an error event; in practice the
      // harness's preference list keeps these on ai-sdk.
      return null;
    default:
      return null;
  }
}
