import { stripLeadingRomanNumeral } from "./datos-generales-display";
import { useDocumentTheme } from "@/features/valuations/components/document-theme";

const EMPTY_TITLE = "No se proporcionó";

export function formatDocumentBlockTitle(label: string, title: string) {
  const romanLabel = label.trim().replace(/\.+$/, "");
  const editableTitle = stripLeadingRomanNumeral(title).trim() || EMPTY_TITLE;
  return romanLabel ? `${romanLabel}. ${editableTitle}` : editableTitle;
}

export function DocumentBlockTitleBar({ label, title }: { label: string; title: string }) {
  const theme = useDocumentTheme();
  return (
    <h2 className={theme.sectionTitle}>
      {formatDocumentBlockTitle(label, title)}
    </h2>
  );
}
