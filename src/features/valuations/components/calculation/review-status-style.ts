import type { ReviewTone } from "@/features/valuations/calculation/comparable-review";

/**
 * The colour of each review state, so it reads at a glance: a filled badge
 * (`solid`), the tint and left border of its row (`row`), and its text. Theme
 * tokens, as the valuation states (docs/DISENO.md): grey for still to review,
 * green for verified, navy for verified but no longer current, ochre for a
 * comparable to observe and red for rejected. A state the firm adds takes one
 * of these five (V8.12: «está muy bonito así como está»). The label always
 * says the state.
 */
export const REVIEW_TONE_STYLES: Record<ReviewTone, { solid: string; row: string; text: string }> = {
  gris: {
    solid: "bg-muted-foreground text-background",
    row: "border-l-4 border-l-muted-foreground/50 bg-muted/60",
    text: "text-muted-foreground",
  },
  verde: {
    solid: "bg-success-strong text-background",
    row: "border-l-4 border-l-success bg-success/10",
    text: "text-success-strong",
  },
  azul: {
    solid: "bg-primary text-primary-foreground",
    row: "border-l-4 border-l-brand/60 bg-brand/5",
    text: "text-primary",
  },
  ocre: {
    solid: "bg-highlight text-highlight-foreground",
    row: "border-l-4 border-l-highlight bg-highlight/10",
    text: "text-highlight-strong",
  },
  rojo: {
    solid: "bg-destructive text-white",
    row: "border-l-4 border-l-destructive/70 bg-destructive/5",
    text: "text-destructive",
  },
};
