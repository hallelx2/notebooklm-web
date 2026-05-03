/**
 * Shared vocabulary for the agent harness.
 *
 * Every adapter (`runtimes/*`) consumes an `AgentTask` and yields an
 * `AgentEvent` stream. The harness only depends on these types — never on
 * a specific SDK — so adding a new runtime is a single file under
 * `runtimes/<id>/index.ts` plus a `registerAdapter` call at startup.
 */
import type { UIMessage } from "ai";
import type { RetrievedChunk } from "../retrieve";

export type AgentTaskKind = "chat" | "rerank" | "research" | "studio";

export type StudioOutputKind =
  | "audio-script"
  | "mind-map"
  | "study-guide"
  | "briefing-doc"
  | "faq"
  | "timeline"
  | "flashcards"
  | "quiz"
  | "quiz-summary"
  | "auto-title";

/**
 * Discriminated union over every kind of work the harness routes.
 *
 * - `chat`: streamed conversational reply over a notebook's sources.
 *   Messages are AI-SDK UIMessage shape so the existing client integration
 *   (useChat / ChatPanel) keeps working.
 * - `rerank`: single-shot relevance scoring of candidate chunks. The
 *   `retrieve.ts` 3-stage pipeline calls this twice (query expansion and
 *   LLM rerank).
 * - `research`: multi-round web research with optional self-critique. The
 *   AI-SDK runtime ports the current 9-phase manual loop verbatim;
 *   Claude-Agent-SDK runtime delegates to native sub-agents.
 * - `studio`: any single-shot generation tied to a `StudioOutputKind`
 *   (audio script, mind map, quiz, etc.). The runtime decides what shape
 *   to emit (text or structured) per kind.
 */
export type AgentTask =
  | {
      kind: "chat";
      userId: string;
      notebookId: string;
      messages: UIMessage[];
      sourceIds?: string[];
    }
  | {
      kind: "rerank";
      userId: string;
      query: string;
      candidates: RetrievedChunk[];
      topK: number;
    }
  | {
      kind: "research";
      userId: string;
      notebookId: string;
      query: string;
      mode: "fast" | "deep";
    }
  | {
      kind: "studio";
      userId: string;
      notebookId?: string;
      outputKind: StudioOutputKind;
      // Loose bag of per-kind options (lengths, focuses, quiz answers, etc.)
      // Each runtime parses what it needs.
      // biome-ignore lint/suspicious/noExplicitAny: per-kind opts shape
      opts?: Record<string, any>;
    };

export type AgentRuntimeId =
  | "ai-sdk"
  | "claude-agent-sdk"
  | "openai-agents-sdk"
  | "copilot-cli";

export type AgentRuntime =
  | { id: "ai-sdk" }
  | { id: "claude-agent-sdk" }
  | { id: "openai-agents-sdk" }
  | { id: "copilot-cli"; binPath?: string };

/**
 * Stream contract every adapter emits. Handlers translate this into
 * NDJSON, AI SDK's UIMessageStream, or whatever the surface needs.
 */
export type AgentEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; name: string; input: unknown; id: string }
  | { type: "tool-result"; id: string; output: unknown }
  | {
      type: "subagent";
      name: string;
      phase: "start" | "end";
      data?: unknown;
    }
  | { type: "step"; label: string; data?: unknown }
  | {
      type: "citation";
      chunkId: string;
      sourceId: string;
      sourceTitle: string;
      /** First ~240 chars of the cited chunk — populated when the
       *  citation comes from a pre-retrieved chunk we have content for.
       *  Handlers store this on the persisted assistant message so the
       *  client can show a preview without round-tripping. */
      snippet?: string;
    }
  | { type: "structured"; data: unknown }
  | { type: "done"; finalText?: string; finalObject?: unknown }
  | { type: "error"; message: string };

export type AgentContext = {
  userId: string;
  signal?: AbortSignal;
};

/**
 * What every runtime adapter implements. The harness uses the three
 * predicates (`available`, `supports`) to pick the first runtime in the
 * caller's fallback chain that can actually run the task.
 */
export interface AgentAdapter {
  readonly id: AgentRuntimeId;
  available(ctx: AgentContext): Promise<boolean>;
  supports(task: AgentTask): boolean;
  run(task: AgentTask, ctx: AgentContext): AsyncIterable<AgentEvent>;
}
