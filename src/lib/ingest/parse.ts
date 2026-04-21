import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { extractText, getDocumentProxy } from "unpdf";

export type Parsed = {
  text: string;
  title?: string;
  pages?: { page: number; text: string }[];
};

export async function parsePdf(buf: Buffer): Promise<Parsed> {
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

export async function parseLink(url: string): Promise<Parsed> {
  const res = await fetch(url, {
    headers: { "User-Agent": "NotebookLM-Ingest/1.0" },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article?.textContent) {
    throw new Error("Could not extract readable content from page");
  }
  return {
    text: article.textContent.trim(),
    title: article.title ?? url,
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
