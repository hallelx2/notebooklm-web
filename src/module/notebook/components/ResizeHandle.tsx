"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  side: "left" | "right";
  width: number;
  setWidth: (w: number) => void;
};

export function ResizeHandle({ side, width, setWidth }: Props) {
  const [active, setActive] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      setActive(true);
      document.body.classList.add("resizing");

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startXRef.current;
        const next =
          side === "right"
            ? startWidthRef.current + delta
            : startWidthRef.current - delta;
        const clamped = Math.min(520, Math.max(240, next));
        setWidth(clamped);
      };
      const onUp = () => {
        setActive(false);
        document.body.classList.remove("resizing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [side, width, setWidth],
  );

  return (
    <div
      className={`resize-handle${active ? " active" : ""}`}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
