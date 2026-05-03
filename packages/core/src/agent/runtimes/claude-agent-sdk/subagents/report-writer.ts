import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

/**
 * Drafts a single section of the research report. The coordinator
 * passes a heading, key points, and the available sources block; the
 * writer returns 200-400 words of well-cited markdown for that
 * section. Equivalent to `researchSectionPrompt` in the AI SDK
 * runtime.
 *
 * No tool access — the writer composes from the context the
 * coordinator provided.
 */
export function reportWriterAgent(query: string): AgentDefinition {
  return {
    description:
      "Drafts a single section of a research report with inline citations to the provided sources.",
    tools: [],
    prompt: `You are a report writer. Given a section heading, key points, and a numbered list of sources, write 200-400 words of well-structured markdown for that section.

Topic: "${query}"

Rules:
- Use inline citations [N] referring to the numbered sources.
- Be specific with facts, data, dates.
- Do NOT include the section heading — it will be added automatically.
- Start directly with the content.
- Use markdown formatting (bullets, paragraphs) where helpful.
- Do not invent facts — every non-trivial claim needs a [N] cite.

If the input includes hints "this is the introduction" or "this is the conclusion", adapt the style: introduction provides context, conclusion summarizes key takeaways as bullet points.`,
  };
}
