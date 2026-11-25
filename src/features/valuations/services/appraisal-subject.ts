/**
 * «Clase de avalúo» and «¿Qué se está valuando?» (24 Nov 2026): a valuation
 * is of real estate, of machinery and equipment or agricultural, and in
 * essence it values one thing — a house, an office, a backhoe, an aircraft, a
 * crop. The class decides the terms the document uses (a machinery valuation
 * speaks of a «bien mueble»); the essence names what is valued, prints in the
 * value's title and orders the firm's valuations.
 *
 * Neither has a column of its own: they live in the subject property's
 * characteristics (`claseAvaluo`, `queSeValua`), beside the names of the
 * kinds of the appraiser's own (property-kinds.ts). The catalog's «Tipo de
 * bien» (devpware_tipos_inmuebles) follows from them, so everything that read
 * it (the machinery panels, the sections hidden at creation, the filters of
 * the list) keeps working; a valuation created before them reads both from it.
 *
 * Pure TypeScript — no React, no database.
 */
import { NEW_OWN_CHOICE, normalizePropertyKind, OTHER_PROPERTY_KIND, type ExtendableChoice } from "./property-kinds";

export const APPRAISAL_CLASSES = ["INMUEBLE", "MAQUINARIA", "AGROPECUARIO"] as const;
export type AppraisalClass = (typeof APPRAISAL_CLASSES)[number];

export const APPRAISAL_CLASS_LABELS: Record<AppraisalClass, string> = {
  INMUEBLE: "Inmueble",
  MAQUINARIA: "Maquinaria y equipo",
  AGROPECUARIO: "Agropecuario",
};

export const isAppraisalClass = (value: unknown): value is AppraisalClass =>
  typeof value === "string" && (APPRAISAL_CLASSES as readonly string[]).includes(value);

/** Longest essence kept; as long as «¿Cuál?» of the kinds. */
export const MAX_ESSENCE_LENGTH = 80;

/**
 * An essence the system proposes. `propertyKind`: the catalog's «Tipo de
 * bien» it stands for (an essence of a real estate valuation that is none of
 * them is «otro» with its name). `feminine`: «DE LA RETROEXCAVADORA», not
 * «DEL…». `vehicle`: a machine on wheels measured in km, whose carátula and
 * comparables take the automobile book's fields (vehicle-fields.ts).
 */
export type EssenceProposal = { name: string; propertyKind?: string; feminine?: boolean; vehicle?: boolean };

/**
 * The common ones of each class, as the portals list them (Mercado Libre,
 * Facebook: «oficina en renta», «nave industrial o bodega», «retroexcavadora»).
 * The firm adds its own; nobody can list them all.
 */
export const ESSENCE_PROPOSALS: Record<AppraisalClass, readonly EssenceProposal[]> = {
  INMUEBLE: [
    { name: "Casa habitación", propertyKind: "casa_habitacion", feminine: true },
    { name: "Departamento", propertyKind: "departamento" },
    { name: "Oficina", propertyKind: "oficina", feminine: true },
    { name: "Local comercial", propertyKind: "local_comercial" },
    // «Nave industrial o bodega, que se entiende que es lo mismo».
    { name: "Bodega / Nave industrial", propertyKind: "bodega", feminine: true },
    { name: "Edificio", propertyKind: "edificio" },
    { name: "Terreno", propertyKind: "terreno" },
    { name: "Terreno rural", propertyKind: "rural" },
    { name: "Inmueble de uso mixto", propertyKind: "mixto" },
  ],
  MAQUINARIA: [
    { name: "Automóvil", vehicle: true },
    { name: "Camioneta", feminine: true, vehicle: true },
    { name: "Camión", vehicle: true },
    { name: "Motocicleta", feminine: true, vehicle: true },
    { name: "Retroexcavadora", feminine: true },
    { name: "Maquinaria de construcción", feminine: true },
    { name: "Maquinaria industrial", feminine: true },
    { name: "Equipo" },
    { name: "Aeronave", feminine: true },
    { name: "Embarcación", feminine: true },
  ],
  AGROPECUARIO: [
    { name: "Cultivo" },
    { name: "Ganado" },
    { name: "Forestal" },
  ],
};

/** The catalog's «Tipo de bien» of each class without an essence of its own: machinery, and the land of a farm. */
const CLASS_PROPERTY_KIND: Record<Exclude<AppraisalClass, "INMUEBLE">, string> = {
  MAQUINARIA: "maquinaria_equipo",
  AGROPECUARIO: "rural",
};

/** Essences compare without case, accents or extra spaces: «retroexcavadora» is «Retroexcavadora». */
export const essenceKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** An essence as it is kept: single spaces, trimmed, within its length. */
export const normalizeEssence = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, MAX_ESSENCE_LENGTH);

export function classOfPropertyKind(propertyKind: string | null | undefined): AppraisalClass {
  return normalizePropertyKind(propertyKind) === CLASS_PROPERTY_KIND.MAQUINARIA ? "MAQUINARIA" : "INMUEBLE";
}

const proposalOf = (appraisalClass: AppraisalClass, name: string) =>
  ESSENCE_PROPOSALS[appraisalClass].find((proposal) => essenceKey(proposal.name) === essenceKey(name));

/**
 * The catalog's «Tipo de bien» a class and essence stand for, by its
 * lowercase key: machinery is «maquinaria_equipo» whatever the machine;
 * real estate the kind of its essence, or «otro» (named after the essence);
 * agricultural, the rural land.
 */
export function propertyKindFor(appraisalClass: AppraisalClass, essence: string | null | undefined): string {
  if (appraisalClass !== "INMUEBLE") return CLASS_PROPERTY_KIND[appraisalClass];
  return proposalOf("INMUEBLE", essence ?? "")?.propertyKind ?? OTHER_PROPERTY_KIND;
}

/**
 * The essence a valuation of before (or one created from the API without it)
 * reads from its «Tipo de bien»: the proposal of that kind («industrial» and
 * «bodega» are one), the name of its «Otro». Machinery of before has none:
 * it was only «Maquinaria y equipo».
 */
function essenceOfPropertyKind(propertyKind: string | null | undefined, ownName: string | undefined): string {
  const kind = normalizePropertyKind(propertyKind);
  if (kind === OTHER_PROPERTY_KIND) return ownName ?? "";
  const lookup = kind === "industrial" ? "bodega" : kind;
  return ESSENCE_PROPOSALS.INMUEBLE.find((proposal) => proposal.propertyKind === lookup)?.name ?? "";
}

export type AppraisalSubject = { appraisalClass: AppraisalClass; essence: string };

/**
 * The class and essence of a valuation: the ones saved with it, or the ones
 * its «Tipo de bien» stands for. A machinery «Tipo de bien» is machinery
 * whatever was saved, since its panels depend on it.
 */
export function readAppraisalSubject(
  characteristics: unknown,
  propertyKind: string | null | undefined,
): AppraisalSubject {
  const record = characteristics && typeof characteristics === "object" && !Array.isArray(characteristics)
    ? (characteristics as Record<string, unknown>)
    : {};
  const fromKind = classOfPropertyKind(propertyKind);
  const saved = isAppraisalClass(record.claseAvaluo) ? record.claseAvaluo : null;
  // Only machinery is fixed by the kind; real estate and agricultural share the catalog's kinds.
  const appraisalClass = fromKind === "MAQUINARIA" ? "MAQUINARIA" : saved === "MAQUINARIA" ? fromKind : saved ?? fromKind;
  const ownName = typeof record.tipoBienOtro === "string" && record.tipoBienOtro.trim() ? record.tipoBienOtro.trim() : undefined;
  const essence = typeof record.queSeValua === "string" && record.queSeValua.trim()
    ? normalizeEssence(record.queSeValua)
    : appraisalClass === "INMUEBLE" ? essenceOfPropertyKind(propertyKind, ownName) : "";
  return { appraisalClass, essence };
}

/**
 * What «¿Qué se está valuando?» offers for a class: the proposals, then the
 * firm's own, once each however they were written; the one a valuation
 * already has stays in the list even when nobody saved it.
 */
export function essenceOptions(appraisalClass: AppraisalClass, firmOwn: readonly string[], current?: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const name of [...ESSENCE_PROPOSALS[appraisalClass].map((proposal) => proposal.name), ...firmOwn, current ?? ""]) {
    const kept = normalizeEssence(name);
    if (!kept || seen.has(essenceKey(kept))) continue;
    seen.add(essenceKey(kept));
    names.push(kept);
  }
  return names;
}

/** «¿Qué se está valuando?» as a list of choices: the options and «Otro…» to type a new one. */
export function essenceChoices(appraisalClass: AppraisalClass, firmOwn: readonly string[], current?: string): ExtendableChoice[] {
  return [
    ...essenceOptions(appraisalClass, firmOwn, current).map((name) => ({ value: name, label: name })),
    { value: NEW_OWN_CHOICE, label: "Otro… (escribir uno nuevo)" },
  ];
}

/** The first essence a new valuation of a class proposes; real estate starts on a house, as the catalog did. */
export const defaultEssence = (appraisalClass: AppraisalClass) => ESSENCE_PROPOSALS[appraisalClass][0]?.name ?? "";

/**
 * Whether «DE LA» goes before the essence: the proposals say; a name of the
 * firm's own is feminine when its first word ends in «a» («Grúa», «Draga»,
 * «Máquina envasadora»), which Spanish mostly keeps.
 */
function isFeminine(essence: string) {
  const proposal = APPRAISAL_CLASSES.map((appraisalClass) => proposalOf(appraisalClass, essence)).find(Boolean);
  if (proposal) return proposal.feminine === true;
  const first = essenceKey(essence).split(/[\s/]+/)[0] ?? "";
  return first.endsWith("a");
}

/**
 * Whether what is valued is a vehicle (Automóvil, Camioneta, Camión,
 * Motocicleta): its carátula and its comparables take the fields of the
 * firm's automobile book instead of the generic machine's. Only machinery
 * has vehicles.
 */
export function isVehicleEssence(essence: string | null | undefined): boolean {
  return proposalOf("MAQUINARIA", essence ?? "")?.vehicle === true;
}

/** «de la retroexcavadora», «del automóvil»: the essence after a «de», lowercase, with its article. */
export function ofTheEssence(essence: string) {
  const name = normalizeEssence(essence);
  return `${isFeminine(name) ? "de la" : "del"} ${name.toLocaleLowerCase("es-MX")}`;
}
