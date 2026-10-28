/**
 * The look of the capture tables of the calculation panels, the same as the
 * tables of the dictamen: the light blue header band with navy bold text,
 * gray and white rows alternating (the first gray), soft blue-gray rules
 * instead of black ones, dark gray text and the resultant factors in bold.
 */

/** Frame of a capture table, scrolling sideways when it does not fit. */
export const CALC_TABLE_FRAME = "overflow-x-auto rounded-md border border-[#C9D6E6] bg-background dark:border-slate-700";

/** The table: one size for every capture table, in dark gray. */
export const CALC_TABLE = "border-collapse text-xs text-[#333333] dark:text-slate-200";

/** The header band, as the printed tables. */
export const CALC_HEAD = "bg-[#BDD7EE] text-[#00285A] dark:bg-[#1F3A5F] dark:text-sky-50";

/** A header cell. */
export const CALC_HEAD_CELL = "border border-white/80 px-1.5 py-1 text-center align-middle font-bold dark:border-slate-700";

/** A row: gray and white alternate, the first one gray. */
export const CALC_ROW = "border-t border-[#DCE4EE] odd:bg-slate-100 dark:border-slate-700 dark:odd:bg-slate-800/40";

/** A resultant factor (FRe, F. Result.): in bold. */
export const CALC_RESULT = "font-bold";
