import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: "linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)",
        }}
      >
        {/* Stylized open book */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Left page */}
          <path
            d="M4 4.5C4 3.67 4.67 3 5.5 3C7.5 3 11 3.5 12 5V20C11 18.5 7.5 18 5.5 18C4.67 18 4 17.33 4 16.5V4.5Z"
            fill="rgba(255,255,255,0.95)"
          />
          {/* Right page */}
          <path
            d="M20 4.5C20 3.67 19.33 3 18.5 3C16.5 3 13 3.5 12 5V20C13 18.5 16.5 18 18.5 18C19.33 18 20 17.33 20 16.5V4.5Z"
            fill="rgba(255,255,255,0.7)"
          />
          {/* Sparkle accent */}
          <circle cx="16" cy="8" r="1.2" fill="#fbbf24" />
          <circle cx="17.5" cy="6" r="0.7" fill="#fbbf24" opacity="0.7" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
