import { cn } from "@/lib/utils";

/**
 * Topographic contour lines, the brand's background motif: land, survey and
 * croquis. Decorative only; it inherits `currentColor` so each band tints it.
 */
export function ContourLines({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={cn("pointer-events-none", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <path d="M880 120c90-30 210 10 240 90s-30 170-120 190-200-20-230-90 20-160 110-190Z" />
      <path d="M860 90c120-45 270 5 305 110s-45 215-160 240-250-30-285-120 25-185 140-230Z" />
      <path d="M835 55c150-60 330 0 375 130s-60 265-200 295-305-40-350-150 30-215 175-275Z" />
      <path d="M810 20c180-75 390-5 445 150s-75 315-240 350-360-50-415-180 35-245 210-320Z" />
      <path d="M780-20c210-90 455-10 520 175s-90 370-285 410-420-60-485-215 40-280 250-370Z" />
      <path d="M150 560c60-50 170-60 230-10s50 140-20 170-170 20-215-30-55-90 5-130Z" />
      <path d="M115 530c85-70 225-80 300-15s65 180-25 220-225 25-285-40-75-115 10-165Z" />
      <path d="M80 500c110-90 280-100 370-20s80 220-30 270-280 30-355-50-95-140 15-200Z" />
      <path d="M45 470c135-110 335-120 440-25s95 260-35 320-335 35-425-60-115-165 20-235Z" />
      <path d="M-60 250c140-40 300 30 380 0s160-110 300-90 240 120 380 100 230-70 260-60" />
      <path d="M-60 300c150-40 310 35 395 5s165-105 305-85 235 125 375 105 235-65 245-55" />
    </svg>
  );
}
