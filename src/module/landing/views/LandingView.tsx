"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { ConstellationBackground } from "../components/ConstellationBackground";
import { Footer } from "../components/Footer";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

/* ------------------------------------------------------------------ */
/* Data                                                                 */
/* ------------------------------------------------------------------ */

const ROTATING_WORDS = [
  "cited answers.",
  "audio podcasts.",
  "mind maps.",
  "study guides.",
  "flashcards.",
];

const MARQUEE_ROW_1 = [
  "SEMANTIC CHUNKING",
  "CONTEXTUAL EMBEDDINGS",
  "QUERY EXPANSION",
  "LLM RERANKING",
  "HNSW INDEX",
  "DEEP RESEARCH",
  "AUDIO OVERVIEW",
  "MIND MAPS",
  "FLASHCARDS",
  "QUIZZES",
];

const MARQUEE_ROW_2 = [
  "PGVECTOR",
  "GEMINI 2.5 FLASH",
  "DEEPGRAM TTS",
  "NEON SERVERLESS",
  "BETTER AUTH",
  "DRIZZLE ORM",
  "NEXT.JS 16",
  "VERCEL",
  "TRPC",
  "TAILWIND CSS",
];

const STATS = [
  {
    target: 50000,
    decimal: 0,
    prefix: "",
    label: "Sources embedded",
    spark: "0,18 8,14 16,16 24,8 32,10 40,4 48,6",
  },
  {
    target: 8000,
    decimal: 0,
    prefix: "",
    label: "Notebooks created",
    spark: "0,16 8,12 16,14 24,6 32,8 40,2 48,4",
  },
  {
    target: 99.2,
    decimal: 1,
    prefix: "",
    label: "Citation accuracy %",
    spark: "0,10 12,8 24,6 36,4 48,3",
  },
  {
    target: 0.5,
    decimal: 1,
    prefix: "<",
    label: "Retrieval latency (s)",
    spark: "0,16 12,10 24,6 36,4 48,3",
  },
];

const RAG_ROWS = [
  {
    icon: "search",
    color: "var(--landing-pop)",
    tagClass: "t-pop",
    tag: "QUERY",
    text: '"biomarkers treatment response"',
    delay: 0,
  },
  {
    icon: "alt_route",
    color: "var(--landing-teal)",
    tagClass: "t-teal",
    tag: "EXPAND",
    text: "3 semantic variations",
    delay: 200,
  },
  {
    icon: "filter_alt",
    color: "var(--landing-amber)",
    tagClass: "t-amber",
    tag: "RANK",
    text: "24 chunks → top 8",
    delay: 400,
  },
  {
    icon: "verified",
    color: "#34d399",
    tagClass: "t-green",
    tag: "CITE",
    text: "Every claim → exact source",
    delay: 600,
  },
];

const GANTT_ROWS = [
  { label: "PLAN", color: "var(--landing-teal)", w: "30%", time: "2s" },
  { label: "SEARCH", color: "var(--landing-blue)", w: "55%", time: "8s" },
  { label: "SCORE", color: "var(--landing-amber)", w: "25%", time: "3s" },
  { label: "READ", color: "var(--landing-rose)", w: "70%", time: "15s" },
  { label: "WRITE", color: "var(--landing-purple)", w: "85%", time: "25s" },
  { label: "VERIFY", color: "#34d399", w: "40%", time: "6s" },
];

const TOOLS = [
  { icon: "account_tree", label: "Mind Map", color: "#818cf8", preview: "Nodes · Branches\nClick to explore", span: false },
  { icon: "quiz", label: "Quiz", color: "#fb923c", preview: "10 questions\nAI study summary", span: false },
  { icon: "style", label: "Flashcards", color: "#f472b6", preview: "Flip cards\nArrow key nav", span: false },
  { icon: "menu_book", label: "Study Guide", color: "var(--landing-blue)", preview: "Key concepts\nReview questions", span: false },
  { icon: "timeline", label: "Timeline", color: "var(--landing-teal)", preview: "Chronological\nKey events", span: false },
  { icon: "help", label: "FAQ", color: "var(--landing-amber)", preview: "15 questions\nDetailed answers", span: false },
  { icon: "description", label: "Briefing Document", color: "#34d399", preview: "Executive summary · Findings · Actions", span: true },
];

const TESTIMONIALS = [
  { q: "“It replaced a week of reading with a single afternoon. Every answer is sourced — I can trace every claim to the exact page.”", name: "Adaeze O.", initials: "AO", role: "PhD, Computational Biology" },
  { q: "“The audio overview is incredible. I listen to papers as podcasts on my commute. Sounds like experts, not robots.”", name: "Marcus K.", initials: "MK", role: "Postdoc, Molecular Medicine" },
  { q: "“Deep Research plans queries, finds papers, reads them, writes a cited report. Days of work in minutes.”", name: "Sofia L.", initials: "SL", role: "Research Lead, Public Health" },
  { q: "“The mind map feature transformed how I organize literature reviews. Click a node and it explains the concept.”", name: "James W.", initials: "JW", role: "Professor, Neuroscience" },
  { q: "“I generated a quiz and it caught gaps in my understanding I didn’t know I had. The AI study summary was spot-on.”", name: "Riya P.", initials: "RP", role: "Medical Student, Year 3" },
];

const DEMO_AI_HTML =
  'The <strong>metabolome</strong> is the top predictor of the cervicovaginal microenvironment <span class="d-cite">1</span><span class="d-cite">6</span>. Key biomarkers include <strong>P16</strong> and <strong>Ki-67</strong> for early detection <span class="d-cite">2</span>, with novel markers from integrated genomic and proteomic data <span class="d-cite">3</span>.<span class="d-cursor"></span>';

const PIPELINE_STEPS = [
  { text: "✓ Query expanded (3 variations)", cls: "done", delay: 800 },
  { text: "✓ 24 chunks retrieved via HNSW", cls: "done", delay: 1400 },
  { text: "✓ Reranked → top 8 by relevance", cls: "done", delay: 2000 },
  { text: "● Streaming cited response...", cls: "active", delay: 2400 },
];

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function LandingView() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Hero rotating words
  const [wordIndex, setWordIndex] = useState(0);
  const [prevWordIndex, setPrevWordIndex] = useState<number | null>(null);
  const rotateRef = useRef<HTMLSpanElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Scroll state
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackTop, setShowBackTop] = useState(false);

  // Cursor glow
  const cursorGlowRef = useRef<HTMLDivElement>(null);

  // Typing animation
  const aiMsgRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);

  // Waveform
  const waveBarsRef = useRef<HTMLDivElement>(null);
  const [waveIsPlaying, setWaveIsPlaying] = useState(false);
  const waveProgressRef = useRef(0);
  const waveFillRef = useRef<HTMLDivElement>(null);
  const waveThumbRef = useRef<HTMLDivElement>(null);
  const waveTimeRef = useRef<HTMLSpanElement>(null);
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stat counters
  const numbersRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  /* --- Scroll handling --- */
  useEffect(() => {
    function onScroll() {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(h > 0 ? (window.scrollY / h) * 100 : 0);
      setScrolled(window.scrollY > 50);
      setShowBackTop(window.scrollY > 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* --- Cursor glow --- */
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (cursorGlowRef.current) {
        cursorGlowRef.current.style.left = e.clientX + "px";
        cursorGlowRef.current.style.top = e.clientY + "px";
      }
    }
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  /* --- Hero rotating words --- */
  useEffect(() => {
    // Set initial width
    if (rotateRef.current && wordRefs.current[0]) {
      const el = wordRefs.current[0];
      if (el) {
        rotateRef.current.style.width = el.offsetWidth + "px";
      }
    }

    const iv = setInterval(() => {
      setWordIndex((prev) => {
        setPrevWordIndex(prev);
        const next = (prev + 1) % ROTATING_WORDS.length;
        // Set width for new word
        if (rotateRef.current && wordRefs.current[next]) {
          const el = wordRefs.current[next];
          if (el) {
            // Temporarily measure
            const origStyle = el.style.cssText;
            el.style.cssText =
              "position:absolute;visibility:hidden;opacity:1;transform:none;white-space:nowrap";
            const width = el.offsetWidth;
            el.style.cssText = origStyle;
            rotateRef.current.style.width = width + "px";
          }
        }
        // Clear prevWordIndex after transition
        setTimeout(() => setPrevWordIndex(null), 1200);
        return next;
      });
    }, 4500);
    return () => clearInterval(iv);
  }, []);

  /* --- Typing animation --- */
  useEffect(() => {
    const msg = aiMsgRef.current;
    const pipe = pipelineRef.current;
    if (!msg || !pipe) return;

    // Pipeline steps
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    PIPELINE_STEPS.forEach((s, i) => {
      timeouts.push(
        setTimeout(() => {
          const sp = document.createElement("span");
          sp.className = s.cls === "done" ? "text-[var(--landing-pop)]" : "text-[var(--landing-purple)] animate-pulse";
          sp.innerHTML = s.text;
          sp.style.opacity = "0";
          sp.style.animation = "stepIn 0.3s ease forwards";
          if (i > 0) pipe.appendChild(document.createElement("br"));
          pipe.appendChild(sp);
        }, s.delay)
      );
    });

    // Typing
    let charIdx = 0;
    const htmlStr = DEMO_AI_HTML;
    function typeChar() {
      if (!msg) return;
      if (charIdx <= htmlStr.length) {
        let nextIdx = charIdx;
        if (htmlStr[charIdx] === "<") {
          nextIdx = htmlStr.indexOf(">", charIdx) + 1;
        } else {
          nextIdx = charIdx + 1;
        }
        msg.innerHTML = htmlStr.slice(0, nextIdx);
        charIdx = nextIdx;
        const delay = htmlStr[charIdx - 1] === ">" ? 5 : 25 + Math.random() * 18;
        timeouts.push(setTimeout(typeChar, delay));
      }
    }
    timeouts.push(setTimeout(typeChar, 2800));

    return () => timeouts.forEach(clearTimeout);
  }, []);

  /* --- Waveform bars --- */
  useEffect(() => {
    const container = waveBarsRef.current;
    if (!container) return;
    for (let i = 0; i < 60; i++) {
      const b = document.createElement("div");
      b.className = "wave-bar";
      const h = Math.random() * 18 + 4;
      b.style.cssText = `--h:${h}px;height:${Math.random() * 8 + 2}px;animation-delay:${Math.random() * 1.2}s;animation-duration:${0.6 + Math.random() * 0.8}s;animation-play-state:paused;background:var(--landing-pop)`;
      container.appendChild(b);
    }
  }, []);

  /* --- Stat counters via IntersectionObserver --- */
  useEffect(() => {
    const container = numbersRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          const target = parseFloat(el.dataset.target || "0");
          const decimal = parseInt(el.dataset.decimal || "0");
          const prefix = el.dataset.prefix || "";
          let current = 0;
          const step = target / 60;

          function tick() {
            current += step;
            if (current >= target) {
              current = target;
              if (target >= 1000) el.textContent = prefix + (target / 1000).toFixed(0) + "K+";
              else el.textContent = prefix + current.toFixed(decimal) + (decimal && target > 1 ? "%" : "");
              return;
            }
            if (target >= 1000) el.textContent = prefix + Math.floor(current / 1000) + "K+";
            else el.textContent = prefix + current.toFixed(decimal);
            requestAnimationFrame(tick);
          }
          tick();
          observer.unobserve(el);
        });
      },
      { threshold: 0.5 }
    );

    container.querySelectorAll("[data-target]").forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  /* --- Scroll reveal IntersectionObserver --- */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("vis");
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll(".landing-reveal,.step-card,.rag-row").forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [mounted]);

  /* --- Gantt bar animation --- */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.querySelectorAll(".gantt-bar-wrap").forEach((w, i) => {
            setTimeout(() => w.classList.add("vis"), i * 200);
          });
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.3 }
    );
    document.querySelectorAll(".gantt-container").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [mounted]);

  /* --- RAG row animation --- */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.querySelectorAll(".rag-row").forEach((r) => {
            const delay = parseInt((r as HTMLElement).dataset.delay || "0");
            setTimeout(() => r.classList.add("vis"), delay);
          });
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.3 }
    );
    document.querySelectorAll(".rag-col").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [mounted]);

  /* --- Keyboard shortcut --- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "s" || e.key === "S") && !(e.target instanceof HTMLInputElement)) {
        window.location.href = "/auth/sign-up";
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* --- Wave play toggle --- */
  const toggleWave = useCallback(() => {
    const playing = !waveIsPlaying;
    setWaveIsPlaying(playing);
    waveBarsRef.current?.querySelectorAll(".wave-bar").forEach((b) => {
      (b as HTMLElement).style.animationPlayState = playing ? "running" : "paused";
    });
    if (playing) {
      waveIntervalRef.current = setInterval(() => {
        waveProgressRef.current += 0.2;
        if (waveProgressRef.current > 100) waveProgressRef.current = 0;
        const p = waveProgressRef.current;
        if (waveFillRef.current) waveFillRef.current.style.width = p + "%";
        if (waveThumbRef.current) waveThumbRef.current.style.left = p + "%";
        const s = Math.floor((p / 100) * 527);
        if (waveTimeRef.current)
          waveTimeRef.current.textContent = Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
      }, 200);
    } else {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);
    }
  }, [waveIsPlaying]);

  /* --- Ripple on button click --- */
  const handleRipple = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.style.cssText = `position:absolute;border-radius:50%;background:rgba(255,255,255,0.3);transform:scale(0);animation:ripple 0.6s ease-out forwards;pointer-events:none;left:${e.clientX - rect.left}px;top:${e.clientY - rect.top}px;width:${Math.max(rect.width, rect.height) * 2}px;height:${Math.max(rect.width, rect.height) * 2}px;`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <div
      className="min-h-screen overflow-x-hidden landing-grain"
      style={{
        background: "var(--landing-bg)",
        color: "var(--landing-ink)",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        transition: "background 0.3s, color 0.3s",
      }}
    >
      <ConstellationBackground />

      {/* Cursor glow */}
      <div
        ref={cursorGlowRef}
        className="fixed w-[500px] h-[500px] rounded-full pointer-events-none z-[2] opacity-0 hover-parent-glow"
        style={{
          background: "radial-gradient(circle, var(--landing-pop-glow), transparent 70%)",
          transform: "translate(-50%, -50%)",
          transition: "opacity 0.3s",
        }}
      />

      {/* Scroll progress bar */}
      <div
        className="fixed top-0 left-0 h-[2px] z-[200]"
        style={{
          background: "var(--landing-pop)",
          width: scrollProgress + "%",
        }}
      />

      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-[100] transition-all duration-300"
        style={{
          borderBottom: "1px solid var(--landing-line)",
          backdropFilter: scrolled ? "blur(20px) saturate(1.6)" : "blur(8px)",
          background: scrolled ? "var(--landing-nav-bg-s)" : "var(--landing-nav-bg)",
        }}
      >
        <div
          className="mx-auto flex items-center justify-between"
          style={{ maxWidth: 1400, padding: "0 40px", height: 56 }}
        >
          <Link href="/" className="flex items-center gap-2.5 hover:scale-[1.03] transition-transform">
            <div
              className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center"
              style={{ background: "var(--landing-pop)" }}
            >
              <span className="material-symbols-outlined icon-filled" style={{ fontSize: 14, color: "white" }}>
                book_2
              </span>
            </div>
            <span
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "-0.02em",
              }}
            >
              NotebookLM
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="#"
              className="text-[13px] px-3.5 py-[7px] rounded-[6px] transition-colors hidden md:inline-block"
              style={{ color: "var(--landing-mid)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--landing-ink)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--landing-mid)")}
            >
              Features
            </Link>
            <Link
              href="#"
              className="text-[13px] px-3.5 py-[7px] rounded-[6px] transition-colors hidden md:inline-block"
              style={{ color: "var(--landing-mid)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--landing-ink)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--landing-mid)")}
            >
              Docs
            </Link>
            <a
              href="https://github.com/hallelx2/notebooklm-web"
              target="_blank"
              rel="noreferrer"
              className="text-[13px] px-3.5 py-[7px] rounded-[6px] transition-colors hidden md:inline-block"
              style={{ color: "var(--landing-mid)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--landing-ink)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--landing-mid)")}
            >
              GitHub
            </a>
            <Link
              href="/auth/sign-in"
              className="text-[13px] px-3.5 py-[7px] rounded-[6px] transition-colors hidden md:inline-block"
              style={{ color: "var(--landing-mid)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--landing-ink)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--landing-mid)")}
            >
              Sign in
            </Link>
            <ThemeToggle className="!w-8 !h-8 !rounded-[6px]" />
            <Link
              href="/auth/sign-up"
              className="text-[12px] font-semibold px-[18px] py-[7px] rounded-[6px] transition-all hover:-translate-y-px"
              style={{
                background: "var(--landing-pop)",
                color: "white",
              }}
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ==================== HERO ==================== */}
      <section className="relative z-10 mx-auto" style={{ maxWidth: 1400, padding: "130px 40px 0" }}>
        <div className="text-center mb-14">
          {/* Tag */}
          <div
            className="inline-flex items-center gap-2 mb-8"
            style={{
              fontFamily: "'Azeret Mono', monospace",
              fontSize: 10,
              color: "var(--landing-mid)",
              letterSpacing: "0.08em",
              border: "1px solid var(--landing-line)",
              borderRadius: 4,
              padding: "5px 12px",
              animation: "fadeIn 0.7s ease both",
            }}
          >
            <span
              className="w-[5px] h-[5px] rounded-full"
              style={{ background: "var(--landing-pop)", animation: "landingPulse 2s infinite" }}
            />
            PUBLIC PREVIEW v0.2
          </div>

          {/* H1 */}
          <h1
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(44px, 6.5vw, 82px)",
              lineHeight: 0.98,
              letterSpacing: "-0.04em",
              animation: "fadeIn 0.7s ease 0.1s both",
            }}
          >
            Upload. Ask.
            <br />
            Get{" "}
            <span
              ref={rotateRef}
              className="hero-rotate"
              style={{ color: "var(--landing-pop)" }}
            >
              {ROTATING_WORDS.map((w, i) => (
                <span
                  key={w}
                  ref={(el) => { wordRefs.current[i] = el; }}
                  className={`word ${i === wordIndex ? "active" : ""} ${i === prevWordIndex ? "out" : ""}`}
                >
                  {w}
                </span>
              ))}
            </span>
          </h1>

          {/* Sub */}
          <p
            className="mt-6 mx-auto"
            style={{
              fontSize: 16,
              lineHeight: 1.75,
              color: "var(--landing-mid)",
              maxWidth: 520,
              animation: "fadeIn 0.7s ease 0.2s both",
            }}
          >
            Drop in any source. Every answer traces back to the exact passage.
            Then transform your research into anything you need.
          </p>

          {/* CTAs */}
          <div
            className="mt-8 flex items-center justify-center gap-2.5"
            style={{ animation: "fadeIn 0.7s ease 0.3s both" }}
          >
            <Link href="/auth/sign-up">
              <button
                className="inline-flex items-center gap-2 px-[26px] py-3 rounded-lg text-sm font-semibold cursor-pointer relative overflow-hidden transition-all hover:-translate-y-0.5"
                style={{
                  background: "var(--landing-pop)",
                  color: "white",
                  border: "none",
                  boxShadow: "0 0 28px var(--landing-pop-glow), 0 2px 8px rgba(0,0,0,0.3)",
                }}
                onClick={handleRipple}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  arrow_forward
                </span>
                Start free
              </button>
            </Link>
            <a
              href="https://github.com/hallelx2/notebooklm-web"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-[26px] py-3 rounded-lg text-sm font-medium transition-colors"
              style={{
                border: "1px solid var(--landing-line)",
                color: "var(--landing-ink)",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--landing-line-h)";
                e.currentTarget.style.background = "var(--landing-card)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--landing-line)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              View on GitHub
            </a>
          </div>

          {/* Kbd hint */}
          <div
            className="mt-4 hidden md:block"
            style={{
              fontFamily: "'Azeret Mono', monospace",
              fontSize: 10,
              color: "var(--landing-dim)",
              animation: "fadeIn 0.7s ease 0.5s both",
            }}
          >
            Press{" "}
            <kbd
              className="inline-block px-1.5 py-0.5 mx-0.5"
              style={{
                border: "1px solid var(--landing-line)",
                borderRadius: 3,
                background: "var(--landing-card)",
                fontSize: 10,
              }}
            >
              S
            </kbd>{" "}
            to start
          </div>
        </div>

        {/* ==================== PRODUCT DEMO ==================== */}
        <div
          className="mx-auto"
          style={{
            maxWidth: 1100,
            animation: "fadeIn 1s ease 0.5s both",
            perspective: 1000,
          }}
        >
          <div
            className="relative z-[1] rounded-[14px] overflow-hidden transition-transform duration-500"
            style={{
              background: "var(--landing-bg2)",
              border: "1px solid var(--landing-line)",
              boxShadow: isDark
                ? "0 60px 120px -20px rgba(0,0,0,0.7), 0 0 80px var(--landing-pop-glow)"
                : "0 60px 120px -20px rgba(0,0,0,0.35), 0 0 60px var(--landing-pop-glow)",
              transform: "rotateX(2deg)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "rotateX(0) scale(1.003)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "rotateX(2deg)")}
          >
            {/* Window bar */}
            <div
              className="flex items-center h-[34px] px-3.5 gap-1.5"
              style={{
                borderBottom: "1px solid var(--landing-line)",
                background: "var(--landing-surface)",
              }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: "#ff5f57" }} />
              <div className="w-2 h-2 rounded-full" style={{ background: "#febc2e" }} />
              <div className="w-2 h-2 rounded-full" style={{ background: "#28c840" }} />
              <div
                className="flex-1 text-center"
                style={{
                  fontFamily: "'Azeret Mono', monospace",
                  fontSize: 10,
                  color: "var(--landing-dim)",
                }}
              >
                notebooklm-web.vercel.app/notebooks/multi-omics
              </div>
            </div>

            {/* Demo body */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_200px] min-h-[400px]">
              {/* Sources col */}
              <div className="p-[18px] text-[12px] border-b md:border-b-0 md:border-r" style={{ borderColor: "var(--landing-line)" }}>
                <div
                  className="flex items-center gap-1.5 mb-3.5"
                  style={{
                    fontFamily: "'Azeret Mono', monospace",
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: "var(--landing-dim)",
                  }}
                >
                  Sources
                  <span className="flex-1 h-px" style={{ background: "var(--landing-line)" }} />
                </div>
                {[
                  { icon: "description", name: "Cervical_Cancer.pdf", hl: true, delay: "0.8s" },
                  { icon: "link", name: "frontiersin.org", hl: false, delay: "1.0s" },
                  { icon: "link", name: "pubmed.ncbi.nlm", hl: false, delay: "1.2s" },
                  { icon: "description", name: "Multi-Omics.pdf", hl: false, delay: "1.4s" },
                ].map((s) => (
                  <div
                    key={s.name}
                    className={`flex items-center gap-[7px] px-2 py-1.5 rounded-[6px] mb-[3px] text-[11px] transition-colors ${s.hl ? "" : ""}`}
                    style={{
                      color: "var(--landing-mid)",
                      background: s.hl ? "var(--landing-tag-bg)" : "transparent",
                      opacity: 0,
                      transform: "translateX(-8px)",
                      animation: `srcIn 0.3s ease ${s.delay} forwards`,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--landing-pop)" }}>
                      {s.icon}
                    </span>
                    <span>{s.name}</span>
                  </div>
                ))}
                <div
                  className="mt-2.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[10px]"
                  style={{
                    border: "1px dashed rgba(45,212,191,0.2)",
                    color: "var(--landing-teal)",
                    opacity: 0,
                    animation: "srcIn 0.3s ease 1.5s forwards",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    science
                  </span>
                  Deep Research
                </div>
              </div>

              {/* Chat col */}
              <div className="p-[18px] md:px-6" style={{ fontSize: 12 }}>
                <div
                  className="flex items-center gap-1.5 mb-3.5"
                  style={{
                    fontFamily: "'Azeret Mono', monospace",
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: "var(--landing-dim)",
                  }}
                >
                  Chat
                  <span className="flex-1 h-px" style={{ background: "var(--landing-line)" }} />
                </div>
                <div
                  className="px-3.5 py-2.5 rounded-xl mb-3 max-w-[88%] text-[12px]"
                  style={{
                    background: "var(--landing-tag-bg)",
                    border: "1px solid rgba(123,143,239,0.08)",
                    color: "var(--landing-ink)",
                    lineHeight: 1.5,
                  }}
                >
                  What biomarkers predict treatment response?
                </div>
                <div
                  ref={aiMsgRef}
                  className="px-3.5 py-3 rounded-xl max-w-[95%] min-h-[80px] text-[12px]"
                  style={{
                    background: "var(--landing-surface)",
                    border: "1px solid var(--landing-line)",
                    color: "var(--landing-mid)",
                    lineHeight: 1.7,
                  }}
                />
                <div
                  ref={pipelineRef}
                  className="mt-3.5 px-3 py-2.5 rounded-lg"
                  style={{
                    background: "var(--landing-tag-bg)",
                    border: "1px solid rgba(123,143,239,0.05)",
                    fontFamily: "'Azeret Mono', monospace",
                    fontSize: 9,
                    lineHeight: 2,
                  }}
                />
              </div>

              {/* Studio col */}
              <div className="p-[18px] text-[12px] border-t md:border-t-0 md:border-l" style={{ borderColor: "var(--landing-line)" }}>
                <div
                  className="flex items-center gap-1.5 mb-3.5"
                  style={{
                    fontFamily: "'Azeret Mono', monospace",
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: "var(--landing-dim)",
                  }}
                >
                  Studio
                  <span className="flex-1 h-px" style={{ background: "var(--landing-line)" }} />
                </div>
                {[
                  { icon: "headphones", label: "Audio Overview", hl: true, filled: true },
                  { icon: "account_tree", label: "Mind Map", hl: false, filled: false },
                  { icon: "quiz", label: "Quiz", hl: false, filled: false },
                  { icon: "style", label: "Flashcards", hl: false, filled: false },
                  { icon: "menu_book", label: "Study Guide", hl: false, filled: false },
                  { icon: "timeline", label: "Timeline", hl: false, filled: false },
                ].map((t) => (
                  <div
                    key={t.label}
                    className="flex items-center gap-[7px] px-[9px] py-[7px] rounded-[6px] mb-1 text-[11px] transition-colors"
                    style={{
                      border: t.hl ? "1px solid rgba(123,143,239,0.12)" : "1px solid var(--landing-line)",
                      background: t.hl ? "var(--landing-tag-bg)" : "transparent",
                      color: "var(--landing-mid)",
                    }}
                  >
                    <span
                      className={`material-symbols-outlined ${t.filled ? "icon-filled" : ""}`}
                      style={{
                        fontSize: 14,
                        color: t.hl ? "var(--landing-pop)" : "var(--landing-dim)",
                      }}
                    >
                      {t.icon}
                    </span>
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hero fade */}
      <div
        className="h-[100px] -mt-[100px] relative z-[11] pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent, var(--landing-bg))" }}
      />

      {/* ==================== DOUBLE MARQUEE ==================== */}
      <div
        className="relative z-10 overflow-hidden py-2.5"
        style={{
          borderTop: "1px solid var(--landing-line)",
          borderBottom: "1px solid var(--landing-line)",
        }}
      >
        <div className="marquee-row" style={{ color: "var(--landing-dim)" }}>
          <div className="inner">
            {[...MARQUEE_ROW_1, ...MARQUEE_ROW_1].map((item, i) => (
              <span key={i}>
                <span className="px-[18px] transition-colors hover:text-[var(--landing-pop)]">{item}</span>
                <span className="sep" style={{ color: "var(--landing-pop)" }}>/</span>
              </span>
            ))}
          </div>
        </div>
        <div className="marquee-row" style={{ color: "var(--landing-dim)" }}>
          <div className="inner">
            {[...MARQUEE_ROW_2, ...MARQUEE_ROW_2].map((item, i) => (
              <span key={i}>
                <span className="px-[18px] transition-colors hover:text-[var(--landing-pop)]">{item}</span>
                <span className="sep" style={{ color: "var(--landing-pop)" }}>/</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ==================== STATS ==================== */}
      <div
        ref={numbersRef}
        className="relative z-10 mx-auto mt-20 landing-reveal grid overflow-hidden"
        style={{
          maxWidth: 1100,
          padding: "0 40px",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "var(--landing-line)",
          borderRadius: 10,
          border: "1px solid var(--landing-line)",
        }}
      >
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="text-center transition-colors"
            style={{
              background: "var(--landing-bg)",
              padding: "36px 20px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--landing-bg2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--landing-bg)")}
          >
            <div className="flex items-center justify-center gap-3">
              <div
                className="relative"
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                  color: "var(--landing-pop)",
                }}
              >
                <span
                  data-target={stat.target}
                  data-decimal={stat.decimal}
                  data-prefix={stat.prefix}
                >
                  0
                </span>
                <span
                  className="absolute inset-0 rounded"
                  style={{
                    background: "linear-gradient(90deg, transparent, var(--landing-pop-glow), transparent)",
                    animation: "landingShimmer 3s ease-in-out infinite",
                  }}
                />
              </div>
              <svg className="w-12 h-5" viewBox="0 0 48 20">
                <polyline
                  points={stat.spark}
                  fill="none"
                  stroke="var(--landing-pop)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.35"
                />
              </svg>
            </div>
            <div
              className="mt-1.5"
              style={{
                fontSize: 10,
                color: "var(--landing-dim)",
                fontFamily: "'Azeret Mono', monospace",
                letterSpacing: "0.04em",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* ==================== FEATURE: RAG ==================== */}
      <section className="relative z-10 mx-auto" style={{ maxWidth: 1100, padding: "140px 40px" }}>
        <div className="grid md:grid-cols-2 gap-16 items-center landing-reveal">
          <div>
            <div
              className="mb-2.5"
              style={{
                fontFamily: "'Azeret Mono', monospace",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "var(--landing-pop)",
              }}
            >
              INTELLIGENCE
            </div>
            <h2
              className="mb-4"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: "clamp(26px, 3vw, 38px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
              }}
            >
              Not keyword search.
              <br />
              Actual understanding.
            </h2>
            <p className="text-[13px] leading-[1.8] max-w-[400px]" style={{ color: "var(--landing-mid)" }}>
              Semantic chunking preserves paragraphs. Contextual embeddings know
              the source. Query expansion catches what you meant. LLM reranking
              scores real relevance.
            </p>
          </div>
          <div
            className="rounded-[10px] p-[22px] relative overflow-hidden transition-all"
            style={{
              border: "1px solid var(--landing-line)",
              background: "var(--landing-card)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-line-h)";
              e.currentTarget.style.boxShadow = "0 0 40px var(--landing-pop-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-line)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div className="rag-col relative pl-6">
              <div
                className="absolute left-[11px] top-4 bottom-4 w-px"
                style={{
                  background: "linear-gradient(to bottom, var(--landing-pop), var(--landing-teal), var(--landing-amber), #34d399)",
                  opacity: 0.15,
                }}
              />
              {RAG_ROWS.map((row) => (
                <div
                  key={row.tag}
                  className="rag-row flex items-center gap-2.5 px-3 py-[9px] rounded-[6px] mb-[5px] transition-colors"
                  data-delay={row.delay}
                  style={{
                    border: "1px solid var(--landing-line)",
                    fontFamily: "'Azeret Mono', monospace",
                    fontSize: 10,
                    color: "var(--landing-dim)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--landing-line-h)";
                    e.currentTarget.style.background = "var(--landing-surface)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--landing-line)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: row.color }}>
                    {row.icon}
                  </span>
                  <span
                    className="inline-block px-[7px] py-[2px] rounded-[3px] text-[8px] font-semibold uppercase tracking-wide"
                    style={{
                      background:
                        row.tagClass === "t-pop"
                          ? "var(--landing-tag-bg)"
                          : row.tagClass === "t-teal"
                          ? "rgba(45,212,191,0.1)"
                          : row.tagClass === "t-amber"
                          ? "rgba(251,191,36,0.1)"
                          : "rgba(52,211,153,0.1)",
                      color: row.color,
                    }}
                  >
                    {row.tag}
                  </span>
                  {row.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FEATURE: DEEP RESEARCH ==================== */}
      <section className="relative z-10 mx-auto" style={{ maxWidth: 1100, padding: "0 40px 140px" }}>
        <div className="grid md:grid-cols-2 gap-16 items-center landing-reveal" style={{ direction: "rtl" }}>
          <div style={{ direction: "ltr" }}>
            <div
              className="mb-2.5"
              style={{
                fontFamily: "'Azeret Mono', monospace",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "var(--landing-teal)",
              }}
            >
              AGENT
            </div>
            <h2
              className="mb-4"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: "clamp(26px, 3vw, 38px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
              }}
            >
              It reads so you
              <br />
              don&apos;t have to.
            </h2>
            <p className="text-[13px] leading-[1.8] max-w-[400px]" style={{ color: "var(--landing-mid)" }}>
              Plans sub-questions. Searches in parallel. Scores sources. Reads
              pages. Writes section-by-section. Self-critiques and fills gaps.
            </p>
          </div>
          <div
            className="rounded-[10px] p-[22px] relative overflow-hidden transition-all"
            style={{
              direction: "ltr",
              border: "1px solid var(--landing-line)",
              background: "var(--landing-card)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-line-h)";
              e.currentTarget.style.boxShadow = "0 0 40px var(--landing-pop-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-line)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div className="gantt-container" style={{ fontFamily: "'Azeret Mono', monospace", fontSize: 10 }}>
              {GANTT_ROWS.map((row) => (
                <div key={row.label} className="flex items-center gap-2 py-1.5">
                  <div className="w-[70px] shrink-0 text-right" style={{ color: row.color }}>
                    {row.label}
                  </div>
                  <div
                    className="gantt-bar-wrap flex-1 h-4 rounded-[3px] overflow-hidden"
                    style={{ background: "var(--landing-surface)", "--w": row.w } as React.CSSProperties}
                  >
                    <div className="gantt-bar" style={{ background: row.color }} />
                  </div>
                  <div className="text-[9px] w-7 shrink-0" style={{ color: "var(--landing-dim)" }}>
                    {row.time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FEATURE: AUDIO ==================== */}
      <section className="relative z-10 mx-auto" style={{ maxWidth: 1100, padding: "0 40px 140px" }}>
        <div className="grid md:grid-cols-2 gap-16 items-center landing-reveal">
          <div>
            <div
              className="mb-2.5"
              style={{
                fontFamily: "'Azeret Mono', monospace",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "var(--landing-purple)",
              }}
            >
              STUDIO
            </div>
            <h2
              className="mb-4"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: "clamp(26px, 3vw, 38px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
              }}
            >
              Your research,
              <br />
              as a podcast.
            </h2>
            <p className="text-[13px] leading-[1.8] max-w-[400px]" style={{ color: "var(--landing-mid)" }}>
              Two AI hosts discuss your sources naturally. Deepgram neural
              voices. Choose episode length. Focus on specific topics.
            </p>
          </div>
          <div
            className="rounded-[10px] p-[22px] relative overflow-hidden transition-all"
            style={{
              border: "1px solid var(--landing-line)",
              background: "var(--landing-card)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-line-h)";
              e.currentTarget.style.boxShadow = "0 0 40px var(--landing-pop-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-line)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* Speakers */}
            <div className="flex items-start gap-2.5 py-[7px]">
              <div
                className="w-2 h-2 rounded-full mt-[5px] shrink-0"
                style={{ background: "var(--landing-pop)" }}
              />
              <div>
                <div
                  style={{
                    fontFamily: "'Azeret Mono', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--landing-ink)",
                  }}
                >
                  ALEX
                </div>
                <div className="text-[11px] italic mt-0.5" style={{ color: "var(--landing-mid)" }}>
                  &quot;The metabolome emerged as the top predictor...&quot;
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 py-[7px]">
              <div
                className="w-2 h-2 rounded-full mt-[5px] shrink-0"
                style={{ background: "var(--landing-purple)" }}
              />
              <div>
                <div
                  style={{
                    fontFamily: "'Azeret Mono', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--landing-ink)",
                  }}
                >
                  SAM
                </div>
                <div className="text-[11px] italic mt-0.5" style={{ color: "var(--landing-mid)" }}>
                  &quot;Wait — so it outperforms genomics alone?&quot;
                </div>
              </div>
            </div>

            {/* Waveform player */}
            <div
              className="flex items-center gap-3 mt-3.5 p-3 rounded-lg"
              style={{
                background: "var(--landing-tag-bg)",
                border: "1px solid rgba(123,143,239,0.04)",
              }}
            >
              <button
                onClick={toggleWave}
                className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                style={{
                  background: "var(--landing-pop)",
                  boxShadow: "0 0 16px var(--landing-pop-glow)",
                }}
              >
                <span className="material-symbols-outlined icon-filled" style={{ fontSize: 18, color: "white" }}>
                  {waveIsPlaying ? "pause" : "play_arrow"}
                </span>
              </button>
              <div className="flex-1">
                <div
                  ref={waveBarsRef}
                  className="flex items-end gap-[1.5px] h-6"
                />
                <div
                  className="h-[3px] rounded-sm mt-1.5 relative cursor-pointer"
                  style={{ background: "var(--landing-surface)" }}
                >
                  <div
                    ref={waveFillRef}
                    className="h-full rounded-sm"
                    style={{ background: "var(--landing-pop)", width: "0%" }}
                  />
                  <div
                    ref={waveThumbRef}
                    className="absolute -top-[3px] w-[9px] h-[9px] rounded-full"
                    style={{
                      background: "var(--landing-pop)",
                      left: "0%",
                      transform: "translateX(-50%)",
                      boxShadow: "0 0 6px var(--landing-pop-glow)",
                    }}
                  />
                </div>
                <div
                  className="flex justify-between mt-1"
                  style={{
                    fontFamily: "'Azeret Mono', monospace",
                    fontSize: 10,
                    color: "var(--landing-dim)",
                  }}
                >
                  <span ref={waveTimeRef}>0:00</span>
                  <span>8:47</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FEATURE: TOOLS ==================== */}
      <section className="relative z-10 mx-auto" style={{ maxWidth: 1100, padding: "0 40px 140px" }}>
        <div className="grid md:grid-cols-2 gap-16 items-center landing-reveal" style={{ direction: "rtl" }}>
          <div style={{ direction: "ltr" }}>
            <div
              className="mb-2.5"
              style={{
                fontFamily: "'Azeret Mono', monospace",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "var(--landing-amber)",
              }}
            >
              TRANSFORM
            </div>
            <h2
              className="mb-4"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: "clamp(26px, 3vw, 38px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
              }}
            >
              Seven tools.
              <br />
              Zero hallucinations.
            </h2>
            <p className="text-[13px] leading-[1.8] max-w-[400px]" style={{ color: "var(--landing-mid)" }}>
              Every output is from your actual sources. Interactive mind maps.
              Quizzes with AI study summaries. Flashcards with keyboard nav.
            </p>
          </div>
          <div
            className="rounded-[10px] p-[22px] relative overflow-hidden transition-all"
            style={{
              direction: "ltr",
              border: "1px solid var(--landing-line)",
              background: "var(--landing-card)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-line-h)";
              e.currentTarget.style.boxShadow = "0 0 40px var(--landing-pop-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--landing-line)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[5px]">
              {TOOLS.map((tool) => (
                <div
                  key={tool.label}
                  className={`group flex items-center gap-[7px] px-[11px] py-[9px] rounded-[6px] text-[11px] transition-colors relative overflow-hidden cursor-default ${tool.span ? "md:col-span-2" : ""}`}
                  style={{
                    border: "1px solid var(--landing-line)",
                    color: "var(--landing-mid)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--landing-line-h)";
                    e.currentTarget.style.color = "var(--landing-ink)";
                    e.currentTarget.style.background = "var(--landing-surface)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--landing-line)";
                    e.currentTarget.style.color = "var(--landing-mid)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: tool.color }}>
                    {tool.icon}
                  </span>
                  {tool.label}
                  <span
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-right"
                    style={{
                      fontFamily: "'Azeret Mono', monospace",
                      fontSize: 7,
                      color: "var(--landing-dim)",
                      lineHeight: 1.3,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {tool.preview}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== STEPS ==================== */}
      <section className="relative z-10 mx-auto" style={{ maxWidth: 1100, padding: "0 40px 140px" }}>
        <div className="mb-14 landing-reveal">
          <div
            className="mb-2.5"
            style={{
              fontFamily: "'Azeret Mono', monospace",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "var(--landing-pop)",
            }}
          >
            HOW IT WORKS
          </div>
          <h2
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontSize: "clamp(26px, 3vw, 38px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
            }}
          >
            Three steps. No magic.
          </h2>
        </div>
        <div
          className="grid md:grid-cols-3 overflow-hidden"
          style={{
            gap: 1,
            background: "var(--landing-line)",
            borderRadius: 10,
            border: "1px solid var(--landing-line)",
          }}
        >
          {[
            {
              n: "01",
              icon: "upload_file",
              title: "Bring your sources",
              body: "PDFs, links, or let Deep Research find them. Semantic chunking + contextual embeddings.",
            },
            {
              n: "02",
              icon: "chat",
              title: "Chat, grounded",
              body: "Every answer cites the exact chunk. Query expansion + LLM reranking for precision.",
            },
            {
              n: "03",
              icon: "auto_awesome",
              title: "Generate outputs",
              body: "Podcasts, mind maps, quizzes, flashcards — from your sources, not hallucinated.",
            },
          ].map((step, i) => (
            <div
              key={step.n}
              className={`step-card relative transition-colors`}
              style={{
                background: "var(--landing-bg)",
                padding: "40px 28px",
                transitionDelay: `${i * 0.1}s`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--landing-bg2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--landing-bg)")}
            >
              <div
                className="absolute top-4 right-5"
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 72,
                  fontWeight: 800,
                  letterSpacing: "-0.06em",
                  lineHeight: 1,
                  color: isDark ? "rgba(255,255,255,0.025)" : "var(--landing-surface)",
                }}
              >
                {step.n}
              </div>
              <div
                className="step-icon w-9 h-9 rounded-lg flex items-center justify-center mb-3.5 transition-transform"
                style={{
                  background: "var(--landing-tag-bg)",
                  border: "1px solid rgba(123,143,239,0.08)",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--landing-pop)" }}>
                  {step.icon}
                </span>
              </div>
              <h3
                className="mb-1.5"
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {step.title}
              </h3>
              <p className="text-[12px] leading-[1.65]" style={{ color: "var(--landing-mid)" }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ==================== TESTIMONIALS ==================== */}
      <section className="relative z-10 overflow-hidden" style={{ padding: "60px 0 140px" }}>
        <div className="mx-auto mb-12 landing-reveal" style={{ maxWidth: 1100, padding: "0 40px" }}>
          <div
            className="mb-2.5"
            style={{
              fontFamily: "'Azeret Mono', monospace",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "var(--landing-pop)",
            }}
          >
            TESTIMONIALS
          </div>
          <h2
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontSize: "clamp(26px, 3vw, 38px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
            }}
          >
            What researchers say.
          </h2>
        </div>
        <div className="test-track">
          {[...TESTIMONIALS, ...TESTIMONIALS].map((t, i) => (
            <div
              key={i}
              className="shrink-0 w-[360px] rounded-[10px] p-6 transition-all"
              style={{
                border: "1px solid var(--landing-line)",
                background: "var(--landing-card)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--landing-line-h)";
                e.currentTarget.style.boxShadow = "0 0 30px var(--landing-pop-glow)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--landing-line)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div className="text-[12px] tracking-widest mb-3.5" style={{ color: "var(--landing-amber)" }}>
                &#9733;&#9733;&#9733;&#9733;&#9733;
              </div>
              <p className="text-[13px] leading-[1.7] mb-4" style={{ color: "var(--landing-mid)" }}>
                {t.q}
              </p>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: "var(--landing-pop)" }}
                >
                  {t.initials}
                </div>
                <div>
                  <div className="text-[12px] font-semibold">{t.name}</div>
                  <div
                    className="text-[10px]"
                    style={{
                      color: "var(--landing-dim)",
                      fontFamily: "'Azeret Mono', monospace",
                    }}
                  >
                    {t.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ==================== CTA ==================== */}
      <section className="relative z-10 text-center overflow-hidden landing-reveal" style={{ padding: "100px 40px 140px" }}>
        {/* Floating orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute rounded-full"
            style={{
              width: 120,
              height: 120,
              top: "20%",
              left: "15%",
              background: "var(--landing-pop)",
              opacity: 0.03,
              animation: "float 8s ease-in-out infinite",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: 80,
              height: 80,
              top: "60%",
              right: "20%",
              background: "var(--landing-pop)",
              opacity: 0.03,
              animation: "float 8s ease-in-out infinite",
              animationDelay: "-3s",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: 60,
              height: 60,
              top: "30%",
              right: "10%",
              background: "var(--landing-purple)",
              opacity: 0.02,
              animation: "float 8s ease-in-out infinite",
              animationDelay: "-5s",
            }}
          />
        </div>

        <h2
          className="relative"
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: "clamp(32px, 5.5vw, 64px)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 0.95,
            marginBottom: 16,
          }}
        >
          Start your first{" "}
          <span style={{ color: "var(--landing-pop)" }}>notebook.</span>
        </h2>
        <p className="text-[15px] mb-9 relative" style={{ color: "var(--landing-mid)" }}>
          Free while in preview. No credit card.
        </p>
        <Link href="/auth/sign-up">
          <button
            className="inline-flex items-center gap-2 px-[30px] py-3.5 rounded-lg text-[15px] font-semibold cursor-pointer relative overflow-hidden transition-all hover:-translate-y-0.5"
            style={{
              background: "var(--landing-pop)",
              color: "white",
              border: "none",
              boxShadow: "0 0 28px var(--landing-pop-glow), 0 2px 8px rgba(0,0,0,0.3)",
            }}
            onClick={handleRipple}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              arrow_forward
            </span>
            Create your account
          </button>
        </Link>
      </section>

      {/* ==================== BACK TO TOP ==================== */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-7 right-7 z-[90] w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all border-none ${showBackTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2.5"}`}
        style={{
          background: "var(--landing-pop)",
          color: "white",
          boxShadow: "0 0 16px var(--landing-pop-glow)",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          arrow_upward
        </span>
      </button>

      <Footer />

      {/* Global cursor glow style */}
      <style>{`
        .landing-grain:hover #cursor-glow,
        div:hover > .hover-parent-glow {
          opacity: 1 !important;
        }
        .d-cite {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          font-size: 8px;
          font-weight: 700;
          background: var(--landing-pop-d);
          color: white;
          vertical-align: middle;
          margin: 0 1px;
        }
        .d-msg-ai strong {
          color: var(--landing-ink);
          font-weight: 600;
        }
        @media (max-width: 900px) {
          .rag-col { padding-left: 0 !important; }
          .rag-col > .absolute { display: none; }
        }
      `}</style>
    </div>
  );
}
