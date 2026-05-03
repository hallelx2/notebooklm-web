import type {
  HookCallback,
  PostToolUseHookInput,
  SyncHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * PostToolUse — fires AFTER each tool execution completes. Useful for:
 *   - Recording every retrieve_sources / parse_link result so the
 *     runtime can attribute citations even when the model doesn't
 *     echo `(chunk:UUID)` markers in its reply.
 *   - Capturing usage attribution (which sources were actually read).
 *   - Mutating tool output (e.g. trimming or annotating) before it
 *     reaches the model.
 *
 * The collector returned here is mutated in place; the runtime reads
 * its `citations` and `urlsRead` arrays after the SDK query completes
 * to translate them into `citation` AgentEvents.
 */
export type CitationCollector = {
  citations: {
    chunkId: string;
    sourceId: string;
    sourceTitle: string;
    snippet?: string;
  }[];
  urlsRead: { url: string; title?: string }[];
};

export function makePostToolUseHook(
  collector: CitationCollector,
): HookCallback {
  return async (input, _toolUseId, _options) => {
    const i = input as PostToolUseHookInput;
    if (i.hook_event_name !== "PostToolUse") {
      return { continue: true } as SyncHookJSONOutput;
    }

    try {
      if (i.tool_name === "retrieve_sources" || i.tool_name?.endsWith("retrieve_sources")) {
        const text = readToolText(i.tool_response);
        if (text) {
          const arr = JSON.parse(text) as Array<{
            chunkId: string;
            sourceId: string;
            title: string;
            content?: string;
          }>;
          for (const c of arr) {
            collector.citations.push({
              chunkId: c.chunkId,
              sourceId: c.sourceId,
              sourceTitle: c.title,
              snippet: c.content?.slice(0, 240),
            });
          }
        }
      } else if (i.tool_name === "parse_link" || i.tool_name?.endsWith("parse_link")) {
        const text = readToolText(i.tool_response);
        if (text) {
          const obj = JSON.parse(text) as { title?: string };
          const url = (i.tool_input as { url?: string } | undefined)?.url;
          if (url) collector.urlsRead.push({ url, title: obj.title });
        }
      }
    } catch {
      // Best-effort; never break the model loop on hook failure.
    }

    return { continue: true } as SyncHookJSONOutput;
  };
}

/**
 * Pull a text payload out of an SDK tool response. The shape is
 * `{ content: [{ type: "text", text: "..." }] }` for our tools.
 */
function readToolText(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const r = response as { content?: Array<{ type?: string; text?: string }> };
  if (!Array.isArray(r.content)) return null;
  const first = r.content.find((p) => p?.type === "text" && typeof p.text === "string");
  return first?.text ?? null;
}
