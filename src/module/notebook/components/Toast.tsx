"use client";

import { useEffect, useState } from "react";

let emitFn: ((msg: string) => void) | null = null;

export function showToast(msg: string) {
  emitFn?.(msg);
}

export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    emitFn = (m: string) => {
      setMsg(m);
      const t = setTimeout(() => setMsg(null), 2400);
      return () => clearTimeout(t);
    };
    return () => {
      emitFn = null;
    };
  }, []);

  return (
    <div
      className={`fixed bottom-4 right-4 bg-gray-800 dark:bg-gray-700 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-300 ${
        msg
          ? "translate-y-0 opacity-100"
          : "translate-y-20 opacity-0 pointer-events-none"
      }`}
    >
      {msg ?? ""}
    </div>
  );
}
