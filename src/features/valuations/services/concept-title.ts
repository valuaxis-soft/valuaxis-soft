export function normalizeConceptTitle(title: string) {
  return title.replace(/[\s:]+$/g, "");
}

export function formatConceptTitleWithColon(title: string) {
  const normalized = normalizeConceptTitle(title);
  return normalized.trim() ? `${normalized}:` : "";
}
