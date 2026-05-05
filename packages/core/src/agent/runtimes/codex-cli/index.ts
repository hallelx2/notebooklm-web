/**
 * OpenAI Codex CLI runtime — backed by `@openai/codex-sdk`.
 *
 * The SDK is a thin TypeScript wrapper that spawns the `codex` CLI as
 * a subprocess and reads JSONL events over stdout. We get a clean
 * event stream (`thread.started`, `item.completed`, `turn.completed`,
 * etc.) instead of having to parse stdout ourselves. So the user
 * still needs `codex` installed on PATH (it's the actual binary
 * doing the work), but we no longer talk to it directly.
 *
 * Chat behaviour:
 *   We create a new thread per request and send the flattened chat
 *   history as a single prompt. (The SDK supports persistent threads
 *   via `codex.resumeThread(threadId)` — wiring that up would let us
 *   skip re-sending the history each turn, but it's a follow-up: we
 *   need a place to store the threadId per notebook conversation.)
 *
 *   The thread is locked to `sandboxMode: "read-only"` and
 *   `approvalPolicy: "never"` so Codex behaves like a chat assistant
 *   instead of an autonomous agent — no file edits, no commands run.
 *   When we later want the agentic behaviour for studio / research
 *   we'll relax these per-task.
 *
 * Capability scope today:
 *   - chat       ✓  via runStreamed() → text-delta events
 *   - rerank     ✗  Codex isn't shaped for single-shot scoring
 *   - research   ✗  needs MCP tool plumbing we haven't wired
 *   - studio     ✗  same — uses tool calls in our pipeline
 *
 * `available()` probes `codex --version` exit code, cached for 5
 * minutes. The SDK requires the binary at runtime — even though we
 * import the SDK statically, instantiating `Codex` will fail if
 * `codex` isn't on PATH, so we gate before instantiating.
 *
 * Importing this module side-effect-registers the adapter via
 * `registerAdapter`. The `runtimes/index.ts` barrel pulls us in.
 */
import { spawn } from "node:child_process";
import { registerAdapter } from "../../harness";
import type {
  AgentAdapter,
  AgentContext,
  AgentEvent,
  AgentTask,
} from "../../types";

/* ------------------------------------------------------------------ */
/*  CLI detection (cached)                                              */
/* ------------------------------------------------------------------ */

let _availableCache: { ok: boolean; expiresAt: number } | null = null;
const AVAILABLE_TTL_MS = 5 * 60_000;

async function probeCodexAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_availableCache && _availableCache.expiresAt > now) {
    return _availableCache.ok;
  }
  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn("codex", ["--version"], {
      windowsHide: true,
      shell: process.platform === "win32",
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill();
        } catch {}
        resolve(false);
      }
    }, 4_000);
    child.on("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(code === 0);
      }
    });
  });
  _availableCache = { ok, expiresAt: now + AVAILABLE_TTL_MS };
  return ok;
}

/* ------------------------------------------------------------------ */
/*  Loose typing for the optional SDK                                   */
/* ------------------------------------------------------------------ */

// We dynamic-import `@openai/codex-sdk` at chat time. The types are
// re-declared locally so this file still compiles when the dep isn't
// installed (matching the kokoro-js pattern in core/tts).
type ThreadEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage?: unknown }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "item.started"; item: ThreadItem }
  | { type: "item.updated"; item: ThreadItem }
  | { type: "item.completed"; item: ThreadItem }
  | { type: "error"; message: string };

type ThreadItem =
  | { id: string; type: "agent_message"; text: string }
  | {
      id: string;
      type: "command_execution";
      command: string;
      aggregated_output: string;
      exit_code?: number;
      status: "in_progress" | "completed" | "failed";
    }
  | {
      id: string;
      type: "file_change";
      changes: { path: string; kind: "add" | "delete" | "update" }[];
      status: "completed" | "failed";
    }
  // Other items (mcp_tool_call, web_search, etc.) — we don't care
  // about for chat today, so type them loosely.
  | { id: string; type: string; [key: string]: unknown };

type CodexSdk = {
  Codex: new (opts?: {
    codexPathOverride?: string;
    apiKey?: string;
  }) => {
    startThread(opts?: {
      model?: string;
      sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
      approvalPolicy?: "never" | "on-request" | "on-failure" | "untrusted";
      networkAccessEnabled?: boolean;
      webSearchEnabled?: boolean;
      skipGitRepoCheck?: boolean;
    }): {
      runStreamed(
        input: string,
        opts?: { signal?: AbortSignal },
      ): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
    };
  };
};

let _sdkPromise: Promise<CodexSdk> | null = null;
async function loadSdk(): Promise<CodexSdk> {
  if (_sdkPromise) return _sdkPromise;
  _sdkPromise = (async () => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: optional dep
      const mod = (await import("@openai/codex-sdk")) as any;
      return mod as CodexSdk;
    } catch (err) {
      throw new Error(
        "@openai/codex-sdk is not installed. Run `bun add @openai/codex-sdk` " +
          "in the desktop app, or pick a different runtime in Settings → Models. " +
          (err instanceof Error ? `(${err.message})` : ""),
      );
    }
  })();
  return _sdkPromise;
}

/* ------------------------------------------------------------------ */
/*  Chat — the only supported task                                      */
/* ------------------------------------------------------------------ */

type ChatTask = Extract<AgentTask, { kind: "chat" }>;

/**
 * Render the chat history as a single prompt for `thread.run()`. Codex
 * threads can be resumed across turns via thread.id, but we don't yet
 * have a place to persist that per notebook — so each request is a
 * fresh thread with the full history flattened in.
 */
function flattenChatToPrompt(task: ChatTask): string {
  const lines: string[] = [];
  for (const m of task.messages) {
    const role = m.role === "user" ? "User" : "Assistant";
    const text = (m.parts ?? [])
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("");
    if (text) lines.push(`${role}: ${text}`);
  }
  return lines.join("\n\n");
}

async function* runChat(
  task: ChatTask,
  ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const prompt = flattenChatToPrompt(task);
  if (!prompt.trim()) {
    yield { type: "error", message: "Empty prompt — nothing to send to Codex." };
    return;
  }

  let sdk: CodexSdk;
  try {
    sdk = await loadSdk();
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    return;
  }

  const codex = new sdk.Codex();
  const thread = codex.startThread({
    // Lock the agent down for chat: we want it to behave like a
    // regular LLM, not run commands or edit files on the user's
    // machine. When we wire studio / research later we'll relax
    // these per-task.
    sandboxMode: "read-only",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    webSearchEnabled: false,
    // The Codex CLI normally insists the working directory is a git
    // repo (it's designed for code work). Skip that check — chat
    // doesn't need it.
    skipGitRepoCheck: true,
  });

  let streamed: { events: AsyncGenerator<ThreadEvent> };
  try {
    streamed = await thread.runStreamed(prompt, { signal: ctx.signal });
  } catch (err) {
    yield {
      type: "error",
      message:
        "codex runStreamed failed: " +
        (err instanceof Error ? err.message : String(err)),
    };
    return;
  }

  // Track the running text. Codex emits agent_message items (which
  // carry the assistant's reply text); we forward each completion as
  // a single text-delta. If the SDK ever adds true streaming token
  // deltas inside an item we'll surface those instead.
  let assembled = "";
  let lastEmittedText = "";

  try {
    for await (const ev of streamed.events) {
      if (ctx.signal?.aborted) break;
      switch (ev.type) {
        case "item.updated":
        case "item.completed": {
          const item = ev.item;
          if (item.type === "agent_message" && "text" in item) {
            const text = (item as { text: string }).text;
            // SDK emits the cumulative text on each update — diff
            // against what we last emitted to avoid duplicating.
            if (text.length > lastEmittedText.length) {
              const delta = text.slice(lastEmittedText.length);
              lastEmittedText = text;
              assembled = text;
              yield { type: "text-delta", text: delta };
            }
          } else if (
            item.type === "command_execution" &&
            "command" in item
          ) {
            // Surface command intent as a step so the UI can show
            // "Codex ran: `ls`" without claiming it as assistant text.
            // For chat-mode we have sandboxMode: read-only so this
            // shouldn't fire often; but if Codex tries we want
            // visibility.
            const c = item as {
              command: string;
              status: string;
            };
            yield {
              type: "step",
              label: `codex command: ${c.command}`,
              data: { status: c.status },
            };
          }
          break;
        }
        case "turn.completed":
          yield { type: "done", finalText: assembled };
          return;
        case "turn.failed":
          yield {
            type: "error",
            message: ev.error.message ?? "codex turn failed",
          };
          return;
        case "error":
          yield { type: "error", message: ev.message };
          return;
        // thread.started / turn.started / item.started — informational,
        // nothing to forward today.
        default:
          break;
      }
    }
    // Stream ended without a turn.completed — surface what we have.
    yield { type: "done", finalText: assembled };
  } catch (err) {
    yield {
      type: "error",
      message:
        "codex stream error: " +
        (err instanceof Error ? err.message : String(err)),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const codexCliAdapter: AgentAdapter = {
  id: "codex-cli",

  async available(): Promise<boolean> {
    return probeCodexAvailable();
  },

  supports(task: AgentTask): boolean {
    return task.kind === "chat";
  },

  run(task: AgentTask, ctx: AgentContext): AsyncIterable<AgentEvent> {
    if (task.kind !== "chat") {
      return (async function* () {
        yield {
          type: "error",
          message: `codex-cli runtime doesn't support task "${task.kind}" — falling back.`,
        };
      })();
    }
    return runChat(task, ctx);
  },
};

registerAdapter(codexCliAdapter);
