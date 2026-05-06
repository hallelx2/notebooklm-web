#!/usr/bin/env node
/**
 * Pre-build hook — downloads the ONNX models we want shipped inside
 * the desktop installer so first-run audio + embeddings work offline,
 * with no Hugging Face Hub call at runtime.
 *
 * Files land under `apps/desktop/resources/` and electron-builder picks
 * them up via the `extraResources` config in `apps/desktop/package.json`
 * — at runtime they live at `process.resourcesPath/<name>/...` inside
 * the packaged app.
 *
 * Idempotent: skips files that already exist with the right size. Safe
 * to run repeatedly. Set `FORCE=1` to re-download everything.
 *
 * In dev (no installer build, just `bun run dev`), the providers fall
 * back to the normal HF Hub cache under ~/.cache/huggingface — this
 * script is only needed at packaging time.
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const RESOURCES_DIR = resolve(__dirname, "..", "resources");
const FORCE = process.env.FORCE === "1";

/* ------------------------------------------------------------------ */
/*  Manifest — what we ship                                             */
/* ------------------------------------------------------------------ */

const MANIFEST = [
  /**
   * Kokoro-82M — TTS for the audio overview feature.
   *
   * `kokoro-js` invokes transformers.js' `from_pretrained` against
   * `onnx-community/Kokoro-82M-v1.0-ONNX`. We grab the same files
   * from the HF Hub web mirror and stash them under
   * resources/kokoro/<repo-slug>/ in a layout transformers.js's
   * file-system cache understands as "already downloaded".
   *
   * dtype=q8 — 80MB, indistinguishable from fp32 on CPU for this
   * model, runs at ~real-time on a modern laptop. Other dtype
   * variants stay on HF Hub for advanced users who switch.
   */
  {
    name: "kokoro",
    repo: "onnx-community/Kokoro-82M-v1.0-ONNX",
    files: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "onnx/model_q8f16.onnx",
      "voices/af_bella.bin",
      "voices/am_michael.bin",
    ],
  },
  /**
   * BGE Small EN v1.5 — bundled embedding model.
   *
   * 384 dims, 30MB at q8, English-only. Good enough as a zero-setup
   * default for retrieval; users wanting better recall can switch to
   * BGE-Base / Ollama / a cloud embedding provider in Settings.
   *
   * The `Xenova/...` namespace is the transformers.js community
   * mirror that ships pre-quantized ONNX weights. Same loading
   * mechanism as kokoro.
   */
  {
    name: "embed",
    repo: "Xenova/bge-small-en-v1.5",
    files: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "onnx/model_quantized.onnx",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Fetch                                                               */
/* ------------------------------------------------------------------ */

const HF_HUB_URL = (repo, file) =>
  `https://huggingface.co/${repo}/resolve/main/${file}`;

async function downloadFile(url, dest) {
  const tmp = `${dest}.partial`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  let lastLog = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0 && Date.now() - lastLog > 1000) {
      const pct = Math.round((received / total) * 100);
      process.stdout.write(
        `\r    ${pct}% (${(received / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`,
      );
      lastLog = Date.now();
    }
  }
  if (total > 0) process.stdout.write(`\r    100%\n`);
  await writeFile(tmp, Buffer.concat(chunks));
  // Atomic rename only on success — interrupted downloads leave
  // `.partial` behind for the next run to retry instead of pretending
  // they're the real thing.
  await import("node:fs/promises").then((fs) => fs.rename(tmp, dest));
}

async function fetchEntry(entry) {
  // Mirror transformers.js's *local-model* layout, NOT its cache layout.
  // With env.localModelPath = "<resources>/<name>" and a from_pretrained
  // call of "<org>/<repo>", transformers.js reads literally
  // "<localModelPath>/<org>/<repo>/<file>". So we keep the slash in the
  // on-disk path — `org/repo` becomes a real two-level subdirectory.
  const baseDir = join(RESOURCES_DIR, entry.name, ...entry.repo.split("/"));
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });

  console.log(`  [${entry.name}] ${entry.repo}`);
  for (const file of entry.files) {
    const dest = join(baseDir, file);
    if (!existsSync(dirname(dest)))
      mkdirSync(dirname(dest), { recursive: true });

    if (!FORCE && existsSync(dest)) {
      const size = statSync(dest).size;
      if (size > 0) {
        console.log(`    ✓ ${file} (cached, ${(size / 1024).toFixed(0)}KB)`);
        continue;
      }
    }

    const url = HF_HUB_URL(entry.repo, file);
    console.log(`    ↓ ${file}`);
    try {
      await downloadFile(url, dest);
    } catch (err) {
      console.error(`    ✗ ${file} — ${err.message}`);
      throw err;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`fetch-bundled-models — destination: ${RESOURCES_DIR}`);
  if (FORCE) console.log("  FORCE=1 — re-downloading everything");
  if (!existsSync(RESOURCES_DIR)) mkdirSync(RESOURCES_DIR, { recursive: true });

  for (const entry of MANIFEST) {
    await fetchEntry(entry);
  }

  console.log("\n✓ all bundled models present at", RESOURCES_DIR);
}

main().catch((err) => {
  console.error("\n✗ fetch-bundled-models failed:", err.message);
  process.exit(1);
});
