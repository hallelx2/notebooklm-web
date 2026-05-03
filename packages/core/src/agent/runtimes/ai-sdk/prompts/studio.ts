import type { StudioOutputKind } from "../../../types";

/**
 * Prompt builder for the "generic" studio output kinds — the ones the
 * tRPC `studio.generate` mutation currently handles via a single
 * `generateText` call (study-guide, briefing-doc, faq, timeline,
 * mind-map, flashcards, quiz). Verbatim port of the `buildPrompt`
 * function in `packages/server/src/trpc/routers/studio.ts`.
 *
 * The `audio-script`, `quiz-summary`, and `auto-title` kinds use
 * dedicated builders (see sibling files in this directory) — they do
 * not pass through this dispatcher.
 */
export function studioPrompt(
  kind: StudioOutputKind | string,
  sourceContent: string,
  opts: { questionCount?: number } = {},
): string {
  const base = `You are an expert content creator. Based on the following source material, generate the requested output.\n\nSource Material:\n${sourceContent}\n\n`;

  switch (kind) {
    case "audio-overview":
    case "audio-script":
      return (
        base +
        "Generate a podcast-style script with host dialogue. Include natural conversational transitions, an introduction, key discussion points, and a conclusion. Format it as a script with speaker labels."
      );
    case "study-guide":
      return (
        base +
        "Generate a comprehensive study guide with key concepts, definitions, review questions, and summaries for each major topic. Organize it with clear headings and bullet points."
      );
    case "briefing-doc":
      return (
        base +
        "Generate an executive briefing document. Include an executive summary, key findings, analysis, implications, and recommended actions. Keep it concise and professional."
      );
    case "faq":
      return (
        base +
        "Generate a FAQ with 10-15 questions and detailed answers based on the source material. Cover the most important topics and common points of confusion."
      );
    case "timeline":
      return (
        base +
        "Generate a chronological timeline of key events and developments mentioned in the source material. Include dates (or relative ordering) and brief descriptions for each entry."
      );
    case "mind-map":
      return (
        base +
        `Generate a mind map in Markdown heading format for use with the markmap library.

Rules:
- Use a single # heading for the central topic.
- Use ## for main branches (aim for 4-7 branches).
- Use ### for sub-topics under each branch (2-5 per branch).
- Use #### for further details where appropriate (1-3 per sub-topic).
- Keep each node text concise (max 6-8 words).
- Cover ALL the major concepts from the source material.
- Do NOT include any fenced code blocks, do NOT wrap in backticks.
- Return ONLY the markdown, nothing else.

Example format:
# Artificial Intelligence
## Machine Learning
### Supervised Learning
#### Classification
#### Regression
### Unsupervised Learning
## Deep Learning
### Neural Networks
### CNNs`
      );
    case "flashcards":
      return (
        base +
        'Generate flashcards as a JSON array with the following structure: [{ "front": "question or term", "back": "answer or definition" }]. Create 15-25 flashcards covering the key concepts. Return ONLY valid JSON, no other text.'
      );
    case "quiz": {
      const count = opts?.questionCount ?? 10;
      return (
        base +
        `Generate a quiz as a JSON array with the following structure: [{ "question": "question text", "options": ["option A", "option B", "option C", "option D"], "answer": 0 }] where answer is the zero-based index of the correct option. Create exactly ${count} questions. Return ONLY valid JSON, no other text.`
      );
    }
    default:
      return (
        base + "Generate a helpful summary and analysis of the source material."
      );
  }
}
