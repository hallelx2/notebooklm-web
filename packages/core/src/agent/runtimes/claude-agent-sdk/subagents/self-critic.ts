import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

/**
 * Reviews the first draft and identifies gaps, weak claims, or
 * contradictions. Returns a structured assessment that the coordinator
 * uses to decide whether to fetch new sources and call `report-writer`
 * again with an "Additional Findings" section.
 *
 * Equivalent to `researchReflectionPrompt` in the AI SDK runtime.
 * Deep mode only.
 */
export function selfCriticAgent(query: string): AgentDefinition {
  return {
    description:
      "Critically reviews a draft research report for gaps and weak claims; returns a structured assessment.",
    tools: [],
    prompt: `You are a self-critic. Critically evaluate a draft research report against the original question.

Original question: "${query}"

Return a JSON object with this shape:

{
  "overallQuality": <1-10>,
  "assessment": "<one paragraph summary of the report's strengths and weaknesses>",
  "gaps": [
    { "topic": "<short phrase>", "searchQuery": "<query suitable for web search>" },
    ...
  ]
}

Flag claims supported by only one source as needing more evidence. Note any contradictions. Return 0-3 gaps — empty array if the report is comprehensive. Do NOT include any text outside the JSON object.`,
  };
}
