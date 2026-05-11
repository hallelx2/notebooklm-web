/**
 * Phase prompts for the notebook research pipeline. Adapted from
 * `prompts/research.ts` (web research) for chunk-grounded synthesis
 * over the user's notebook sources. Inline `(chunk:UUID)` markers tie
 * findings back to specific chunk rows so the UI can resolve sources.
 *
 * The pipeline is kind-agnostic: the artifact this set of prompts
 * produces serves any studio kind (mind-map, briefing-doc, study-guide,
 * FAQ, timeline, flashcards, quiz, audio-script). The kind-specific
 * shaping happens in the kind prompt that consumes the artifact.
 */

/**
 * Fused recon + planning prompt. Returns the corpus overview AND the
 * sub-questions in one call — saves a round-trip vs the original
 * "two-phase" design without sacrificing structure (zod schema enforces
 * the shape).
 *
 * `corpusText` is either the full notebook concatenation or the
 * map-reduce summaries, depending on how `loadNotebookSourcesFullText`
 * sized against the model's context window upstream.
 */
export function notebookReconPlanPrompt(opts: {
  corpusText: string;
  notebookTitle: string;
  notebookDescription: string | null;
  userQuery: string | null;
}): string {
  const focusBlock = opts.userQuery
    ? `\n\nThe user has scoped this research with the following focus — let it bias your sub-questions, but DON'T let it crowd out fundamental coverage of the topic:\n"${opts.userQuery}"`
    : "";
  return `You are the research-planning step of a notebook-grounded research pipeline. The downstream pipeline will retrieve passages per sub-question, write findings, and assemble a research artifact that drives a studio output (mind-map, briefing, FAQ, etc.). Your job is two-fold:

1. RECON — read the corpus below and produce a tight orientation: what is this notebook actually about, what scope does it cover, and how is it structured.
2. PLAN — decompose into focused, orthogonal sub-questions a careful researcher would ask of THIS material to cover it thoroughly.

Sub-questions: 4 if the corpus is small/narrow; up to 12 if it's large/broad. Each must target a distinct angle, fact, mechanism, or perspective — no filler, no near-duplicates. Phrase as questions ("How does X handle Y?", "What evidence supports Z?", "Which factors drive W?"). Avoid meta questions about the documents themselves (page counts, structure, file format).${focusBlock}

Notebook title: ${opts.notebookTitle}${opts.notebookDescription ? `\nNotebook description: ${opts.notebookDescription}` : ""}

CORPUS:
${opts.corpusText}`;
}

/**
 * Per-sub-question synthesis. The model gets the retrieved chunks for
 * one sub-question and writes 200–500 words of findings with inline
 * `(chunk:UUID)` markers so downstream rendering can resolve citations.
 *
 * `sourcesBlock` is built upstream by the orchestrator from the
 * retrieved chunks — shape: `[1] {sourceTitle}\n{content}\n(chunk:UUID)\n\n---...`.
 * Same shape the chat prompt uses, so the model's seen this pattern.
 */
export function notebookSynthesizePrompt(opts: {
  subquestion: string;
  sourcesBlock: string;
  topic: string;
}): string {
  return `You are writing one section of a notebook research artifact about "${opts.topic}".

Sub-question for this section:
${opts.subquestion}

Write 200–500 words answering this sub-question, grounded STRICTLY in the SOURCES block below. Use inline citations of the form (chunk:UUID) — copy the UUID verbatim from the chunk marker following each source's content. EVERY non-trivial claim should carry at least one (chunk:UUID) marker. If the sources don't address some part of the question, say so explicitly rather than inventing.

Do NOT include the sub-question as a heading; the orchestrator adds it.
Do NOT preface with "In summary" or "This section covers" — write the findings directly.
Use crisp prose. Lead with the strongest claims. Include specific numbers, names, and dates where the sources have them.

SOURCES:
${opts.sourcesBlock}`;
}

/**
 * Reflection prompt. Takes the assembled findings + recon and asks the
 * model what's missing. Returns 0–3 gap sub-queries the orchestrator
 * runs through retrieve+synthesise to augment the artifact.
 */
export function notebookReflectPrompt(opts: {
  topic: string;
  scope: string;
  userQuery: string | null;
  assembledFindings: string;
}): string {
  const focusBlock = opts.userQuery
    ? `\nUser-requested focus: "${opts.userQuery}"`
    : "";
  return `You just assembled the following research findings for a notebook about "${opts.topic}".

Scope of the notebook: ${opts.scope}${focusBlock}

FINDINGS:
${opts.assembledFindings}

Critically evaluate:
1. Which substantive aspects of the topic (or the user-requested focus, if any) are NOT adequately covered by the findings?
2. Are there claims that need more grounding — places where one chunk is doing too much load-bearing work?
3. What follow-up sub-queries against the SAME notebook would strengthen the artifact?

Return 0–3 specific gap sub-queries. Each must be answerable from the notebook alone (don't suggest queries that would need external sources). If the findings are already comprehensive for the topic + focus, return an empty array.`;
}
