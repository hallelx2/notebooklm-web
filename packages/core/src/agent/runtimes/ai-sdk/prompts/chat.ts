import type { RetrievedChunk } from "../../../../retrieve";

/**
 * Format retrieved chunks into the numbered + chunk-marked block we
 * inline into the chat system prompt. The `(chunk:UUID)` markers let the
 * citation hook tie each cite back to a specific chunk row.
 */
function formatSources(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.sourceTitle}\n${c.content}\n(chunk:${c.chunkId})`,
    )
    .join("\n\n---\n\n");
}

/**
 * System prompt for the `chat` task. Verbatim port of the prompt in
 * `packages/server/src/handlers/chat.ts` so commit 3 can route through
 * the harness without changing any wire output.
 */
export function chatSystemPrompt(retrieved: RetrievedChunk[]): string {
  return `You are a research assistant that answers strictly from the provided sources.
- Cite every non-trivial claim with [^n] markers where n is the source number below.
- If the sources don't contain the answer, say so — don't invent facts.
- Be concise and structured.

SOURCES:
${retrieved.length ? formatSources(retrieved) : "(no sources yet)"}`;
}
