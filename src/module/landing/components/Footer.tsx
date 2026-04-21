import Link from "next/link";

const COLUMNS: {
  heading: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    heading: "Product",
    links: [
      { label: "Sign up", href: "/auth/sign-up" },
      { label: "Sign in", href: "/auth/sign-in" },
      { label: "Notebooks", href: "/notebooks" },
      { label: "Deep Research", href: "/auth/sign-up" },
    ],
  },
  {
    heading: "Open source",
    links: [
      {
        label: "Repository",
        href: "https://github.com/hallelx2/notebooklm-web",
        external: true,
      },
      {
        label: "Issues",
        href: "https://github.com/hallelx2/notebooklm-web/issues",
        external: true,
      },
      {
        label: "Releases",
        href: "https://github.com/hallelx2/notebooklm-web/releases",
        external: true,
      },
      {
        label: "Changelog",
        href: "https://github.com/hallelx2/notebooklm-web/commits/main",
        external: true,
      },
    ],
  },
  {
    heading: "Resources",
    links: [
      {
        label: "Neon · Postgres",
        href: "https://neon.tech",
        external: true,
      },
      { label: "Exa Search", href: "https://exa.ai", external: true },
      { label: "Tavily", href: "https://tavily.com", external: true },
      {
        label: "AI SDK",
        href: "https://ai-sdk.dev",
        external: true,
      },
    ],
  },
  {
    heading: "Built by",
    links: [
      {
        label: "@hallelx2",
        href: "https://github.com/hallelx2",
        external: true,
      },
      {
        label: "LinkedIn",
        href: "https://linkedin.com/in/oludele-halleluyah-7270a0233/",
        external: true,
      },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-[#050505] mt-24">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[50rem] h-[40rem] bg-indigo-500/10 blur-[140px] rounded-full" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-10">
        {/* Top row: brand + status */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 pb-12 border-b border-white/10">
          <div className="flex items-start gap-3 max-w-md">
            <span className="w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white icon-filled">
                book_2
              </span>
            </span>
            <div>
              <p className="font-semibold tracking-tight text-lg">NotebookLM</p>
              <p className="text-sm text-zinc-500 leading-relaxed">
                An open-source research workspace that reads with you, answers
                with citations, and turns sources into audio, reports, and mind
                maps.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              All systems normal · v0.1 preview
            </div>
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-blue-300 transition-colors"
            >
              Create a notebook
              <span className="material-symbols-outlined text-base">
                arrow_forward
              </span>
            </Link>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-12 border-b border-white/10">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">
                {col.heading}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1 group"
                      >
                        {link.label}
                        <span className="material-symbols-outlined text-[14px] opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0 transition-all">
                          north_east
                        </span>
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-zinc-400 hover:text-white transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Oversized wordmark line */}
        <div className="py-12 overflow-hidden">
          <p className="font-semibold tracking-[-0.05em] text-[clamp(3rem,12vw,9rem)] leading-[0.85] bg-gradient-to-b from-white/20 to-transparent bg-clip-text text-transparent select-none">
            NotebookLM
          </p>
        </div>

        {/* Bottom row */}
        <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-4 text-xs text-zinc-500 font-mono uppercase tracking-wider">
          <p>© {new Date().getFullYear()} NotebookLM · MIT</p>
          <div className="flex items-center gap-4">
            <span>Built with Bun, Neon, pgvector, Gemini</span>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <a
              href="https://github.com/hallelx2/notebooklm-web"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors inline-flex items-center gap-1.5"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 .297a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.4-4.04-1.4-.55-1.4-1.34-1.77-1.34-1.77-1.1-.75.08-.74.08-.74 1.21.08 1.85 1.24 1.85 1.24 1.08 1.85 2.83 1.32 3.52 1 .11-.78.42-1.32.77-1.62-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.53.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .297" />
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
