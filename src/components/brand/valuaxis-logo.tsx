import { cn } from "@/lib/utils";

/**
 * The Valuaxis Soft brand, from the client's artwork (public/brand/, see
 * docs/DISENO.md). `tone` is the background the logo sits on: "light" for
 * paper, "dark" for the ink bands, "auto" follows the theme (both files are
 * in the page; the hidden one is lazy, so it is not downloaded).
 */
type BrandTone = "auto" | "light" | "dark";

const BRAND_NAME = "Valuaxis Soft";

const FILES = {
  full: { light: "/brand/valuaxis-soft.webp", dark: "/brand/valuaxis-soft-oscuro.webp", width: 480, height: 153 },
  mark: { light: "/brand/valuaxis-v.svg", dark: "/brand/valuaxis-v-oscuro.svg", width: 32, height: 32 },
} as const;

/**
 * The full logo (the "V", VALUAXIS and SOFT) or, with `variant="mark"`, the
 * faceted "V" alone. Size it by height (`className="h-10"`); the width
 * follows. Its text alternative is the brand name.
 */
export function ValuaxisLogo({
  className,
  tone = "auto",
  variant = "full",
}: {
  className?: string;
  tone?: BrandTone;
  variant?: "full" | "mark";
}) {
  const file = FILES[variant];
  const base = variant === "full" ? "h-9 w-auto max-w-none shrink-0" : "size-8 shrink-0";
  const image = (src: string, themeClass: string, lazy: boolean) => (
    // eslint-disable-next-line @next/next/no-img-element -- static brand files, already sized and compressed.
    <img
      key={src}
      src={src}
      width={file.width}
      height={file.height}
      alt={BRAND_NAME}
      decoding="async"
      loading={lazy ? "lazy" : undefined}
      draggable={false}
      className={cn(base, themeClass, className)}
    />
  );
  if (tone === "light") return image(file.light, "", false);
  if (tone === "dark") return image(file.dark, "", false);
  return (
    <>
      {image(file.light, "dark:hidden", false)}
      {image(file.dark, "hidden dark:block", true)}
    </>
  );
}
