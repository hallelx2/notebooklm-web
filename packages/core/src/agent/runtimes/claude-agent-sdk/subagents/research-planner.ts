import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

/**
 * Decomposes the user's research question into N focused sub-questions
 * suitable for web search. Equivalent to the `researchPlanPrompt` step
 * in the AI SDK runtime, but here it's a standalone sub-agent the
 * coordinator can invoke via the `Task` tool.
 *
 * No tool access — pure text reasoning. The output is plain markdown
 * (a numbered list) that the coordinator parses.
 */
export function researchPlannerAgent(opts: {
  numSub: number;
  existingContext: string;
}): AgentDefinition {
  const { numSub, existingContext } = opts;
  return {
    description:
      "Breaks a research question into focused, diverse sub-questions suitable for web search.",
    tools: [],
    prompt: `You are a research planner. Given a question, decompose it into ${numSub} focused, diverse sub-questions suitable for web search. No filler — each sub-question should target a distinct angle, fact, or perspective.

The user already has these sources in their notebook:
${existingContext}

Avoid duplicating what they already know. Focus on NEW information.

Return ONLY a numbered list of ${numSub} sub-questions, one per line. No preamble, no explanation.`,
  };
}
