export type Parsed = {
  text: string;
  title?: string;
  pages?: { page: number; text: string }[];
};

/**
 * Cheap readability heuristic. Returns `{ ok: false, reason }` when the
 * text looks like binary / mojibake / encrypted PDF leakage rather than
 * actual prose. Used by `parsePdf` to fail fast on PDFs whose text layer
 * we can't decode (image-only scans, encrypted streams, custom fonts
 * missing a ToUnicode CMap), and re-used by the studio router to skip
 * already-ingested-but-broken sources without a migration pass.
 *
 * Counts over the first 5000 codepoints (sample, not the whole text):
 *   - U+FFFD replacement chars       → >5% means decoding failed
 *   - control chars (excluding \n\r\t) → >3% means binary
 *   - printable letters/numbers/punct → <50% means not prose
 *
 * Tuned against the desktop app's "Ready" PDF that rendered as
 * `��O��O�v+ヰC�Bビ\…` — that sample was ~25% replacement chars and
 * <20% printable.
 */
export function isReadable(
  text: string,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty after trim" };
  }
  if (trimmed.length < 40) {
    return { ok: false, reason: `only ${trimmed.length} chars after trim` };
  }

  const sampleArr = Array.from(trimmed).slice(0, 5000);
  const sampleLen = sampleArr.length;

  let replacement = 0;
  let control = 0;
  let printable = 0;
  const PRINTABLE = /[\p{L}\p{N}\p{P}\p{Zs}]/u;

  for (const ch of sampleArr) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0xfffd) {
      replacement++;
      continue;
    }
    if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) {
      control++;
      continue;
    }
    if (PRINTABLE.test(ch)) printable++;
  }

  const replacementRatio = replacement / sampleLen;
  const controlRatio = control / sampleLen;
  const printableRatio = printable / sampleLen;

  if (replacementRatio > 0.05) {
    return {
      ok: false,
      reason: `${Math.round(replacementRatio * 100)}% Unicode replacement chars — text extraction failed (encrypted, image-only, or non-standard fonts)`,
    };
  }
  if (controlRatio > 0.03) {
    return {
      ok: false,
      reason: `${Math.round(controlRatio * 100)}% control chars — content looks binary, not text`,
    };
  }
  if (printableRatio < 0.5) {
    return {
      ok: false,
      reason: `only ${Math.round(printableRatio * 100)}% printable text — likely image-only PDF or undecodable font encoding`,
    };
  }
  return { ok: true };
}

export async function parsePdf(buf: Buffer): Promise<Parsed> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [text];
  const pages = pageTexts.map((t, i) => ({ page: i + 1, text: String(t) }));
  const fullText = pages.map((p) => p.text).join("\n\n");

  // Reject mojibake / binary / image-only PDFs at parse time. Throwing
  // here propagates up to `ingestFile`'s catch, which marks the source's
  // status as "error" with this reason — the user sees a clear failure
  // in the UI instead of a "Ready" source full of garbage chunks.
  const check = isReadable(fullText);
  if (!check.ok) {
    throw new Error(
      `Couldn't extract readable text from PDF: ${check.reason}. ` +
        "Try a text-based PDF, or run OCR (e.g. `ocrmypdf`) on this file first.",
    );
  }

  return {
    text: fullText,
    pages,
    title: `PDF (${totalPages} pages)`,
  };
}

export async function parseText(buf: Buffer): Promise<Parsed> {
  return { text: buf.toString("utf-8") };
}

/**
 * Strips HTML tags and collapses whitespace — used as a fallback when
 * jsdom / Readability cannot be loaded (e.g. ESM-compat issue on some
 * Vercel serverless bundles).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.trim();
}

export async function parseLink(url: string): Promise<Parsed> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NotebookLM/1.0; +https://notebooklm-web.vercel.app)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  // Try jsdom + Readability first
  try {
    const { JSDOM } = await import("jsdom");
    const { Readability } = await import("@mozilla/readability");
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (article?.textContent) {
      return {
        text: article.textContent.trim(),
        title: article.title ?? extractTitle(html) ?? url,
      };
    }
  } catch {
    // jsdom failed to load or parse — fall through to regex fallback
  }

  // Fallback: regex-based extraction
  const text = stripHtml(html);
  if (!text || text.length < 50) {
    throw new Error("Could not extract readable content from page");
  }
  return {
    text,
    title: extractTitle(html) ?? url,
  };
}

export async function parseByMime(
  buf: Buffer,
  mime: string | null | undefined,
  filename?: string,
): Promise<Parsed> {
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return parsePdf(buf);
  return parseText(buf);
}
