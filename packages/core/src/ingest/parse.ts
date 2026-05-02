export type Parsed = {
  text: string;
  title?: string;
  pages?: { page: number; text: string }[];
};

export async function parsePdf(buf: Buffer): Promise<Parsed> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [text];
  const pages = pageTexts.map((t, i) => ({ page: i + 1, text: String(t) }));
  return {
    text: pages.map((p) => p.text).join("\n\n"),
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
