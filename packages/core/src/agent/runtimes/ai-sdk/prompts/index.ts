/**
 * Prompt barrel — every system prompt and prompt builder used by the
 * AI SDK runtime adapter. Each prompt is a verbatim port of the
 * pre-harness call site (chat handler, deep-research handler, studio
 * router, autotitle helper) so commit 3 can route those call sites
 * through the harness without changing wire output.
 */

export {
  autoSummaryPrompt,
  autoSummarySystem,
  autoTitlePrompt,
  autoTitleSystem,
} from "./auto-title";
export { chatSystemPrompt } from "./chat";
export { expandQueryPrompt, rerankPrompt } from "./rerank";
export {
  researchAugmentPrompt,
  researchFastPrompt,
  researchFastSystemPrompt,
  researchOutlinePrompt,
  researchPlanPrompt,
  researchReflectionPrompt,
  researchScorePrompt,
  researchSectionPrompt,
  researchSummarizePrompt,
  researchVerificationPrompt,
} from "./research";
export { studioPrompt } from "./studio";
export { audioScriptPrompt } from "./studio-audio-script";
export {
  type QuizGradedResult,
  quizSummaryPrompt,
} from "./studio-quiz-summary";
export { studioSummarizePrompt } from "./studio-summarize";
