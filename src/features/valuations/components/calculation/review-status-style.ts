import type { ReviewTone } from "@/features/valuations/calculation/comparable-review";

/**
 * The colour of each review state, so it reads at a glance: a filled badge
 * (`solid`), the tint and left border of its row (`row`), and its text. Theme
 * tokens, as the valuation states (docs/DISENO.md): grey for still to review,
 * green for verified, navy for verified but no longer current, ochre for a
 * comparable to observe and red for rejected. A state the firm adds takes one
 * of these or of five more of the palette (V8.13: «definir el color de la
 * etiqueta»). The label always says the state.
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
  // V8.13: five more of the palette for the states the firm adds.
  violeta: {
    solid: "bg-chart-4 text-white",
    row: "border-l-4 border-l-chart-4 bg-chart-4/10",
    text: "text-chart-4",
  },
  naranja: {
    solid: "bg-chart-5 text-white",
    row: "border-l-4 border-l-chart-5 bg-chart-5/10",
    text: "text-chart-5",
  },
  celeste: {
    solid: "bg-brand-sky text-foreground",
    row: "border-l-4 border-l-brand-sky bg-brand-sky/10",
    text: "text-brand",
  },
  "azul-vivo": {
    solid: "bg-brand text-brand-foreground",
    row: "border-l-4 border-l-brand bg-brand/10",
    text: "text-brand",
  },
  marino: {
    solid: "bg-ink text-ink-foreground",
    row: "border-l-4 border-l-ink bg-ink/5",
    text: "text-ink",
  },
};
