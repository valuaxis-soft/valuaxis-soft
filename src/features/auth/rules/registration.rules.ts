export function buildPersonalOrganizationName(name: string) {
  return `Espacio personal de ${name}`.trim();
}

export function buildOrganizationSlug(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return `${base || "organizacion"}-${Date.now().toString(36)}`;
}
