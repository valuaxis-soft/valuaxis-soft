import type { ReviewStatus } from "@/features/valuations/calculation/comparable-review";

/**
 * The colour of each review state, so it reads at a glance: a filled badge
 * (`solid`), the tint and left border of its row (`row`), and its text.
 */
export const REVIEW_STATUS_STYLES: Record<ReviewStatus, { solid: string; row: string; text: string }> = {
  POR_REVISAR: {
    solid: "bg-slate-500 text-white",
    row: "border-l-4 border-l-slate-400 bg-slate-50 dark:bg-slate-900/40",
    text: "text-slate-600 dark:text-slate-300",
  },
  VERIFICADO: {
    solid: "bg-emerald-600 text-white",
    row: "border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  CON_OBSERVACIONES: {
    solid: "bg-amber-500 text-black",
    row: "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-400",
  },
  RECHAZADO: {
    solid: "bg-red-600 text-white",
    row: "border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
  },
};
