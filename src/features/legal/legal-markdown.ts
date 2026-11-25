/**
 * The small markdown the legal documents are written in (docs/legal/*.md):
 * headings, paragraphs, numbered items that keep their own numbers, tables,
 * bold and the lawyer's blanks. Parsing only; the page renders the blocks
 * (components/legal-text.tsx). Pure.
 */

export type LegalBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: { number: number; text: string }[] }
  | { type: "table"; head: string[]; rows: string[][] };

export type LegalInline = { type: "text" | "bold" | "link" | "blank"; text: string };

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

export function parseLegalMarkdown(source: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  for (const chunk of source.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((line) => line.trim());
    if (!lines.length) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      continue;
    }
    if (lines.every((line) => line.trim().startsWith("|")) && lines.length >= 2 && /^\|?[\s:|-]+\|?$/.test(lines[1].trim())) {
      blocks.push({ type: "table", head: cells(lines[0]), rows: lines.slice(2).map(cells) });
      continue;
    }
    if (lines.every((line) => /^\d{1,3}\.\s/.test(line))) {
      blocks.push({
        type: "list",
        items: lines.map((line) => {
          const match = /^(\d{1,3})\.\s+(.*)$/.exec(line)!;
          return { number: Number(match[1]), text: match[2] };
        }),
      });
      continue;
    }
    blocks.push({ type: "paragraph", text: lines.join(" ") });
  }
  return blocks;
}

/** Bold (`**…**`), web addresses and blanks (`______`) inside a line. */
export function parseLegalInline(text: string): LegalInline[] {
  const parts: LegalInline[] = [];
  const pattern = /\*\*(.+?)\*\*|(https?:\/\/[^\s)]+[^\s).,;])|(_{5,})/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) parts.push({ type: "text", text: text.slice(last, match.index) });
    if (match[1] !== undefined) parts.push({ type: "bold", text: match[1] });
    else if (match[2] !== undefined) parts.push({ type: "link", text: match[2] });
    else parts.push({ type: "blank", text: match[3] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}
