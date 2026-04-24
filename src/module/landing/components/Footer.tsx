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
    heading: "Open Source",
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
    heading: "Stack",
    links: [
      { label: "Neon Postgres", href: "https://neon.tech", external: true },
      { label: "Exa Search", href: "https://exa.ai", external: true },
      { label: "Deepgram", href: "https://deepgram.com", external: true },
      { label: "Vercel AI SDK", href: "https://ai-sdk.dev", external: true },
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
    <footer
      className="relative z-10"
      style={{ borderTop: "1px solid var(--landing-line)" }}
    >
      <div
        className="mx-auto px-10"
        style={{ maxWidth: 1400, padding: "56px 40px 36px" }}
      >
        {/* Top row: brand + status */}
        <div
          className="flex justify-between items-start flex-wrap gap-8"
          style={{
            paddingBottom: 36,
            borderBottom: "1px solid var(--landing-line)",
          }}
        >
          <div>
            <Link href="/" className="flex items-center gap-2.5 group">
              <div
                className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center transition-shadow"
                style={{ background: "var(--landing-pop)" }}
              >
                <span
                  className="material-symbols-outlined icon-filled"
                  style={{ fontSize: 14, color: "white" }}
                >
                  book_2
                </span>
              </div>
              <span
                className="font-bold tracking-tight"
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 16,
                  letterSpacing: "-0.02em",
                  color: "var(--landing-ink)",
                }}
              >
                NotebookLM
              </span>
            </Link>
            <p
              className="mt-2.5"
              style={{
                fontSize: 12,
                color: "var(--landing-dim)",
                maxWidth: 260,
                lineHeight: 1.6,
              }}
            >
              Open-source research workspace. Reads with you. Answers with
              citations. Transforms sources into audio, reports, and mind maps.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-[5px] h-[5px] rounded-full"
              style={{
                background: "var(--landing-pop)",
                animation: "landingPulse 2s infinite",
              }}
            />
            <span
              style={{
                fontFamily: "'Azeret Mono', monospace",
                fontSize: 10,
                color: "var(--landing-dim)",
                letterSpacing: "0.06em",
              }}
            >
              ALL SYSTEMS NORMAL
            </span>
          </div>
        </div>

        {/* Link columns */}
        <div
          className="grid gap-8 py-9"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            borderBottom: "1px solid var(--landing-line)",
          }}
        >
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4
                style={{
                  fontFamily: "'Azeret Mono', monospace",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: "var(--landing-dim)",
                  fontWeight: 500,
                  marginBottom: 12,
                }}
              >
                {col.heading}
              </h4>
              <div className="flex flex-col">
                {col.links.map((link) =>
                  link.external ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="transition-colors py-1"
                      style={{
                        fontSize: 12,
                        color: "var(--landing-mid)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--landing-pop)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--landing-mid)")
                      }
                    >
                      {link.label} &#8599;
                    </a>
                  ) : (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="transition-colors py-1"
                      style={{
                        fontSize: 12,
                        color: "var(--landing-mid)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--landing-pop)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--landing-mid)")
                      }
                    >
                      {link.label}
                    </Link>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Giant wordmark */}
        <div className="py-11 overflow-hidden">
          <p className="foot-big">NotebookLM</p>
        </div>

        {/* Bottom row */}
        <div
          className="flex justify-between items-center"
          style={{
            fontFamily: "'Azeret Mono', monospace",
            fontSize: 10,
            color: "var(--landing-dim)",
            letterSpacing: "0.06em",
          }}
        >
          <span>&copy; {new Date().getFullYear()} NotebookLM &middot; MIT</span>
          <span>Next.js &middot; Neon &middot; pgvector &middot; Gemini</span>
        </div>
      </div>
    </footer>
  );
}
