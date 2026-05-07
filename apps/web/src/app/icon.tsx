import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon — matches the in-app brand mark (saigon `--ds-accent` green
 * plate with a black book glyph, same composition as the dock and
 * sidebar logo). Kept simple at 32×32 so it stays legible in the tab.
 */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 7,
        background: "linear-gradient(135deg, #b3e8bc 0%, #a0e0ab 100%)",
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Stack-of-books glyph (book_2 spirit). Black on green for max
            legibility at favicon size. */}
        <rect x="4" y="4" width="13" height="3" rx="1" fill="#0a0a0a" />
        <rect x="4" y="8" width="6" height="12" rx="1.2" fill="#0a0a0a" />
        <rect x="11" y="9.5" width="6" height="10.5" rx="1.2" fill="#0a0a0a" />
      </svg>
    </div>,
    { ...size },
  );
}
