import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PRICE_PER_VALUATION_MXN } from "@/features/marketing/content";

export const alt = "Valuaxis Soft, software de avalúos inmobiliarios en México";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Logo colors as hex: the image renderer does not read the CSS tokens.
const NAVY = "#011541";
const DEEP = "#04256b";
const BLUE = "#005bea";
const SKY = "#05b4fd";
const PAPER = "#fbf9f5";

export default async function OpengraphImage() {
  // Rendered at build time; the stock photo is credited in docs/DISENO.md.
  const photo = await readFile(join(process.cwd(), "public/marketing/og-fachada.jpg"));
  const photoSrc = `data:image/jpeg;base64,${photo.toString("base64")}`;
  // The logo for dark backgrounds (public/brand/, docs/DISENO.md).
  const logo = await readFile(join(process.cwd(), "public/brand/valuaxis-soft-oscuro.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <div
          style={{
            width: 680,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 56px",
            background: `linear-gradient(135deg, ${NAVY} 0%, ${DEEP} 100%)`,
            color: PAPER,
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex" }}>
            <img src={logoSrc} width={302} height={96} alt="" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>
              Del Excel al dictamen de avalúo, en un solo lugar.
            </div>
            <div style={{ display: "flex", fontSize: 26, color: "#c6d4ee" }}>
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
                background: BLUE,
                color: "#ffffff",
                border: `2px solid ${SKY}`,
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              ${PRICE_PER_VALUATION_MXN} MXN por avalúo, IVA incluido
            </div>
          </div>
        </div>
        <img src={photoSrc} width={520} height={630} alt="" style={{ objectFit: "cover" }} />
      </div>
    ),
    size,
  );
}
