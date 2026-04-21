import Link from "next/link";

type Props = {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  altHref: string;
  altLabel: string;
  quote?: {
    text: string;
    author: string;
    role: string;
  };
};

export function AuthShell({
  children,
  title,
  subtitle,
  altHref,
  altLabel,
  quote = {
    text: "It replaced a week of reading with a single afternoon. Every answer is sourced — I can trace every claim back to the exact page.",
    author: "Adaeze O.",
    role: "PhD candidate, Computational Biology",
  },
}: Props) {
  return (
    <div className="min-h-screen flex bg-white text-slate-900">
      {/* Left — form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
        <div className="w-full max-w-md mx-auto">
          <div className="flex items-center justify-between mb-14">
            <Link href="/" className="flex items-center gap-2.5 group">
              <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-lg icon-filled">
                  book_2
                </span>
              </span>
              <span className="font-semibold tracking-tight">NotebookLM</span>
            </Link>
            <Link
              href={altHref}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {altLabel}
            </Link>
          </div>

          <div className="mb-10">
            <h1 className="text-4xl font-semibold tracking-tight mb-3">
              {title}
            </h1>
            <p className="text-slate-500">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>

      {/* Right — quote */}
      <div className="hidden lg:flex flex-1 bg-[#0a0a0a] text-white p-16 flex-col justify-between relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="pointer-events-none absolute -top-20 -right-20 w-[40rem] h-[40rem] bg-indigo-500/15 blur-[120px] rounded-full" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-blue-500/10 blur-[100px] rounded-full" />

        <div className="relative flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          v0.1 — preview
        </div>

        <div className="relative max-w-md">
          <span className="material-symbols-outlined text-5xl text-zinc-500 mb-6 block">
            format_quote
          </span>
          <blockquote className="text-2xl md:text-3xl font-medium leading-snug tracking-tight mb-8 text-balance">
            {quote.text}
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-sm font-semibold">
              {quote.author
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div>
              <p className="font-semibold">{quote.author}</p>
              <p className="text-sm text-zinc-400">{quote.role}</p>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-between text-xs text-zinc-500">
          <span>© NotebookLM</span>
          <a
            href="https://github.com/hallelx2/notebooklm-web"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white"
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </div>
  );
}
