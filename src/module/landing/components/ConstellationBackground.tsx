// Deterministic scatter of points on a 100x100 viewBox — no RNG at render time,
// so SSR and CSR match and we avoid hydration drift.
const POINTS: { x: number; y: number; r: number }[] = [
  { x: 4, y: 11, r: 0.15 }, { x: 9, y: 24, r: 0.22 }, { x: 12, y: 6, r: 0.12 },
  { x: 18, y: 38, r: 0.28 }, { x: 22, y: 16, r: 0.14 }, { x: 25, y: 62, r: 0.18 },
  { x: 28, y: 47, r: 0.3 }, { x: 31, y: 8, r: 0.12 }, { x: 33, y: 78, r: 0.2 },
  { x: 37, y: 30, r: 0.18 }, { x: 39, y: 52, r: 0.3 }, { x: 42, y: 19, r: 0.15 },
  { x: 44, y: 84, r: 0.15 }, { x: 47, y: 66, r: 0.22 }, { x: 51, y: 35, r: 0.35 },
  { x: 54, y: 11, r: 0.14 }, { x: 57, y: 72, r: 0.25 }, { x: 60, y: 49, r: 0.3 },
  { x: 62, y: 23, r: 0.17 }, { x: 65, y: 88, r: 0.15 }, { x: 67, y: 58, r: 0.2 },
  { x: 70, y: 14, r: 0.22 }, { x: 72, y: 40, r: 0.28 }, { x: 76, y: 69, r: 0.17 },
  { x: 78, y: 28, r: 0.2 }, { x: 81, y: 54, r: 0.25 }, { x: 83, y: 82, r: 0.14 },
  { x: 86, y: 18, r: 0.15 }, { x: 88, y: 43, r: 0.18 }, { x: 92, y: 63, r: 0.2 },
  { x: 95, y: 31, r: 0.14 }, { x: 97, y: 12, r: 0.12 }, { x: 14, y: 72, r: 0.14 },
  { x: 8, y: 54, r: 0.18 }, { x: 20, y: 90, r: 0.13 }, { x: 58, y: 94, r: 0.17 },
  { x: 90, y: 93, r: 0.14 }, { x: 3, y: 82, r: 0.12 }, { x: 48, y: 8, r: 0.14 },
  { x: 74, y: 4, r: 0.13 }, { x: 15, y: 46, r: 0.16 }, { x: 80, y: 92, r: 0.12 },
  { x: 2, y: 40, r: 0.14 }, { x: 68, y: 36, r: 0.18 }, { x: 45, y: 42, r: 0.15 },
  { x: 35, y: 88, r: 0.15 },
];

// Highlighted "retrieved" points — brighter, with connecting similarity edges.
const HILITE = [6, 10, 14, 17, 22, 25, 28, 43];

// Similarity edges between a handful of highlighted points.
const EDGES: [number, number][] = [
  [6, 10], [10, 14], [14, 17], [17, 22], [22, 28], [43, 25], [10, 43], [28, 25],
];

export function ConstellationBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Base wash */}
      <div className="absolute inset-0 bg-[#0a0a0a]" />

      {/* Soft conic blobs (feel: refractive, not flat) */}
      <div
        className="absolute -top-40 right-[-10rem] w-[55rem] h-[55rem] rounded-full opacity-60 blur-[140px]"
        style={{
          background:
            "conic-gradient(from 180deg at 50% 50%, #3b82f6 0deg, #8b5cf6 120deg, transparent 240deg)",
        }}
      />
      <div
        className="absolute -bottom-40 left-[-10rem] w-[45rem] h-[45rem] rounded-full opacity-40 blur-[140px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(14,165,233,0.35), transparent 70%)",
        }}
      />

      {/* Film-grain noise */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
        <filter id="nlm-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#nlm-noise)" opacity="0.045" />
      </svg>

      {/* Embedding-space constellation */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="nlm-point-hi" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="nlm-edge" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(167,139,250,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* similarity edges */}
        <g>
          {EDGES.map(([a, b]) => {
            const p1 = POINTS[a];
            const p2 = POINTS[b];
            return (
              <line
                key={`${a}-${b}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="url(#nlm-edge)"
                strokeWidth={0.05}
                className="nlm-edge"
              />
            );
          })}
        </g>

        {/* dots */}
        <g className="nlm-drift">
          {POINTS.map((p, i) => {
            const hi = HILITE.includes(i);
            if (hi) {
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={p.r * 3.5} fill="url(#nlm-point-hi)" />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.r}
                    fill="#e0e7ff"
                    className="nlm-pulse"
                    style={{ animationDelay: `${(i * 157) % 4000}ms` }}
                  />
                </g>
              );
            }
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={p.r}
                fill="white"
                opacity={0.12}
              />
            );
          })}
        </g>
      </svg>

      {/* Top + bottom vignette to keep text readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, transparent 0%, rgba(10,10,10,0.75) 85%)",
        }}
      />

      <style>{`
        .nlm-drift {
          transform-origin: 50% 50%;
          animation: nlmDrift 60s ease-in-out infinite alternate;
        }
        @keyframes nlmDrift {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-1.2%, -0.6%, 0); }
        }
        .nlm-pulse {
          animation: nlmPulse 3.6s ease-in-out infinite;
          transform-origin: center;
        }
        @keyframes nlmPulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.5); }
        }
        .nlm-edge {
          stroke-dasharray: 2 6;
          animation: nlmEdge 18s linear infinite;
        }
        @keyframes nlmEdge {
          to { stroke-dashoffset: -80; }
        }
      `}</style>
    </div>
  );
}
