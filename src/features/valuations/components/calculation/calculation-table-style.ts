/**
 * The look of the capture tables of the calculation panels, the same as the
 * tables of the dictamen: the light blue header band with navy bold text and
 * white rules as thick as the dictamen's (2px), gray and white rows
 * alternating (the first gray), soft blue-gray rules instead of black ones,
 * dark gray text and the resultant factors in bold.
 */

/**
 * The heading of an apartado of a calculation panel («A) Terreno en estudio»,
 * «1. Especificaciones»…), the same in every panel (video 5.3, 16:51: «me
 * pierdo»): a band of the brand's navy with a bar on its left, so each part
 * reads apart from the fields under it. Tokens of the theme, light and dark.
 */
export const CALC_SECTION_HEADING = "flex flex-wrap items-center justify-between gap-2 rounded-md border-l-4 border-primary bg-primary/8 px-3 py-1.5 text-sm font-semibold text-primary dark:bg-primary/15";

/** Frame of a capture table, scrolling sideways when it does not fit. */
// In light they keep the dictamen's own colours on purpose (the appraiser compares them with the printed
// tables); in dark they follow the theme's tokens.
export const CALC_TABLE_FRAME = "overflow-x-auto rounded-md border border-[#C9D6E6] bg-background dark:border-border";

/** The table: one size for every capture table, in dark gray. */
export const CALC_TABLE = "border-collapse text-xs text-[#333333] tabular-nums dark:text-foreground";

/** The header band, as the printed tables. */
export const CALC_HEAD = "bg-[#BDD7EE] text-[#00285A] dark:bg-primary/20 dark:text-foreground";

/** A header cell. */
export const CALC_HEAD_CELL = "border-2 border-white px-1.5 py-1 text-center align-middle font-bold dark:border-border";

/** A row: gray and white alternate, the first one gray. */
export const CALC_ROW = "border-t border-[#DCE4EE] odd:bg-slate-100 dark:border-border dark:odd:bg-muted/40";

/** A body cell with a rule on each side, so the columns read apart (video 5.4). */
export const CALC_CELL = "border-x border-[#DCE4EE] dark:border-border";

/** A resultant factor (FRe, F. Result.): in bold. */
export const CALC_RESULT = "font-bold";
