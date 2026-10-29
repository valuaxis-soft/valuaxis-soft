/**
 * Bold, italic and underline inside a concept's value or a paragraph.
 *
 * The marks travel in the value itself as three tags of our own, `<b>`, `<i>`
 * and `<u>`, closed with `</b>`, `</i>` and `</u>`; nothing else is read as
 * markup, so the value is still the plain text the appraiser wrote plus those
 * tags. The document renders them; anything that needs the text alone (AI
 * drafts, exports, search) strips them with `stripTextMarks`.
 */

export type TextMark = "bold" | "italic" | "underline";

/** A run of text with the marks that apply to it. */
export type TextMarkSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

const TAG_OF: Record<TextMark, string> = { bold: "b", italic: "i", underline: "u" };
const MARK_OF: Record<string, TextMark> = { b: "bold", i: "italic", u: "underline" };
const TAG_PATTERN = /<(\/?)([biu])>/g;

/** Whether the value carries any mark. */
export function hasTextMarks(value: string): boolean {
  return /<\/?[biu]>/.test(value);
}

/** The value without its marks: what the text reads as. */
export function stripTextMarks(value: string): string {
  return value.replace(/<\/?[biu]>/g, "");
}

/**
 * The value cut into runs of equal formatting, in order. Tags closed in the
 * wrong order or never closed still read: a close tag ends its mark wherever
 * it is, and an open mark lasts to the end of the text.
 */
export function parseTextMarks(value: string): TextMarkSegment[] {
  const segments: TextMarkSegment[] = [];
  const state = { bold: false, italic: false, underline: false };
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const previous = segments.at(-1);
    if (previous && previous.bold === state.bold && previous.italic === state.italic && previous.underline === state.underline) {
      previous.text += text;
      return;
    }
    segments.push({ text, ...state });
  };
  for (const match of value.matchAll(TAG_PATTERN)) {
    push(value.slice(last, match.index));
    state[MARK_OF[match[2]]] = match[1] !== "/";
    last = match.index + match[0].length;
  }
  push(value.slice(last));
  return segments;
}

const MARK_ORDER: TextMark[] = ["bold", "italic", "underline"];

type MarkedChar = { char: string; marks: Record<TextMark, boolean> };

/** The text of the value one code unit at a time (as an input counts it), each with the marks on it. */
function markedChars(value: string): MarkedChar[] {
  return parseTextMarks(value).flatMap((segment) =>
    segment.text.split("").map((char) => ({ char, marks: { bold: segment.bold, italic: segment.italic, underline: segment.underline } })),
  );
}

/**
 * The characters back as a value, with the tags well nested in the order
 * bold > italic > underline and closed where each mark ends.
 */
function writeMarkedChars(chars: MarkedChar[]): string {
  let out = "";
  const open: TextMark[] = [];
  const closeTo = (depth: number) => {
    while (open.length > depth) out += `</${TAG_OF[open.pop()!]}>`;
  };
  for (const { char, marks } of chars) {
    let keep = 0;
    while (keep < open.length && marks[open[keep]]) keep += 1;
    closeTo(keep);
    for (const mark of MARK_ORDER) {
      if (!marks[mark] || open.includes(mark)) continue;
      out += `<${TAG_OF[mark]}>`;
      open.push(mark);
    }
    out += char;
  }
  closeTo(0);
  return out;
}

/** Where a position of the value as written (tags included) falls in its text; inside a tag counts as before it. */
function textOffsetOf(value: string, rawOffset: number): number {
  let removed = 0;
  for (const match of value.matchAll(TAG_PATTERN)) {
    if (match.index >= rawOffset) break;
    if (match.index + match[0].length > rawOffset) return match.index - removed;
    removed += match[0].length;
  }
  return rawOffset - removed;
}

/** A position of the text in the value as written: past the tags there when it starts a range, before them when it ends one. */
function rawOffsetOf(value: string, textOffset: number, side: "start" | "end"): number {
  let removed = 0;
  for (const match of value.matchAll(TAG_PATTERN)) {
    const at = match.index - removed;
    if (at > textOffset || (at === textOffset && side === "end")) break;
    removed += match[0].length;
  }
  return textOffset + removed;
}

/**
 * The stretch of text a mark button works on: the selection; with only the
 * caret, the run of that mark the caret is in, or the whole value when it is
 * in none; with neither, the whole value.
 */
function markRange(chars: MarkedChar[], mark: TextMark, value: string, selectionStart?: number, selectionEnd?: number): [number, number] {
  if (selectionStart === undefined || selectionEnd === undefined) return [0, chars.length];
  const start = textOffsetOf(value, Math.min(selectionStart, selectionEnd));
  const end = textOffsetOf(value, Math.max(selectionStart, selectionEnd));
  if (start !== end) return [start, end];
  // The character before the caret decides, as in a word processor; at the start of a run, the one after it.
  const at = chars[start - 1]?.marks[mark] ? start - 1 : chars[start]?.marks[mark] ? start : -1;
  if (at < 0) return [0, chars.length];
  let from = at;
  let to = at + 1;
  while (from > 0 && chars[from - 1].marks[mark]) from -= 1;
  while (to < chars.length && chars[to].marks[mark]) to += 1;
  return [from, to];
}

/** Whether every character of the range that is not blank (or every one, when all are) carries the mark. */
function rangeHasMark(chars: MarkedChar[], mark: TextMark, start: number, end: number): boolean {
  const range = chars.slice(start, end);
  const written = range.filter((item) => item.char.trim());
  const judged = written.length ? written : range;
  return judged.length > 0 && judged.every((item) => item.marks[mark]);
}

/**
 * The marks the text a button would work on already has throughout (see
 * `applyTextMark`), so each button can show itself pressed.
 */
export function activeTextMarks(value: string, selectionStart?: number, selectionEnd?: number): Record<TextMark, boolean> {
  const chars = markedChars(value);
  const active = (mark: TextMark) => rangeHasMark(chars, mark, ...markRange(chars, mark, value, selectionStart, selectionEnd));
  return { bold: active("bold"), italic: active("italic"), underline: active("underline") };
}

/**
 * Applies or removes a mark and says where the text it worked on is in the
 * new value, to keep it selected. The range is counted in the value as
 * written (tags included), the way an input reports its selection, but only
 * its text matters: text that has the mark throughout loses it, any other
 * gains it, whatever tags lie in or around it. With only the caret, the run
 * of the mark it is in loses it; in none, the whole value is toggled.
 */
export function applyTextMark(
  value: string,
  mark: TextMark,
  selectionStart?: number,
  selectionEnd?: number,
): { value: string; selectionStart: number; selectionEnd: number } {
  const chars = markedChars(value);
  let [start, end] = markRange(chars, mark, value, selectionStart, selectionEnd);
  const on = !rangeHasMark(chars, mark, start, end);
  if (on) {
    // Blank edges stay outside the mark, so a selection that took a space with it reads the same.
    while (start < end && !chars[start].char.trim()) start += 1;
    while (end > start && !chars[end - 1].char.trim()) end -= 1;
  }
  if (start >= end) return { value, selectionStart: selectionStart ?? 0, selectionEnd: selectionEnd ?? selectionStart ?? 0 };
  for (let index = start; index < end; index += 1) chars[index].marks[mark] = on;
  const next = writeMarkedChars(chars);
  return { value: next, selectionStart: rawOffsetOf(next, start, "start"), selectionEnd: rawOffsetOf(next, end, "end") };
}

/** `applyTextMark`, the new value alone. */
export function toggleTextMark(value: string, mark: TextMark, selectionStart?: number, selectionEnd?: number): string {
  return applyTextMark(value, mark, selectionStart, selectionEnd).value;
}
