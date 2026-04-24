"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Interactive mind map rendered with markmap.
 *
 * - Generates an SVG tree from markdown headings.
 * - Each node is clickable and triggers `onNodeClick` with the node text,
 *   which pastes a prompt into the chat asking to explain that concept.
 * - Custom themed CSS to match the app's design system.
 * - Toolbar with fit-to-view and fullscreen controls.
 */

type Props = {
  markdown: string;
  onNodeClick?: (nodeText: string) => void;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type MarkmapInstance = { destroy: () => void; fit: () => void } & Record<
  string,
  any
>;

export function MindMapRenderer({ markdown, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const mmRef = useRef<MarkmapInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleNodeClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as SVGElement;
      // Walk up to find the nearest g.markmap-node and grab its text
      let node: SVGElement | null = target;
      while (node && !node.classList?.contains("markmap-node")) {
        node = node.parentElement as SVGElement | null;
      }
      if (!node) return;

      const textEl = node.querySelector(
        "text, foreignObject span, foreignObject div",
      );
      const text = textEl?.textContent?.trim();
      if (text && onNodeClick) {
        onNodeClick(text);
      }
    },
    [onNodeClick],
  );

  /* Re-fit the map after toggling fullscreen so it fills the new bounds */
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) {
        // Small delay so the container has resized before fitting
        setTimeout(() => mmRef.current?.fit?.(), 120);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let disposed = false;

    async function render() {
      if (!svgRef.current) return;

      // Dynamic imports to avoid SSR issues
      const { Transformer } = await import("markmap-lib");
      const { Markmap } = await import("markmap-view");

      if (disposed) return;

      const transformer = new Transformer();
      const { root } = transformer.transform(markdown);

      // Destroy previous instance
      if (mmRef.current) {
        try {
          mmRef.current.destroy();
        } catch {}
      }
      // Clear previous render
      svgRef.current.innerHTML = "";

      // Create markmap — MUST pass root as third arg
      const mm = Markmap.create(
        svgRef.current,
        {
          duration: 500,
          maxWidth: 260,
          paddingX: 20,
          spacingHorizontal: 80,
          spacingVertical: 12,
          autoFit: true,
          zoom: true,
          pan: true,
          initialExpandLevel: 3,
          color: (n: { depth: number }) => {
            const colors = [
              "#6366f1", // indigo (root)
              "#8b5cf6", // violet
              "#ec4899", // pink
              "#f59e0b", // amber
              "#10b981", // emerald
              "#06b6d4", // cyan
              "#3b82f6", // blue
              "#ef4444", // rose
              "#84cc16", // lime
            ];
            return colors[n.depth % colors.length];
          },
        } as Record<string, unknown>,
        root,
      );

      mmRef.current = mm as unknown as MarkmapInstance;
      setLoading(false);

      // Add click listeners to all nodes
      const svgEl = svgRef.current;
      svgEl.addEventListener("click", handleNodeClick);
    }

    render();

    return () => {
      disposed = true;
      if (svgRef.current) {
        svgRef.current.removeEventListener("click", handleNodeClick);
      }
    };
  }, [markdown, handleNodeClick]);

  return (
    <div
      className={`mindmap-container relative ${
        isFullscreen
          ? "fixed inset-0 z-50 bg-white dark:bg-gray-900"
          : "w-full h-full"
      }`}
    >
      {/* ---------- Loading overlay ---------- */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-indigo-500 animate-spin">
                progress_activity
              </span>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Rendering mind map...
            </p>
            <p className="text-[10px] text-gray-400">
              This may take a moment for large maps
            </p>
          </div>
        </div>
      )}

      {/* ---------- Toolbar ---------- */}
      {!loading && (
        <div className="absolute top-3 right-3 flex items-center gap-1 z-20">
          <button
            onClick={() => mmRef.current?.fit?.()}
            className="p-1.5 rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm"
            title="Fit to view"
          >
            <span className="material-symbols-outlined text-[18px] text-gray-600 dark:text-gray-300">
              fit_screen
            </span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <span className="material-symbols-outlined text-[18px] text-gray-600 dark:text-gray-300">
              {isFullscreen ? "fullscreen_exit" : "fullscreen"}
            </span>
          </button>
        </div>
      )}

      {/* ---------- SVG canvas ---------- */}
      <svg
        ref={svgRef}
        className="mindmap-svg w-full"
        style={{
          minHeight: isFullscreen ? "100vh" : "400px",
          height: "100%",
          opacity: loading ? 0 : 1,
          transition: "opacity 0.3s ease",
        }}
      />

      {/* ---------- Hint ---------- */}
      {!loading && onNodeClick && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 py-2 px-4 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 w-fit">
          <span className="material-symbols-outlined text-[16px] text-indigo-500 dark:text-indigo-400">
            touch_app
          </span>
          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
            Click any node to explore in chat
          </span>
        </div>
      )}
    </div>
  );
}
