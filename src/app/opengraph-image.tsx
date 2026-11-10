import { ImageResponse } from "next/og";
import { PRICE_PER_VALUATION_MXN } from "@/features/marketing/content";

export const alt = "Valuaxis, software de avalúos inmobiliarios en México";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand colors as hex: the image renderer does not read the CSS tokens.
const NAVY = "#014069";
const INK = "#0b2238";
const GREEN = "#40a47e";
const PAPER = "#fbf9f5";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: `linear-gradient(135deg, ${INK} 0%, ${NAVY} 100%)`,
          color: PAPER,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill={PAPER} />
            <path d="M7.5 15.5 16 8.5l8.5 7" fill="none" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m11 15.5 5 8 5-8" fill="none" stroke={GREEN} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Valuaxis</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, maxWidth: 980 }}>
            Del Excel al dictamen de avalúo, en un solo lugar.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#c9d6e2", maxWidth: 960 }}>
            Mercado, costos e ingresos · comparables con mapa · dictamen en PDF
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 22px",
              borderRadius: 999,
              background: GREEN,
              color: INK,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            ${PRICE_PER_VALUATION_MXN} MXN por avalúo, IVA incluido
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#c9d6e2" }}>Software de avalúos · México</div>
        </div>
      </div>
    ),
    size,
  );
}
