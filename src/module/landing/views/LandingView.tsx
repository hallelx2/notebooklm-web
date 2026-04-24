import Link from "next/link";
import { ConstellationBackground } from "../components/ConstellationBackground";
import { Footer } from "../components/Footer";

const STEPS = [
  {
    n: "01",
    title: "Bring your sources",
    body: "Drop in PDFs, paste a link, or let Deep Research scout the web for you.",
  },
  {
    n: "02",
    title: "Chat, grounded",
    body: "Ask anything — every answer cites the exact chunk it came from.",
  },
  {
    n: "03",
    title: "Generate Studio outputs",
    body: "Audio overviews, mind maps, reports — rendered from your sources, not hallucinated.",
  },
];

const FEATURES = [
  {
    icon: "upload_file",
    title: "Any source",
    body: "PDF, Markdown, plain text, web pages. More formats coming.",
  },
  {
    icon: "bolt",
    title: "Fast & Deep search",
    body: "Exa or Tavily, with automatic failover. Two clicks from query to sourced report.",
  },
  {
    icon: "format_quote",
    title: "Cited by default",
    body: "Every claim maps to a numbered chunk. Hover for the exact passage.",
  },
  {
    icon: "lock",
    title: "Yours, private",
    body: "Your notebooks, your embeddings, your keys. No shared vector pool.",
  },
];

export function LandingView() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-white selection:text-black">
      <ConstellationBackground />

      <div className="relative">
        {/* Nav */}
        <header className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-lg icon-filled">
                book_2
              </span>
            </span>
            <span className="font-medium tracking-tight">NotebookLM</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/auth/sign-in"
              className="px-3 py-1.5 text-sm text-zinc-300 hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/auth/sign-up"
              className="px-4 py-1.5 text-sm font-medium bg-white text-black rounded-full hover:bg-zinc-200 transition-colors"
            >
              Get started
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 pt-24 pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            v0.1 — now in preview
          </div>
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05] text-balance">
            Your research,
            <br />
            <span className="text-zinc-500">truly understood.</span>
          </h1>
          <p className="mt-8 text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed text-balance">
            A notebook that reads your sources, answers with citations, and
            turns them into audio, reports, and mind maps.
          </p>
          <div className="mt-12 flex items-center justify-center gap-3">
            <Link
              href="/auth/sign-up"
              className="px-6 py-3 rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition-colors shadow-lg shadow-white/5"
            >
              Create a notebook
            </Link>
            <Link
              href="/auth/sign-in"
              className="px-6 py-3 rounded-full border border-white/15 hover:border-white/30 text-zinc-200 transition-colors"
            >
              Sign in
            </Link>
          </div>

          {/* Product preview */}
          <div className="mt-20">
            <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-white/[0.02] p-2 shadow-2xl shadow-black/40">
              <div className="rounded-xl border border-white/5 bg-[#111214] overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 h-9 border-b border-white/5">
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_180px] min-h-[320px] text-left text-xs">
                  <div className="md:border-r border-b md:border-b-0 border-white/5 p-4 space-y-2">
                    <p className="text-zinc-500 uppercase tracking-wider text-[10px]">
                      Sources
                    </p>
                    {["Paper.pdf", "arxiv.org/abs/2401", "Notes.md"].map((s) => (
                      <div
                        key={s}
                        className="flex items-center gap-2 text-zinc-300"
                      >
                        <span className="material-symbols-outlined text-sm text-blue-400">
                          description
                        </span>
                        <span className="truncate">{s}</span>
                      </div>
                    ))}
                  </div>
                  <div className="p-6 space-y-3">
                    <p className="text-zinc-500 uppercase tracking-wider text-[10px]">
                      Chat
                    </p>
                    <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-zinc-200 max-w-[80%]">
                      Summarize the methodology across these papers.
                    </div>
                    <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 text-zinc-300 ml-auto max-w-[85%]">
                      The authors train on a mixture of synthetic and curated
                      data
                      <sup className="text-blue-400">[1]</sup>, using a
                      contrastive objective
                      <sup className="text-blue-400">[2]</sup>…
                    </div>
                  </div>
                  <div className="md:border-l border-t md:border-t-0 border-white/5 p-4 space-y-2">
                    <p className="text-zinc-500 uppercase tracking-wider text-[10px]">
                      Studio
                    </p>
                    {[
                      { i: "graphic_eq", l: "Audio" },
                      { i: "account_tree", l: "Mind Map" },
                      { i: "summarize", l: "Report" },
                      { i: "quiz", l: "Quiz" },
                    ].map((t) => (
                      <div
                        key={t.l}
                        className="flex items-center gap-2 p-2 rounded-md bg-white/[0.03] border border-white/5 text-zinc-300"
                      >
                        <span className="material-symbols-outlined text-sm text-zinc-400">
                          {t.i}
                        </span>
                        {t.l}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-5xl mx-auto px-6 py-24 border-t border-white/5">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
                How it works
              </p>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Three steps. No magic.
              </h2>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-white/20 transition-colors"
              >
                <div className="font-mono text-xs text-zinc-500 mb-6">
                  / {s.n}
                </div>
                <h3 className="text-lg font-medium mb-2">{s.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-6 py-24 border-t border-white/5">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">
            Features
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-12">
            Built for serious research.
          </h2>
          <div className="grid md:grid-cols-2 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-[#0a0a0a] p-6 md:p-8">
                <span className="material-symbols-outlined text-zinc-400 mb-4">
                  {f.icon}
                </span>
                <h3 className="font-medium mb-1.5">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto px-6 py-28 text-center">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-6">
            Start your first notebook.
          </h2>
          <p className="text-zinc-400 mb-10 text-lg">
            Free while in preview. Bring your own API keys if you'd like.
          </p>
          <Link
            href="/auth/sign-up"
            className="inline-block px-8 py-3.5 rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
          >
            Create your account
          </Link>
        </section>

        <Footer />
      </div>
    </div>
  );
}
