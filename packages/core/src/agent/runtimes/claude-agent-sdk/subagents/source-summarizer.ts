import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

/**
 * Per-source key-fact extraction. The coordinator calls this once per
 * fetched URL to get a concise bullet-point summary tied to the
 * research query — same prompt as `researchSummarizePrompt` in the AI
 * SDK runtime, but isolated as a sub-agent so the coordinator's
 * context window stays small.
 */
export function sourceSummarizerAgent(query: string): AgentDefinition {
  return {
    description:
      "Extracts key facts, findings, and arguments from a single source relevant to the research query.",
    tools: ["parse_link"],
    prompt: `You are a source summarizer. Extract the key facts, findings, and arguments from the provided text that are relevant to: "${query}"

When given a URL, use parse_link to fetch the content first.

Return a concise bullet-point summary (max ~250 words) of the most important information. Include specific data, numbers, dates, and findings. Note the source's title at the top.

Do NOT include filler ("This article discusses...", "The author argues...") — get straight to the facts.`,
  };
}
