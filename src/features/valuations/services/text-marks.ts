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

/**
 * Applies or removes a mark on the selected range of the value, or on the
 * whole value when nothing is selected. The range is counted in the value as
 * written (tags included), the way an input reports its selection. A range
 * whose text is already wrapped exactly in the mark loses it; any other
 * range gains it.
 */
export function toggleTextMark(value: string, mark: TextMark, selectionStart?: number, selectionEnd?: number): string {
  const whole = selectionStart === undefined || selectionEnd === undefined || selectionStart === selectionEnd;
  const start = whole ? 0 : Math.min(selectionStart, selectionEnd);
  const end = whole ? value.length : Math.max(selectionStart, selectionEnd);
  const open = `<${TAG_OF[mark]}>`;
  const close = `</${TAG_OF[mark]}>`;
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
    return before + selected.slice(open.length, selected.length - close.length) + after;
  }
  if (before.endsWith(open) && after.startsWith(close)) {
    return before.slice(0, before.length - open.length) + selected + after.slice(close.length);
  }
  if (!selected.trim()) return value;
  // Blank edges stay outside the mark, so a selection that took a space with it reads the same.
  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  const core = selected.slice(leading, selected.length - trailing);
  return before + selected.slice(0, leading) + open + core + close + selected.slice(selected.length - trailing) + after;
}
