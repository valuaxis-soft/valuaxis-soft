import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { parseLegalInline, parseLegalMarkdown, type LegalBlock } from "../legal-markdown";

/**
 * A legal document's text as written (matrix rule 2: literal, never
 * summarized). The lawyer's blanks («______») stay visible, marked, so a draft
 * never passes for a finished text. No hooks: it renders on the server or
 * inside a client form.
 */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseLegalInline(text).map((part, index) => {
        if (part.type === "bold") return <strong key={index} className="font-semibold text-foreground">{part.text}</strong>;
        if (part.type === "link") {
          return (
            <a key={index} href={part.text} target="_blank" rel="noopener noreferrer" className="break-all text-brand underline underline-offset-2">
              {part.text}
            </a>
          );
        }
        if (part.type === "blank") {
          return (
            <mark key={index} data-legal-blank="" title="Dato pendiente de llenar" className="rounded-sm bg-highlight/25 px-1 text-highlight-strong">
              {part.text}
            </mark>
          );
        }
        return <Fragment key={index}>{part.text}</Fragment>;
      })}
    </>
  );
}

function Block({ block, compact }: { block: LegalBlock; compact: boolean }) {
  switch (block.type) {
    case "heading": {
      if (block.level === 1) {
        return <h2 className={cn("font-display font-semibold text-primary text-balance", compact ? "text-base" : "text-2xl")}><Inline text={block.text} /></h2>;
      }
      return <h3 className={cn("font-display font-semibold tracking-wide text-primary", compact ? "pt-1 text-sm" : "pt-3 text-base")}><Inline text={block.text} /></h3>;
    }
    case "list":
      return (
        <ol className="grid gap-1.5 pl-6">
          {block.items.map((item, index) => (
            // The documents restart or repeat numbers inside a list (a section's number, then its items): keyed by position.
            <li key={index} value={item.number} className="list-decimal pl-1 marker:text-muted-foreground">
              <Inline text={item.text} />
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead className="bg-muted">
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index} scope="col" className="border-b px-3 py-2 align-bottom font-semibold">
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b last:border-b-0">
                  {row.map((cell, index) => (
                    <td key={index} className="px-3 py-2 align-top">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return <p><Inline text={block.text} /></p>;
  }
}

export function LegalText({ text, compact = false, className }: { text: string; compact?: boolean; className?: string }) {
  return (
    <div data-legal-text="" className={cn("grid leading-relaxed text-pretty", compact ? "gap-2.5 text-sm" : "gap-4 text-[0.95rem]", className)}>
      {parseLegalMarkdown(text).map((block, index) => (
        <Block key={index} block={block} compact={compact} />
      ))}
    </div>
  );
}
