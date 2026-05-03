/**
 * Prompts for the `research` task — the multi-phase deep-research loop
 * (plan → search → score → fetch → summarize → outline → write → reflect
 * → augment → verify). Each function builds the prompt for one phase.
 *
 * All strings are verbatim ports from
 * `packages/server/src/handlers/deep-research.ts` so the AI SDK runtime
 * produces output identical to the pre-harness handler.
 */

export function researchPlanPrompt(opts: {
  query: string;
  numSub: number;
  existingContext: string;
}): string {
  return `You are planning a research brief. Break the user's question into ${opts.numSub} focused, diverse sub-questions suitable for web search. No filler -- each sub-question should target a distinct angle, fact, or perspective.

The user already has these sources in their notebook:
${opts.existingContext}

Avoid duplicating what they already know. Focus on NEW information and perspectives.

User question: ${opts.query}`;
}

export function researchScorePrompt(opts: {
  query: string;
  candidates: { url: string; title: string; snippet: string }[];
}): string {
  return `Rate each source's likely relevance to the research question "${opts.query}" on a scale of 1-10.
Consider: domain authority, title relevance, snippet quality.

Sources:
${opts.candidates.map((r, i) => `${i + 1}. ${r.title} (${r.url})\n   Snippet: ${r.snippet}`).join("\n\n")}

Return ALL sources ranked by relevance.`;
}

export function researchSummarizePrompt(opts: {
  query: string;
  title: string;
  text: string;
}): string {
  return `Extract the key facts, findings, and arguments from this text that are relevant to: "${opts.query}"

Source: ${opts.title}
Text: ${opts.text}

Return a concise bullet-point summary of the most important information. Include specific data, numbers, dates, and findings.`;
}

export function researchOutlinePrompt(opts: {
  query: string;
  subqueries: string[];
}): string {
  return `Create an outline for a research report on: "${opts.query}"

Sub-questions covered: ${opts.subqueries.join("; ")}

The report should have 4-7 sections including an introduction and conclusion.
Each section should have 2-4 key points to address.`;
}

export function researchSectionPrompt(opts: {
  query: string;
  heading: string;
  keyPoints: string[];
  sourcesBlock: string;
  isIntro: boolean;
  isConclusion: boolean;
}): string {
  return `You are writing section "${opts.heading}" of a research report on "${opts.query}".

Key points to cover: ${opts.keyPoints.join("; ")}

SOURCES:
${opts.sourcesBlock}

Write this section (200-400 words). Use inline citations [N] referring to the numbered sources. Be specific with facts and data. Use markdown formatting.

${opts.isIntro ? "This is the introduction -- provide context and state the importance of the topic." : ""}
${opts.isConclusion ? "This is the conclusion -- summarize key takeaways as bullet points." : ""}

Do NOT include the section heading -- it will be added automatically. Start directly with the content.`;
}

export const researchFastSystemPrompt =
  "You write thorough, well-structured research reports grounded strictly in the provided sources. Use inline citations like [1], [2] that refer to the numbered SOURCES list. Use clear section headings (## markdown). Do not invent facts; if sources disagree, note the disagreement. End with a 'Key takeaways' bullet list.";

export function researchFastPrompt(opts: {
  query: string;
  subqueries: string[];
  sourcesBlock: string;
}): string {
  return `Research question: ${opts.query}\n\nSub-questions to cover:\n${opts.subqueries
    .map((s, i) => `${i + 1}. ${s}`)
    .join(
      "\n",
    )}\n\nSOURCES:\n${opts.sourcesBlock}\n\nWrite a concise report (500–800 words) answering the research question, with clear sections and inline [n] citations.`;
}

export function researchReflectionPrompt(opts: {
  query: string;
  report: string;
}): string {
  return `You just wrote this research report:

${opts.report}

Research question: ${opts.query}

Critically evaluate:
1. What important aspects of the question are NOT adequately covered?
2. Are there any claims that need more evidence?
3. What follow-up searches would strengthen this report?

Return 0-3 specific gaps that need additional research. If the report is comprehensive, return an empty gaps array.`;
}

export function researchAugmentPrompt(opts: {
  report: string;
  gapsBlock: string;
  newSourcesBlock: string;
}): string {
  return `You previously wrote this research report:

${opts.report}

New sources have been found to fill these gaps: ${opts.gapsBlock}

NEW SOURCES:
${opts.newSourcesBlock}

Write ADDITIONAL sections or paragraphs to address the gaps. Use citations [NEW-N] for new sources. Use markdown ## headings.`;
}

export function researchVerificationPrompt(opts: {
  report: string;
  sourcesIndex: string;
}): string {
  return `Review this research report and identify the key factual claims. For each, note which source numbers support it.

Report:
${opts.report}

Sources available: ${opts.sourcesIndex}

Flag any claims supported by only one source as "low" confidence. Claims supported by 2+ sources are "high". Note any contradictions as warnings.`;
}
