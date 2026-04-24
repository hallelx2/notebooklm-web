"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Interactive mind map rendered with markmap.
 *
 * - Generates an SVG tree from markdown headings.
 * - Each node is clickable and triggers `onNodeClick` with the node text,
 *   which pastes a prompt into the chat asking to explain that concept.
 * - Custom themed CSS to match the app's design system.
 */

type Props = {
  markdown: string;
  onNodeClick?: (nodeText: string) => void;
};

export function MindMapRenderer({ markdown, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const mmRef = useRef<{ destroy: () => void } | null>(null);
  const [loading, setLoading] = useState(true);

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
          duration: 400,
          maxWidth: 220,
          paddingX: 16,
          spacingHorizontal: 60,
          spacingVertical: 8,
          autoFit: true,
          zoom: true,
          pan: true,
          initialExpandLevel: 3,
          color: (n: { depth: number }) => {
            const colors = [
              "#6366f1", // indigo-500 (root)
              "#8b5cf6", // violet-500
              "#3b82f6", // blue-500
              "#06b6d4", // cyan-500
              "#10b981", // emerald-500
              "#f59e0b", // amber-500
              "#ef4444", // red-500
            ];
            return colors[n.depth % colors.length];
          },
        } as Record<string, unknown>,
        root,
      );

      mmRef.current = mm;
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
    <div className="mindmap-container relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-indigo-500 animate-spin">
              progress_activity
            </span>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Rendering mind map...
            </p>
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        className="mindmap-svg w-full"
        style={{
          minHeight: "400px",
          height: "100%",
          opacity: loading ? 0 : 1,
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Hint */}
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
