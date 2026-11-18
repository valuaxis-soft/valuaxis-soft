import { stripLeadingRomanNumeral } from "./datos-generales-display";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";

/** The title with its number; empty when the block has no title (it prints none, video 7.1). */
export function formatDocumentBlockTitle(label: string, title: string) {
  const romanLabel = label.trim().replace(/\.+$/, "");
  const editableTitle = stripLeadingRomanNumeral(title).trim();
  if (!editableTitle) return "";
  return romanLabel ? `${romanLabel}. ${editableTitle}` : editableTitle;
}

/** The bar of a block's title; nothing when the title is empty or «Imprimir título» is off. */
export function DocumentBlockTitleBar({ label, title, hidden = false }: { label: string; title: string; hidden?: boolean }) {
  const theme = useDocumentTheme();
  if (hidden || !formatDocumentBlockTitle(label, title)) return null;
  return (
    <h2 className={theme.sectionTitle}>
      {formatDocumentBlockTitle(label, title)}
    </h2>
  );
}
