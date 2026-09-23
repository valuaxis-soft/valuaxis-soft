import { AUTH_PERMISSIONS, type AuthPermission } from "@/features/auth/model";

export type ValuationSectionKey =
  | "CARATULA"
  | "DATOS_GENERALES"
  | "TERRENO"
  | "CONSTRUCCION"
  | "CONSIDERACIONES"
  | "COSTOS"
  | "MERCADO_VENTA"
  | "MERCADO_RENTAS"
  | "INGRESOS"
  | "FOTOS_SUJETO"
  | "CROQUIS_COMPARABLES"
  | "HOMOLOGACION"
  | "INDIRECTOS"
  | "CONCLUSIONES"
  | "MAPA_COMPARABLES";

export type ValuationSectionKind = "normalized" | "document" | "hybrid";

export type ValuationSectionDefinition = {
  key: ValuationSectionKey;
  label: string;
  order: number;
  kind: ValuationSectionKind;
  required: boolean;
  visibleByDefault: boolean;
  editable: boolean;
  tables: string[];
  permissions: AuthPermission[];
};

export const valuationSectionRegistry: ValuationSectionDefinition[] = [
  {
    key: "CARATULA",
    label: "CARATULA",
    order: 10,
    kind: "normalized",
    required: true,
    visibleByDefault: true,
    editable: true,
    tables: ["CaratulaAvaluo"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "DATOS_GENERALES",
    label: "DATOS",
    order: 20,
    kind: "normalized",
    required: true,
    visibleByDefault: true,
    editable: true,
    tables: ["DatoGeneralAvaluo"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "TERRENO",
    label: "INF TERRENO",
    order: 30,
    kind: "normalized",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["TerrenoAvaluo", "ViaAccesoAvaluo", "ColindanciaAvaluo", "Orientacion"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "CONSTRUCCION",
    label: "INF CONSTRUCCIONES",
    order: 50,
    kind: "normalized",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: [
      "ConstruccionAvaluo",
      "TipoConstruccionAvaluo",
      "ElementoConstruccionAvaluo",
      "InstalacionEspecialAvaluo",
    ],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "CONSIDERACIONES",
    label: "CONSIDERACIONES",
    order: 60,
    kind: "normalized",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["ConsideracionAvaluo"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "COSTOS",
    label: "ENF. COSTOS",
    order: 70,
    kind: "normalized",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["EnfoqueCosto", "CostoTerreno", "CostoConstruccion", "CostoInstalacion", "CostoIndirecto"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "MERCADO_VENTA",
    label: "ENF. MERCADO VENTA",
    order: 80,
    kind: "hybrid",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["EnfoqueMercado", "ComparableAvaluo", "FactorHomologacion", "AjusteComparable"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "MERCADO_RENTAS",
    label: "MERCADO RENTAS",
    order: 90,
    kind: "hybrid",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["EnfoqueRenta", "ComparableAvaluo", "FactorHomologacion", "AjusteComparable"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "INGRESOS",
    label: "ENF. INGRESOS",
    order: 100,
    kind: "normalized",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["EnfoqueIngreso", "DeduccionIngreso"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "FOTOS_SUJETO",
    label: "FOTOGRAFÍAS SUJETO",
    order: 110,
    kind: "document",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["Archivo", "RelacionArchivo", "VersionArchivo", "CargaArchivo"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "CROQUIS_COMPARABLES",
    label: "CROQUIS Y FOTO COMP",
    order: 120,
    kind: "hybrid",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["CapturaMapa", "ComparableAvaluo", "Geocodificacion"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "HOMOLOGACION",
    label: "FACT. HOMOLOGACION",
    order: 130,
    kind: "hybrid",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["FactorHomologacion", "AjusteComparable", "TipoFactorHomologacion"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "INDIRECTOS",
    label: "INDIRECTOS",
    order: 140,
    kind: "normalized",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["CostoIndirecto"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "CONCLUSIONES",
    label: "CONCLUSIÓN",
    order: 150,
    kind: "normalized",
    required: true,
    visibleByDefault: true,
    editable: true,
    tables: ["ResumenValor", "ConclusionAvaluo"],
    permissions: [AUTH_PERMISSIONS.concludeValuations, AUTH_PERMISSIONS.editValuations],
  },
  {
    key: "MAPA_COMPARABLES",
    label: "MAPA COMPARABLES",
    order: 160,
    kind: "hybrid",
    required: false,
    visibleByDefault: true,
    editable: true,
    tables: ["Propiedad", "DireccionPropiedad", "BusquedaComparable", "ZonaBusquedaComparable"],
    permissions: [AUTH_PERMISSIONS.editValuations],
  },
];

export function findSectionDefinition(key: string) {
  const normalized = getCanonicalSectionKey(key);
  return valuationSectionRegistry.find((section) => section.key === normalized);
}

export function getOrderedValuationSections() {
  return [...valuationSectionRegistry].sort((a, b) => a.order - b.order);
}

export function sectionKeyToWorkspaceId(key: string) {
  return getCanonicalSectionKey(key)
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function normalizeSectionKey(key: string): ValuationSectionKey | string {
  return getCanonicalSectionKey(key);
}

export function getCanonicalSectionKey(key: string): ValuationSectionKey | string {
  const compact = compactSectionKey(key);
  return sectionAliasMap.get(compact) ?? compact;
}

export function compactSectionKey(key: string) {
  return key
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

const sectionAliasMap = new Map<string, ValuationSectionKey>();

for (const definition of valuationSectionRegistry) {
  const aliases = [
    definition.key,
    sectionKeyToWorkspaceIdFromCanonical(definition.key),
    definition.label,
  ];
  for (const alias of aliases) {
    sectionAliasMap.set(compactSectionKey(alias), definition.key);
  }
}

sectionAliasMap.set(compactSectionKey("INDICADORES"), "MAPA_COMPARABLES");
sectionAliasMap.set(compactSectionKey("MAPA_COMPARABLES"), "MAPA_COMPARABLES");
sectionAliasMap.set(compactSectionKey("mapacomparables"), "MAPA_COMPARABLES");
sectionAliasMap.set(compactSectionKey("ZONA"), "TERRENO");

function sectionKeyToWorkspaceIdFromCanonical(key: ValuationSectionKey) {
  return key.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
