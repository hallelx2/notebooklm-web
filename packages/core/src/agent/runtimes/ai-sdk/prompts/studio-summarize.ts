/**
 * Per-source summariser used by the studio map-reduce path. The output
 * of this prompt is what downstream studio prompts (mind-map, briefing,
 * study-guide, FAQ, timeline, flashcards, quiz, audio-script) see when
 * the full notebook text exceeds the chat model's context budget. The
 * summary is kind-aware so the downstream prompt isn't starved of the
 * structure it needs (dates for timelines, question-rich passages for
 * FAQ, hierarchical concept structure for mind-map, etc.).
 */
export function studioSummarizePrompt(opts: {
  kind: string;
  topic: string;
  title: string;
  text: string;
}): string {
  const kindHint = kindGuidance(opts.kind);
  return `You are summarising one source document so a downstream studio agent can produce a "${opts.kind}" output about the topic "${opts.topic}".

Source title: ${opts.title}

Faithfully extract the most important content from the source: facts, names, dates, numbers, definitions, claims, and the structure they're organised in. Preserve direct quotes for striking phrasing. Do NOT invent anything that isn't in the source. Do NOT include meta-commentary about the document format, page numbers, or your own process.${kindHint}

Aim for 300-700 words. Prefer faithful coverage over compression — the downstream agent will tighten and re-shape the material.

Source content:
${opts.text}`;
}

function kindGuidance(kind: string): string {
  switch (kind) {
    case "timeline":
      return "\n\nFor this output kind: prioritise dated events (explicit dates or relative ordering). List events in the order they appear with their dates intact.";
    case "faq":
      return "\n\nFor this output kind: surface confusing or non-obvious points, common misconceptions, and any explicit Q&A passages.";
    case "mind-map":
      return "\n\nFor this output kind: preserve the hierarchical structure of concepts (top-level themes, sub-areas, supporting details) so the downstream agent can build the heading tree.";
    case "flashcards":
    case "quiz":
      return "\n\nFor this output kind: surface discrete factual atoms (term -> definition, question -> answer, cause -> effect) the downstream agent can convert into cards or questions.";
    case "study-guide":
      return "\n\nFor this output kind: preserve definitions, key concepts per section, and any review-worthy synthesis points.";
    case "briefing-doc":
      return "\n\nFor this output kind: surface findings, implications, decisions, recommended actions, and supporting evidence.";
    case "audio-script":
    case "audio-overview":
      return "\n\nFor this output kind: preserve the narrative arc — what's the story, what's at stake, what are the key beats — alongside the supporting facts.";
    default:
      return "";
  }
}
