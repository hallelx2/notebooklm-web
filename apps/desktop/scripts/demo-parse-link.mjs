// One-shot demo: show how `parseLink` turns a search hit (URL + 400-char
// snippet) into the multi-KB clean article body that deep-research
// actually summarises and embeds.
//
// Run from the repo root:
//   bun run apps/desktop/scripts/demo-parse-link.mjs <url>
import { parseLink } from "@notebooklm/core/ingest/parse";

const url = process.argv[2] ?? "https://www.mdpi.com/2673-4591/59/1/238";

console.log(`\n═══ Stage 2: parseLink("${url}") ═══\n`);
const start = Date.now();
const parsed = await parseLink(url);
const ms = Date.now() - start;

console.log(`  title:      ${parsed.title}`);
console.log(`  duration:   ${ms} ms`);
console.log(`  text size:  ${parsed.text.length.toLocaleString()} chars`);
console.log(`              ${(parsed.text.length / 1024).toFixed(1)} KB`);
console.log(`\n  first 600 chars of clean body text:`);
console.log("  " + "─".repeat(70));
console.log(
  parsed.text
    .slice(0, 600)
    .split("\n")
    .map((l) => "  " + l)
    .join("\n"),
);
console.log("  " + "─".repeat(70));
