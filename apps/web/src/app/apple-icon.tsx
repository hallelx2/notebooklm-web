import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Apple Touch Icon — matches the in-app brand mark and the desktop
 * app icon. Saigon-accent green plate, black stack-of-books glyph.
 */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 36,
        background:
          "linear-gradient(135deg, #b3e8bc 0%, #a0e0ab 55%, #8ad296 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
      }}
    >
      <svg
        width="120"
        height="120"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Same stack-of-books composition as the favicon, scaled up
            and with the spine bands (subtle green accents) the desktop
            icon has at 1024×1024. */}
        <rect x="3.5" y="3.5" width="14" height="3" rx="1" fill="#0a0a0a" />
        <rect x="3.5" y="3.5" width="14" height="0.8" fill="#a0e0ab" opacity="0.6" />

        <rect x="3.5" y="7.5" width="6.5" height="13" rx="1.4" fill="#0a0a0a" />
        <rect x="3.5" y="7.5" width="1.2" height="13" fill="#a0e0ab" opacity="0.55" />
        <rect x="5.5" y="10" width="3.5" height="0.8" rx="0.4" fill="#a0e0ab" opacity="0.85" />
        <rect x="5.5" y="12" width="2.5" height="0.6" rx="0.3" fill="#a0e0ab" opacity="0.6" />

        <rect x="11" y="9" width="6.5" height="11.5" rx="1.4" fill="#0a0a0a" />
        <rect x="11" y="9" width="1.2" height="11.5" fill="#a0e0ab" opacity="0.55" />
        <rect x="13" y="11.5" width="3.5" height="0.8" rx="0.4" fill="#a0e0ab" opacity="0.85" />
        <rect x="13" y="13.5" width="2" height="0.6" rx="0.3" fill="#a0e0ab" opacity="0.6" />
      </svg>
    </div>,
    { ...size },
  );
}
