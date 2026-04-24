"use client";

import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";

// Cluster colors for dark and light themes
const CLUSTER_COLORS_DARK = [
  "rgba(123,143,239,",
  "rgba(192,132,252,",
  "rgba(45,212,191,",
  "rgba(96,165,250,",
  "rgba(251,113,133,",
];
const CLUSTER_COLORS_LIGHT = [
  "rgba(79,91,213,",
  "rgba(147,51,234,",
  "rgba(13,148,136,",
  "rgba(37,99,235,",
  "rgba(225,29,72,",
];

interface Node {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  cluster: number;
  retrieved: boolean;
  retrieveAlpha: number;
  baseAlpha: number;
}

interface QueryNode {
  x: number;
  y: number;
  alpha: number;
}

interface QueryEdge {
  node: Node;
  progress: number;
  delay: number;
}

interface Particle {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  speed: number;
  alpha: number;
}

// Seeded random for deterministic cluster generation (avoids hydration mismatch)
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildClusters() {
  const rng = seededRandom(42);
  const clusters: { cx: number; cy: number; nodes: Node[]; color: number }[] =
    [];
  for (let c = 0; c < 5; c++) {
    const cx = 0.15 + rng() * 0.7;
    const cy = 0.15 + rng() * 0.7;
    const nodes: Node[] = [];
    const count = 12 + Math.floor(rng() * 8);
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * 0.08 + 0.01;
      nodes.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        r: 1 + rng() * 1.5,
        vx: (rng() - 0.5) * 0.00003,
        vy: (rng() - 0.5) * 0.00003,
        cluster: c,
        retrieved: false,
        retrieveAlpha: 0,
        baseAlpha: 0.08 + rng() * 0.12,
      });
    }
    clusters.push({ cx, cy, nodes, color: c });
  }
  return clusters;
}

const CLUSTERS = buildClusters();
const ALL_NODES = CLUSTERS.flatMap((c) => c.nodes);

export function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const { resolvedTheme } = useTheme();

  const isDarkRef = useRef(true);

  useEffect(() => {
    isDarkRef.current = resolvedTheme !== "light";
  }, [resolvedTheme]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);

    const queryState = {
      active: false,
      node: null as QueryNode | null,
      edges: [] as QueryEdge[],
      timer: 0,
    };
    const particles: Particle[] = [];
    const QUERY_INTERVAL = 6000;
    const QUERY_DURATION = 3000;

    let lastTime = 0;
    let animId: number;

    function resize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
    }
    window.addEventListener("resize", resize);

    function onMouseMove(e: MouseEvent) {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    }
    window.addEventListener("mousemove", onMouseMove);

    function triggerQuery() {
      const rng = Math.random;
      queryState.node = {
        x: 0.3 + rng() * 0.4,
        y: 0.3 + rng() * 0.4,
        alpha: 0,
      };
      const scored = ALL_NODES.map((n, i) => ({
        idx: i,
        node: n,
        dist: Math.hypot(n.x - queryState.node!.x, n.y - queryState.node!.y),
      })).sort((a, b) => a.dist - b.dist);

      ALL_NODES.forEach((n) => {
        n.retrieved = false;
        n.retrieveAlpha = 0;
      });
      queryState.edges = [];
      for (let i = 0; i < Math.min(6, scored.length); i++) {
        scored[i].node.retrieved = true;
        queryState.edges.push({
          node: scored[i].node,
          progress: 0,
          delay: i * 0.15,
        });
      }
      queryState.active = true;
      queryState.timer = 0;
    }

    function spawnParticle(from: QueryNode, to: Node) {
      particles.push({
        fx: from.x,
        fy: from.y,
        tx: to.x,
        ty: to.y,
        t: 0,
        speed: 0.008 + Math.random() * 0.006,
        alpha: 0.6 + Math.random() * 0.3,
      });
    }

    function frame(time: number) {
      const dt = Math.min(time - lastTime, 50);
      lastTime = time;
      ctx!.clearRect(0, 0, W, H);

      const isDark = isDarkRef.current;
      const clusterColors = isDark
        ? CLUSTER_COLORS_DARK
        : CLUSTER_COLORS_LIGHT;
      const baseNodeAlpha = isDark ? 1 : 0.7;
      const baseEdgeAlpha = isDark ? 0.04 : 0.03;

      // Update query cycle
      queryState.timer += dt;
      if (!queryState.active && queryState.timer > QUERY_INTERVAL)
        triggerQuery();
      if (queryState.active && queryState.timer > QUERY_DURATION) {
        queryState.active = false;
        queryState.timer = 0;
        queryState.node = null;
        ALL_NODES.forEach((n) => {
          n.retrieved = false;
        });
        queryState.edges = [];
      }

      // Draw intra-cluster edges
      for (const cluster of CLUSTERS) {
        const col = clusterColors[cluster.color];
        for (let i = 0; i < cluster.nodes.length; i++) {
          for (let j = i + 1; j < cluster.nodes.length; j++) {
            const a = cluster.nodes[i],
              b = cluster.nodes[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 0.06) {
              const alpha = baseEdgeAlpha * (1 - d / 0.06);
              ctx!.strokeStyle = col + alpha + ")";
              ctx!.lineWidth = 0.5;
              ctx!.beginPath();
              ctx!.moveTo(a.x * W, a.y * H);
              ctx!.lineTo(b.x * W, b.y * H);
              ctx!.stroke();
            }
          }
        }
      }

      // Draw query edges
      if (queryState.active && queryState.node) {
        queryState.node.alpha = Math.min(
          1,
          queryState.node.alpha + dt * 0.004
        );
        for (const edge of queryState.edges) {
          const elapsed = queryState.timer / 1000 - edge.delay;
          if (elapsed < 0) continue;
          edge.progress = Math.min(1, elapsed * 1.5);
          const n = edge.node;
          const col = clusterColors[n.cluster];

          const ex =
            queryState.node.x +
            (n.x - queryState.node.x) * edge.progress;
          const ey =
            queryState.node.y +
            (n.y - queryState.node.y) * edge.progress;
          ctx!.strokeStyle = col + 0.25 * edge.progress + ")";
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(queryState.node.x * W, queryState.node.y * H);
          ctx!.lineTo(ex * W, ey * H);
          ctx!.stroke();

          if (edge.progress > 0.3 && Math.random() < 0.03) {
            spawnParticle(queryState.node, n);
          }
          n.retrieveAlpha = Math.min(1, n.retrieveAlpha + dt * 0.003);
        }

        // Query node (pulsing)
        const qPulse = 0.5 + 0.5 * Math.sin(time * 0.005);
        const qr = 4 + qPulse * 3;
        const qn = queryState.node;
        const grad = ctx!.createRadialGradient(
          qn.x * W,
          qn.y * H,
          0,
          qn.x * W,
          qn.y * H,
          qr * 3
        );
        grad.addColorStop(
          0,
          isDark
            ? "rgba(123,143,239," + 0.4 * qn.alpha + ")"
            : "rgba(79,91,213," + 0.3 * qn.alpha + ")"
        );
        grad.addColorStop(1, "transparent");
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(qn.x * W, qn.y * H, qr * 3, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = isDark
          ? "rgba(200,210,255," + 0.9 * qn.alpha + ")"
          : "rgba(79,91,213," + 0.7 * qn.alpha + ")";
        ctx!.beginPath();
        ctx!.arc(qn.x * W, qn.y * H, qr * 0.5, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Draw & update nodes
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      for (const n of ALL_NODES) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 0.05 || n.x > 0.95) n.vx *= -1;
        if (n.y < 0.05 || n.y > 0.95) n.vy *= -1;

        const mdist = Math.hypot(n.x * W - mx, n.y * H - my);
        const mGlow = Math.max(0, 1 - mdist / 200);

        const col = clusterColors[n.cluster];
        const alpha =
          (n.baseAlpha + mGlow * 0.3 + n.retrieveAlpha * 0.5) *
          baseNodeAlpha;

        if (n.retrieved || mGlow > 0.1) {
          const glowR = n.r * 4;
          const haloGrad = ctx!.createRadialGradient(
            n.x * W,
            n.y * H,
            0,
            n.x * W,
            n.y * H,
            glowR
          );
          haloGrad.addColorStop(0, col + alpha * 0.4 + ")");
          haloGrad.addColorStop(1, "transparent");
          ctx!.fillStyle = haloGrad;
          ctx!.beginPath();
          ctx!.arc(n.x * W, n.y * H, glowR, 0, Math.PI * 2);
          ctx!.fill();
        }

        ctx!.fillStyle = col + alpha + ")";
        ctx!.beginPath();
        ctx!.arc(
          n.x * W,
          n.y * H,
          n.r * (n.retrieved ? 1.8 : 1),
          0,
          Math.PI * 2
        );
        ctx!.fill();
      }

      // Draw & update data particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += p.speed;
        if (p.t >= 1) {
          particles.splice(i, 1);
          continue;
        }
        const px = p.fx + (p.tx - p.fx) * p.t;
        const py = p.fy + (p.ty - p.fy) * p.t;
        const pa = p.alpha * Math.sin(p.t * Math.PI);
        ctx!.fillStyle = isDark
          ? "rgba(200,210,255," + pa + ")"
          : "rgba(79,91,213," + pa * 0.6 + ")";
        ctx!.beginPath();
        ctx!.arc(px * W, py * H, 1.5, 0, Math.PI * 2);
        ctx!.fill();
      }

      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  useEffect(() => {
    const cleanup = draw();
    return cleanup;
  }, [draw]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      {/* Canvas embedding space */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      />

      {/* Mesh gradient orbs */}
      <div className="fixed inset-0 z-0 overflow-hidden transition-opacity duration-300">
        <div
          className="absolute rounded-full"
          style={{
            width: "50vw",
            height: "50vw",
            top: "-18vw",
            right: "-12vw",
            background: "rgba(123,143,239,0.04)",
            filter: "blur(140px)",
            animation: "drift 25s ease-in-out infinite alternate",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: "40vw",
            height: "40vw",
            bottom: "-10vw",
            left: "-8vw",
            background: "rgba(192,132,252,0.025)",
            filter: "blur(140px)",
            animation: "drift 30s ease-in-out infinite alternate",
            animationDelay: "-10s",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: "25vw",
            height: "25vw",
            top: "45%",
            left: "35%",
            background: "rgba(45,212,191,0.02)",
            filter: "blur(140px)",
            animation: "drift 25s ease-in-out infinite alternate",
            animationDelay: "-18s",
          }}
        />
      </div>

      {/* Dot grid */}
      <div className="landing-dotgrid" />
    </div>
  );
}
