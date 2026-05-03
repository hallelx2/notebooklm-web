import type { RetrievedChunk } from "../../../../retrieve";
import type { AgentEvent } from "../../../types";

/**
 * UUID v4 anywhere inside a `(chunk:UUID)` marker. The chat system
 * prompt (`prompts/chat.ts`) appends one of these to every source it
 * shows the model; when the model echoes a marker into its reply we
 * surface it as a `citation` event so the client can highlight which
 * chunks the answer leans on.
 */
const MARKER_RE =
  /\(chunk:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

/**
 * Stateful citation extractor for streamed text. The model emits
 * markers in the middle of token stream — and a UUID can split across
 * the boundary between two `text-delta` chunks — so we keep a rolling
 * tail of the last ~50 chars and rescan it on every new chunk.
 *
 * Each unique chunkId is emitted at most once, even if the model
 * cites the same chunk multiple times in one response.
 */
export function makeCitationStreamer(retrieved: RetrievedChunk[]) {
  const byId = new Map(
    retrieved.map((c) => [c.chunkId.toLowerCase(), c]),
  );
  const seen = new Set<string>();
  let buffer = "";

  return {
    /**
     * Feed a streamed text chunk. Returns any newly-discovered
     * citation events (zero or more) — caller is responsible for
     * yielding/forwarding them to the consumer.
     */
    feed(text: string): AgentEvent[] {
      buffer += text;
      const events: AgentEvent[] = [];
      let lastEnd = 0;
      // Reset regex state between calls
      MARKER_RE.lastIndex = 0;
      for (const m of buffer.matchAll(MARKER_RE)) {
        const chunkId = m[1].toLowerCase();
        if (!seen.has(chunkId)) {
          const c = byId.get(chunkId);
          if (c) {
            seen.add(chunkId);
            events.push({
              type: "citation",
              chunkId: c.chunkId,
              sourceId: c.sourceId,
              sourceTitle: c.sourceTitle,
            });
          }
        }
        lastEnd = (m.index ?? 0) + m[0].length;
      }
      // Trim the buffer to the last ~50 chars after the final match —
      // long enough to cover a half-marker that crosses chunk boundary.
      buffer = buffer.slice(Math.max(lastEnd, buffer.length - 50));
      return events;
    },
  };
}
