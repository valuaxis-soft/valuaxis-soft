"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePanelRef } from "react-resizable-panels";
import { useRouter } from "next/navigation";
import {
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  Banknote,
  BookOpenCheck,
  Building2,
  Camera,
  Columns3,
  FileCheck2,
  FileImage,
  FileText,
  Landmark,
  MapPinned,
  ShieldCheck,
} from "lucide-react";

import {
  Comparable,
  ValuationMeta,
  initialComparables,
  initialMeta,
} from "@/features/valuations/services/valuation-constants";
import {
  api,
  type DatosImageResponse,
  type DocumentHeaderImageResponse,
} from "@/lib/api-client";
import {
  valuationMetaFromDb,
  transformComparables,
} from "@/features/valuations/mappers/transform-valuation";
import {
  AppSection,
  Block,
  CaratulaFormData,
  Concept,
  ConceptType,
  ImageContent,
  PrincipalCoverImage,
  Apartado,
  TableContent,
} from "@/features/valuations/model";
import { createInitialSections } from "@/features/valuations/sections";
import {
  ensureTerrenoSections,
  isTerrenoSection,
} from "@/features/valuations/sections/terreno";
import {
  COMPANY_HEADER_BLOCK_ID,
  ensureCompanyHeaderFields,
  readCompanyHeaderFields,
  updateCompanyHeaderFields,
} from "@/features/valuations/services/caratula-company-header";
import { createHomologationTable, ensureTableV2 } from "@/features/valuations/services/table";
import { serializeTableForSave } from "@/features/valuations/services/table-persistence";
import {
  hasUntitledConcepts,
  isCaratulaIntermediateBlock,
  UNTITLED_CARATULA_CONCEPT,
} from "@/features/valuations/services/caratula-blocks";
import {
  applyConceptEditOnlyHere,
  applyConceptUpdateEverywhere,
  changeExistingConceptRelation,
  createIndependentConcept,
  linkConceptToCollection,
  resolveEffectiveConcept,
  unlinkConcept,
  type ExistingConceptRelationMode,
} from "@/features/valuations/concept-links";
import {
  formatMexicanPhone,
  hasCaratulaValidationErrors,
  validateCaratula,
} from "@/features/valuations/services/caratula-validation";
import { isBoundaryDistanceValueFormat } from "@/features/valuations/services/concept-value-format";
import { normalizeBlockFlowV2, isBlockFlowV2 } from "@/features/valuations/services/block-flow";
import { ensureContentLayout, isContentLayout, resolveContentLayout } from "@/features/valuations/services/content-layout";
import { setItemFullRowPreservingOrder, mergeItemToAdjacentRow } from "@/features/valuations/services/content-layout-v2-operations";
import { ReadOnlyValuationAlert } from "@/features/valuations/components/feedback/valuation-error-alert";

/**
 * Ensure a block has BOTH persisted ContentLayoutV2 AND BlockFlowV2.
 *
 * After ANY root-level content mutation (add/remove Concept/Image/Table),
 * canonical Block state must satisfy:
 * 1. business objects correct
 * 2. ContentLayoutV2 correct (content placement)
 * 3. BlockFlowV2 correct (structural ordering with content-row refs)
 *
 * BlockFlowV2 reconciliation preserves existing structural order.
 * Only adds genuinely new refs and removes stale refs.
 */
function ensureBlockContentIntegrity(block: Block): Block {
  let updated = ensureContentLayout(block);

  // Always reconcile BlockFlowV2 against current ContentLayoutV2 + apartados
  // This preserves existing mixed ordering while adding/removing refs
  const existingFlow = updated.blockFlow;
  if (existingFlow && isBlockFlowV2(existingFlow)) {
    // Reconcile existing flow — preserves order, removes stale, adds missing
    updated = { ...updated, blockFlow: normalizeBlockFlowV2(updated, existingFlow) };
  } else {
    // No existing flow — create initial from ContentLayout rows + apartados
    const layout = updated.contentLayout;
    if (layout && isContentLayout(layout) && layout.rows.length > 0) {
      const contentRows = layout.rows.map((row) => ({
        id: `bf-c-${row.id}`,
        items: [{ type: "content-row" as const, rowId: row.id }],
      }));
      const apartadoRows = updated.apartados.map((sb) => ({
        id: `bf-a-${sb.id}`,
        items: [{ type: "apartado" as const, apartadoId: sb.id }],
      }));
      updated = { ...updated, blockFlow: { version: 2, rows: [...contentRows, ...apartadoRows] } };
    }
  }

  return updated;
}
import {
  blockMetadataFromContent,
  conceptMetadataFromContent,
  imageMetadataFromContent,
  sectionMetadataFromContent,
  apartadoMetadataFromContent,
} from "@/features/valuations/metadata";
import { ValuationEditorPanel } from "@/features/valuations/components/workspace/valuation-editor-panel";
import {
  applyMetaPatchToCaratula,
  initializeCaratulaState,
} from "@/features/valuations/components/workspace/valuation-caratula-state";
import {
  focusWorkspacePanels,
  getWorkspaceComposition,
  type SplitLayout,
  type WorkspaceMode,
} from "@/features/valuations/components/workspace/valuation-workspace-layout";
import {
  getExternalPreviewChannelName,
  type ExternalPreviewMessage,
  type ExternalPreviewPayload,
} from "@/features/valuations/components/workspace/external-preview-sync";
import { ValuationPreviewPanel } from "@/features/valuations/components/workspace/valuation-preview-panel";
import { ValuationTopBar } from "@/features/valuations/components/workspace/valuation-top-bar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AuthUser } from "@/features/auth/model";
import type { ValuationDetail } from "@/features/valuations/repositories/valuation.repository";
import { canEditProject, canExportProject } from "@/features/auth/permissions";
import { toast } from "sonner";
import type { SaveStatus } from "@/features/valuations/components/feedback/save-status-indicator";
import { cn } from "@/lib/utils";

const newId = () => crypto.randomUUID();
const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"];
const EDITOR_HISTORY_LIMIT = 50;
const TEXT_EDIT_GROUP_MS = 1200;

const sectionIconMap = {
  caratula: ShieldCheck,
  datos: BookOpenCheck,
  terreno: MapPinned,
  construccion: Building2,
  consideraciones: FileCheck2,
  costos: Landmark,
  mercadoVenta: Banknote,
  mercadoRentas: Banknote,
  ingresos: Banknote,
  fotografias: Camera,
  croquis: FileImage,
  homologacion: FileCheck2,
  indirectos: Columns3,
  conclusiones: FileText,
  mapaComparables: MapPinned,
};

const emptyCaratula: CaratulaFormData = {
  tituloInmueble: "",
  numeroAvaluo: "",
  folio: "",
  direccionEmpresa: "",
  telefonoEmpresa: "",
  correoEmpresa: "",
  solicitante: "",
  propietario: "",
  objeto: "",
  proposito: "",
  valuador: "",
  registroValuador: "",
  valorTotal: "",
  valorConLetra: "",
  fechaAvaluo: "",
  fechaVigencia: "",
};

function defaultTitleForType(type?: ConceptType): string {
  switch (type) {
    case "date": return "Fecha";
    case "phone": return "Teléfono";
    case "email": return "Correo";
    default: return "Nuevo concepto";
  }
}

function createConcept(label?: string, type?: ConceptType): Concept {
  const resolvedLabel =
    label && label !== UNTITLED_CARATULA_CONCEPT
      ? label
      : defaultTitleForType(type);
  return createIndependentConcept({ id: newId(), label: resolvedLabel, value: "", type });
}

function createBlock(conceptLabel?: string): Block {
  return {
    id: newId(),
    title: "NUEVO BLOQUE",
    sectionLabel: "",
    enabled: true,
    required: false,
    startOnNewPage: false,
    concepts: [createConcept(conceptLabel)],
    apartados: [],
    tables: [],
    images: [],
  };
}

function createApartado(): Apartado {
  return {
    id: newId(),
    title: "NUEVO SUBBLOQUE",
    enabled: true,
    startOnNewPage: false,
    concepts: [createConcept()],
    tables: [],
    images: [],
  };
}

function createTable(preset?: "homologation"): TableContent {
  if (preset === "homologation") {
    return createHomologationTable() as unknown as TableContent;
  }
  // Create directly as V2 to avoid mixed-state issues
  const id = `tbl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const colConcepto = `col-concepto-${id}`;
  const colDato = `col-dato-${id}`;
  const colObservacion = `col-observacion-${id}`;
  return {
    id,
    title: "Tabla configurable",
    version: 2,
    columns: [
      { id: colConcepto, name: "Concepto" },
      { id: colDato, name: "Dato" },
      { id: colObservacion, name: "Observacion" },
    ],
    rows: [{
      id: `row-${id}-1`,
      cells: {
        [colConcepto]: { kind: "value", value: "" },
        [colDato]: { kind: "value", value: "" },
        [colObservacion]: { kind: "value", value: "" },
      },
    }],
    enabled: true,
  } as unknown as TableContent;
}

type EditorSnapshot = {
  caratula: CaratulaFormData;
  meta: ValuationMeta;
  sections: AppSection[];
};

type EditorHistoryOptions = {
  groupKey?: string;
  /** Skip structural normalization for leaf content patches (Concept value/title). */
  normalize?: boolean;
};

type EditorHistory = {
  future: EditorSnapshot[];
  lastGroupKey: string | null;
  lastPushedAt: number;
  past: EditorSnapshot[];
};

const DOCUMENT_HEADER_IMAGE_ACCEPT = new Set(["image/png", "image/jpeg", "image/webp"]);
const DOCUMENT_HEADER_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const DOCUMENT_HEADER_IMAGE_FORMAT_ERROR = "Formato no compatible. Usa PNG, JPG, JPEG o WebP.";

function emptyEditorHistory(): EditorHistory {
  return {
    future: [],
    lastGroupKey: null,
    lastPushedAt: 0,
    past: [],
  };
}

function normalizeEditorSections(sections: AppSection[]) {
  return ensureTerrenoSections(
    resequenceSections(sections),
  );
}

function editorSnapshotChanged(current: EditorSnapshot, next: EditorSnapshot) {
  return current.caratula !== next.caratula ||
    current.meta !== next.meta ||
    current.sections !== next.sections;
}

function textEditGroupKey(scope: string, patch: object) {
  const entries = Object.entries(patch).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length || entries.some(([, value]) => typeof value !== "string")) return undefined;
  const keys = entries.map(([key]) => key);
  return `${scope}:${keys.join(",")}`;
}

function getDocumentHeaderImage(sections: AppSection[]) {
  const caratulaSection = sections.find((section) => section.id === "caratula");
  const headerBlock = caratulaSection?.blocks.find((block) => block.id === COMPANY_HEADER_BLOCK_ID);
  return headerBlock?.images.find((image) => image.enabled !== false) ?? null;
}

function imageContentFromDocumentHeaderImage(image: DocumentHeaderImageResponse): ImageContent {
  return {
    id: image.id,
    title: image.filename,
    src: image.url ?? "",
    enabled: true,
  };
}

export function mergeDocumentHeaderImage(
  sections: AppSection[],
  image: DocumentHeaderImageResponse | null,
) {
  return ensureCompanyHeaderFields(sections).map((section) => {
    if (section.id !== "caratula") return section;
    return {
      ...section,
      blocks: section.blocks.map((block) =>
        block.id === COMPANY_HEADER_BLOCK_ID
          ? { ...block, images: image ? [imageContentFromDocumentHeaderImage(image)] : [] }
          : block,
      ),
    };
  });
}
function isSupportedDocumentHeaderImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return DOCUMENT_HEADER_IMAGE_ACCEPT.has(file.type) &&
    DOCUMENT_HEADER_IMAGE_EXTENSIONS.has(extension);
}

export function resequenceSections(sections: AppSection[]) {
  let sectionIndex = 0;
  let globalBlockIndex = 0;
  return sections.map((section) => {
    if (section.enabled === false) return section;
    const label = roman[sectionIndex] ?? `${sectionIndex + 1}`;
    sectionIndex += 1;
    return {
      ...section,
      label,
      blocks: section.blocks.map((block, blockIndex) => {
        if (section.id === "caratula") {
          return { ...block, sectionLabel: `${label}.${blockIndex + 1}` };
        }
        if (!block.enabled) return { ...block, sectionLabel: "" };
        globalBlockIndex += 1;
        return { ...block, sectionLabel: toRomanNumeral(globalBlockIndex) };
      }),
    };
  });
}

function toRomanNumeral(position: number) {
  const digits: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remainder = position;
  let result = "";
  for (const [value, digit] of digits) {
    while (remainder >= value) {
      result += digit;
      remainder -= value;
    }
  }
  return result;
}

export function mergeDatosImages(
  sections: AppSection[],
  storedImages: DatosImageResponse[],
) {
  return sections.map((section) => {
    if (section.id !== "datos" && section.id !== "datosGenerales") return section;
    return {
      ...section,
      blocks: section.blocks.map((block) => {
        const blockImages = storedImages.filter(
          (image) => image.blockId === block.id && !image.subBlockId,
        );
        return {
          ...block,
          images: mergeStoredImages(block.images, blockImages),
          apartados: block.apartados.map((subBlock) => ({
            ...subBlock,
            images: mergeStoredImages(
              subBlock.images,
              storedImages.filter(
                (image) => image.blockId === block.id && image.subBlockId === subBlock.id,
              ),
            ),
          })),
        };
      }),
    };
  });
}

function flattenSectionConcepts(sectionsToRead: AppSection[]) {
  return sectionsToRead.flatMap((section) =>
    section.blocks.flatMap((block) => [
      ...block.concepts,
      ...block.apartados.flatMap((subBlock) => subBlock.concepts),
    ]),
  );
}

function resolveSectionConceptsForDisplay(section: AppSection, allConcepts: Concept[]) {
  return {
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      concepts: block.concepts.map((concept) => resolveEffectiveConcept(concept, allConcepts)),
      apartados: block.apartados.map((subBlock) => ({
        ...subBlock,
        concepts: subBlock.concepts.map((concept) => resolveEffectiveConcept(concept, allConcepts)),
      })),
    })),
  };
}

function mergeStoredImages(current: ImageContent[], stored: DatosImageResponse[]) {
  const storedById = new Map(stored.map((image) => [image.id, image]));
  const merged = current.map((image) => {
    const storedImage = storedById.get(image.id);
    if (!storedImage) return image;
    storedById.delete(image.id);
    return { ...image, src: storedImage.url ?? "" };
  });
  return [
    ...merged,
    ...[...storedById.values()].map((image) => ({
      id: image.id,
      title: image.filename,
      src: image.url ?? "",
      enabled: true,
    })),
  ];
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonRows(value: string): string[][] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.map((row) => (Array.isArray(row) ? row.map(String) : []))
      : [];
  } catch {
    return [];
  }
}

function parseJsonBoundaryDistanceFormats(value?: string): NonNullable<TableContent["boundaryDistanceFormats"]> {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((format) => {
      if (!format || typeof format !== "object" || Array.isArray(format)) return {};
      const value = format as { valueFormat?: unknown; customUnit?: unknown };
      return {
        ...(isBoundaryDistanceValueFormat(value.valueFormat) ? { valueFormat: value.valueFormat } : {}),
        ...(typeof value.customUnit === "string" ? { customUnit: value.customUnit } : {}),
      };
    });
  } catch {
    return [];
  }
}

type StoredTableDto = ValuationDetail["sections"][number]["blocks"][number]["tables"][number];

/** Stored tables load as the lossless TableV2; code templates load from the legacy string grid. */
function hydrateTable(table: StoredTableDto, enabled: boolean): TableContent {
  const boundaryDistanceFormats = parseJsonBoundaryDistanceFormats(table.boundaryDistanceFormats);
  const formats = boundaryDistanceFormats.length ? { boundaryDistanceFormats } : {};
  if (table.table) {
    return { ...table.table, ...formats, enabled } as unknown as TableContent;
  }
  return {
    id: table.id,
    title: table.title,
    columns: parseJsonArray(table.columns),
    columnKeys: parseJsonArray(table.columnKeys ?? "[]"),
    rows: parseJsonRows(table.rows),
    ...formats,
    enabled,
  };
}

function normalizeInitialSections(initialValuation: ValuationDetail): AppSection[] {
  return initialValuation.sections.map((section) => ({
    id: section.id,
    label: section.label,
    title: section.title,
    sourceFile: `${section.title}.pdf`,
    enabled: section.enabled ?? true,
    required: section.required,
    startOnNewPage: section.startOnNewPage ?? false,
    flowSpacingBeforePx: section.flowSpacingBeforePx,
      blocks: section.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      sectionLabel: block.label,
      enabled: block.enabled,
      required: block.required,
      startOnNewPage: block.startOnNewPage ?? false,
      contentLayout: block.contentLayout,
      blockFlow: block.blockFlow,
      conceptPresentation: block.conceptPresentation,
      concepts: block.concepts,
      flowSpacingBeforePx: block.flowSpacingBeforePx,
      apartados: block.subBlocks.map((subBlock) => ({
        id: subBlock.id,
        title: subBlock.title,
        enabled: true,
        startOnNewPage: subBlock.startOnNewPage ?? false,
        contentLayout: subBlock.contentLayout,
        conceptPresentation: subBlock.conceptPresentation,
        concepts: subBlock.concepts,
        flowSpacingBeforePx: subBlock.flowSpacingBeforePx,
        tables: subBlock.tables.map((table) => hydrateTable(table, true)),
        images: subBlock.images.map((image) => ({
          id: image.id,
          title: image.title,
          src: image.url,
          ...imageMetadataFromContent({ ...image, enabled: true }),
        })),
      })),
      tables: block.tables.map((table) => hydrateTable(table, table.enabled)),
      images: block.images.map((image) => ({
        id: image.id,
        title: image.title,
        src: image.url,
        ...imageMetadataFromContent(image),
      })),
    })),
  }));
}

function caratulaFromValuation(
  initialValuation: ValuationDetail | null | undefined,
  meta: ValuationMeta,
  sections: AppSection[],
): CaratulaFormData {
  return {
    ...emptyCaratula,
    ...readCompanyHeaderFields(sections),
    numeroAvaluo: initialValuation?.caratula?.numeroAvaluo || meta.folio,
    folio: initialValuation?.caratula?.folio || meta.folio,
    solicitante: initialValuation?.caratula?.solicitante || meta.client,
    propietario: initialValuation?.caratula?.propietario || meta.client,
    ...initializeCaratulaState(initialValuation?.caratula),
    proposito: initialValuation?.caratula?.proposito || meta.valuationKind,
    valuador: initialValuation?.caratula?.valuador || initialValuation?.user.name || "",
    registroValuador: initialValuation?.caratula?.registroValuador || "",
    valorTotal: initialValuation?.caratula?.valorTotal || "",
    valorConLetra: initialValuation?.caratula?.valorConLetra || "",
    fechaAvaluo: initialValuation?.caratula?.fechaAvaluo || "",
    fechaVigencia: initialValuation?.caratula?.fechaVigencia || "",
  };
}

const subscribeToNothing = () => () => {};

function readStoredExternalPreview(): boolean {
  try {
    return localStorage.getItem("valuoExternalPreview") === "1";
  } catch {
    return false;
  }
}

export function ValuationWorkspace({
  currentUser,
  valuationId: propValuationId,
  initialValuation,
}: {
  currentUser: AuthUser;
  valuationId?: string | null;
  action?: string | null;
  initialValuation?: ValuationDetail | null;
}) {
  const [isDesktopWorkspace, setIsDesktopWorkspace] = useState(false);
  // Always initialize with default values for hydration safety.
  // localStorage is read in useEffect below to restore external preview state.
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("form");
  const [splitLayout, setSplitLayout] = useState<SplitLayout>("horizontal");
  const externalPreviewChannelRef = useRef<BroadcastChannel | null>(null);
  const externalPreviewPayloadRef = useRef<ExternalPreviewPayload | null>(null);
  const externalPreviewWindowRef = useRef<Window | null>(null);
  const previewPanelRef = usePanelRef();
  const editorPanelRef = usePanelRef();

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateLayout = () => setIsDesktopWorkspace(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  // Hydrate workspace mode from localStorage once on the client (adjusted
  // during render). `isClient` is false for SSR and the hydration render, so
  // server and first client render both use "form"/"horizontal" — no mismatch.
  const isClient = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const [storedModeRestored, setStoredModeRestored] = useState(false);
  if (isClient && !storedModeRestored) {
    setStoredModeRestored(true);
    if (readStoredExternalPreview()) {
      setWorkspaceMode("split");
      setSplitLayout("external");
    }
  }
  const handleWorkspaceModeChange = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
  };

  useEffect(() => {
    if (workspaceMode !== "split" || splitLayout === "external") return;
    if (isDesktopWorkspace) {
      focusWorkspacePanels(previewPanelRef.current, editorPanelRef.current, splitLayout);
      return;
    }
    document.getElementById("valuation-preview")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [isDesktopWorkspace, splitLayout, workspaceMode, previewPanelRef, editorPanelRef]);

  const workspaceComposition = getWorkspaceComposition(workspaceMode, splitLayout);

  const router = useRouter();
  const [meta, setMeta] = useState<ValuationMeta>(
    initialValuation ? valuationMetaFromDb(initialValuation) : initialMeta,
  );
  const [sections, setSections] = useState<AppSection[]>(() =>
    ensureCompanyHeaderFields(
      ensureTerrenoSections(
        initialValuation
          ? resequenceSections(normalizeInitialSections(initialValuation))
          : resequenceSections(createInitialSections()),
      ),
    ),
  );
  const [caratula, setCaratula] = useState<CaratulaFormData>(() =>
    caratulaFromValuation(
      initialValuation,
      initialValuation ? valuationMetaFromDb(initialValuation) : initialMeta,
      sections,
    ),
  );
  const [activeSectionId, setActiveSectionId] = useState(
    initialValuation?.sections?.[0]?.id || "caratula",
  );
  const [comparables] = useState<Comparable[]>(
    initialValuation ? transformComparables(initialValuation.comparables ?? []) : initialComparables,
  );
  const valuationId = propValuationId || null;
  const [principalCoverImage, setPrincipalCoverImage] = useState<PrincipalCoverImage | null>(null);
  const [uploadingDocumentHeaderImage, setUploadingDocumentHeaderImage] = useState(false);
  const [uploadingCoverImage, setUploadingCoverImage] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  const saving = saveStatus === "saving";
  const enabledSections = sections;
  const documentHeaderImage = getDocumentHeaderImage(sections);
  const rawActiveSection =
    enabledSections.find((section) => section.id === activeSectionId) ?? enabledSections[0];
  const allConceptsForDisplay = useMemo(() => flattenSectionConcepts(sections), [sections]);
  const activeSection = useMemo(
    () => resolveSectionConceptsForDisplay(rawActiveSection, allConceptsForDisplay),
    [allConceptsForDisplay, rawActiveSection],
  );
  const selectedComparables = comparables.filter((comparable) => comparable.selected);
  const externalPreviewChannelName = getExternalPreviewChannelName(valuationId);
  const externalPreviewPayload = useMemo<ExternalPreviewPayload>(() => ({
    activeSection,
    caratula,
    companyName: currentUser.organizationName,
    documentHeaderImage,
    meta,
    principalCoverImage,
    selectedComparables,
  }), [
    activeSection,
    caratula,
    currentUser.organizationName,
    documentHeaderImage,
    meta,
    principalCoverImage,
    selectedComparables,
  ]);
  const canEdit = canEditProject(currentUser);
  const canExport = canExportProject(currentUser);
  const snapshotRef = useRef<EditorSnapshot | null>(null);
  const historyRef = useRef<EditorHistory>(emptyEditorHistory());
  const savedSnapshotRef = useRef<EditorSnapshot | null>(null);
  // Mirrors whether historyRef has past/future entries so render never reads the ref.
  const [historyAvailability, setHistoryAvailability] = useState({ past: false, future: false });
  const syncHistoryAvailability = () => {
    const past = historyRef.current.past.length > 0;
    const future = historyRef.current.future.length > 0;
    setHistoryAvailability((current) =>
      current.past === past && current.future === future ? current : { past, future },
    );
  };

  // Lazy ref initialization (null-check pattern allowed during render).
  if (snapshotRef.current === null) {
    snapshotRef.current = { caratula, meta, sections };
  }
  if (savedSnapshotRef.current === null) {
    savedSnapshotRef.current = { caratula, meta, sections };
  }

  // Reset undo/redo availability when switching valuations (adjusted during render);
  // the history refs themselves are reset in the effect below.
  const [historyValuationId, setHistoryValuationId] = useState(valuationId);
  if (historyValuationId !== valuationId) {
    setHistoryValuationId(valuationId);
    setHistoryAvailability({ past: false, future: false });
  }

  const canUndo = canEdit && historyAvailability.past;
  const canRedo = canEdit && historyAvailability.future;

  const postExternalPreviewState = useCallback(() => {
    const payload = externalPreviewPayloadRef.current;
    if (!payload) return;

    externalPreviewChannelRef.current?.postMessage({
      type: "preview-state",
      payload,
    } satisfies ExternalPreviewMessage);
  }, []);

  const openExternalPreviewWindow = useCallback(() => {
    if (typeof window === "undefined") return;

    const existingWindow = externalPreviewWindowRef.current;
    if (existingWindow && !existingWindow.closed) {
      existingWindow.focus();
      postExternalPreviewState();
      return;
    }

    const previewUrl = `/workspace/preview-window?id=${encodeURIComponent(valuationId ?? "draft")}`;
    const openedWindow = window.open(previewUrl, `valuation-preview-${valuationId ?? "draft"}`, "popup,width=1100,height=900");

    if (!openedWindow) {
      toast.error("No se pudo abrir la vista en 2 pantallas. Revisa el bloqueo de ventanas emergentes.");
      return;
    }

    externalPreviewWindowRef.current = openedWindow;
    openedWindow.focus();
    // Persist external preview active state so main can restore after F5
    try { localStorage.setItem("valuoExternalPreview", "1"); } catch {}
    postExternalPreviewState();
  }, [postExternalPreviewState, valuationId]);

  const handleSplitLayoutChange = (layout: SplitLayout) => {
    setSplitLayout(layout);
    if (layout === "external") {
      openExternalPreviewWindow();
    }
  };

  useEffect(() => {
    externalPreviewPayloadRef.current = externalPreviewPayload;
    postExternalPreviewState();
  }, [externalPreviewPayload, postExternalPreviewState]);

  useEffect(() => {
    if (workspaceMode !== "split" || splitLayout !== "external") {
      externalPreviewChannelRef.current?.close();
      externalPreviewChannelRef.current = null;
      // Clear external preview flag if user explicitly left external mode
      try { localStorage.removeItem("valuoExternalPreview"); } catch {}
      return;
    }

    if (typeof BroadcastChannel === "undefined") {
      toast.error("Tu navegador no permite sincronizar la vista en 2 pantallas.");
      return;
    }

    const channel = new BroadcastChannel(externalPreviewChannelName);
    externalPreviewChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<ExternalPreviewMessage>) => {
      if (event.data?.type === "preview-ready" || event.data?.type === "main-ready") {
        postExternalPreviewState();
      }
    };

    // Announce main is ready so external popup can request state after F5
    channel.postMessage({ type: "main-ready" } satisfies ExternalPreviewMessage);
    postExternalPreviewState();

    return () => {
      channel.close();
      if (externalPreviewChannelRef.current === channel) {
        externalPreviewChannelRef.current = null;
      }
    };
  }, [externalPreviewChannelName, postExternalPreviewState, splitLayout, workspaceMode]);

  useEffect(() => {
    if (workspaceMode === "split" && splitLayout === "external") {
      openExternalPreviewWindow();
    }
  }, [openExternalPreviewWindow, splitLayout, workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "split" || splitLayout !== "external") return;

    const timer = window.setInterval(() => {
      const externalWindow = externalPreviewWindowRef.current;
      if (externalWindow?.closed) {
        externalPreviewWindowRef.current = null;
        try { localStorage.removeItem("valuoExternalPreview"); } catch {}
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [splitLayout, workspaceMode]);

  const applyEditorSnapshot = (snapshot: EditorSnapshot) => {
    snapshotRef.current = snapshot;
    setMeta(snapshot.meta);
    setSections(snapshot.sections);
    setCaratula(snapshot.caratula);
  };

  const pushEditorHistory = (snapshot: EditorSnapshot, options?: EditorHistoryOptions) => {
    const now = Date.now();
    const history = historyRef.current;
    const groupKey = options?.groupKey;
    const groupWithPrevious = Boolean(
      groupKey &&
      history.lastGroupKey === groupKey &&
      now - history.lastPushedAt <= TEXT_EDIT_GROUP_MS,
    );

    history.lastGroupKey = groupKey ?? null;
    history.lastPushedAt = now;
    history.future = [];

    if (groupWithPrevious) {
      syncHistoryAvailability();
      return;
    }

    history.past = [...history.past, snapshot].slice(-EDITOR_HISTORY_LIMIT);
    syncHistoryAvailability();
  };

  const updateEditorState = (
    updater: (current: EditorSnapshot) => EditorSnapshot,
    options?: EditorHistoryOptions,
  ) => {
    const current = snapshotRef.current ?? { caratula, meta, sections };
    const next = updater(current);
    if (!editorSnapshotChanged(current, next)) return;
    pushEditorHistory(current, options);
    applyEditorSnapshot(next);
    setSaveStatus("dirty");
  };

  const undoEditorChange = () => {
    const history = historyRef.current;
    const previous = history.past.at(-1);
    const current = snapshotRef.current;
    if (!previous || !current || !canEdit) return;

    history.past = history.past.slice(0, -1);
    history.future = [current, ...history.future].slice(0, EDITOR_HISTORY_LIMIT);
    history.lastGroupKey = null;
    history.lastPushedAt = 0;
    applyEditorSnapshot(previous);
    setSaveStatus(savedSnapshotRef.current && !editorSnapshotChanged(previous, savedSnapshotRef.current) ? "saved" : "dirty");
    syncHistoryAvailability();
  };

  const redoEditorChange = () => {
    const history = historyRef.current;
    const next = history.future[0];
    const current = snapshotRef.current;
    if (!next || !current || !canEdit) return;

    history.future = history.future.slice(1);
    history.past = [...history.past, current].slice(-EDITOR_HISTORY_LIMIT);
    history.lastGroupKey = null;
    history.lastPushedAt = 0;
    applyEditorSnapshot(next);
    setSaveStatus(savedSnapshotRef.current && !editorSnapshotChanged(next, savedSnapshotRef.current) ? "saved" : "dirty");
    syncHistoryAvailability();
  };

  useEffect(() => {
    snapshotRef.current = { caratula, meta, sections };
  }, [caratula, meta, sections]);

  // Reset history when the valuation changes (not on mount: the lazy ref init
  // above already holds the initial snapshot). Reads the state current at that commit.
  const historyResetValuationIdRef = useRef(valuationId);
  useEffect(() => {
    if (historyResetValuationIdRef.current === valuationId) return;
    historyResetValuationIdRef.current = valuationId;
    historyRef.current = emptyEditorHistory();
    snapshotRef.current = { caratula, meta, sections };
    savedSnapshotRef.current = { caratula, meta, sections };
  }, [valuationId, caratula, meta, sections]);

  const handleEditorHistoryKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!canEdit || event.defaultPrevented || (!event.ctrlKey && !event.metaKey)) return;
    const key = event.key.toLowerCase();
    const isUndo = key === "z" && !event.shiftKey;
    const isRedo = key === "y" || (key === "z" && event.shiftKey);
    if (!isUndo && !isRedo) return;

    if (isUndo && historyRef.current.past.length > 0) {
      event.preventDefault();
      undoEditorChange();
      return;
    }

    if (isRedo && historyRef.current.future.length > 0) {
      event.preventDefault();
      redoEditorChange();
    }
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => handleEditorHistoryKeyDown(event);
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    if (!valuationId) {
      return;
    }
    api.valuations.coverImage
      .get(valuationId)
      .then((image) => {
        if (active) setPrincipalCoverImage(image);
      })
      .catch(() => {
        if (active) setPrincipalCoverImage(null);
      });
    return () => {
      active = false;
    };
  }, [valuationId]);

  useEffect(() => {
    let active = true;
    if (!valuationId) return;
    api.valuations.documentHeaderImage
      .get(valuationId)
      .then((image) => {
        if (active) setSections((current) => mergeDocumentHeaderImage(current, image));
      })
      .catch(() => {
        // La estructura editable permanece aunque no se pueda renovar la URL temporal.
      });
    return () => {
      active = false;
    };
  }, [valuationId]);

  useEffect(() => {
    let active = true;
    if (!valuationId) return;
    api.valuations.datosImages
      .list(valuationId)
      .then((images) => {
        if (active) setSections((current) => mergeDatosImages(current, images));
      })
      .catch(() => {
        // Los nodos existentes siguen disponibles aunque no se pueda renovar la URL temporal.
      });
    return () => {
      active = false;
    };
  }, [valuationId]);

  const handlePrincipalCoverImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !valuationId || !canEdit) return;
    setUploadingCoverImage(true);
    try {
      const image = await api.valuations.coverImage.upload(valuationId, file);
      setPrincipalCoverImage(image);
      toast.success("Imagen principal actualizada.");
    } catch {
      toast.error("No se pudo subir la imagen. Verifica el archivo.");
    } finally {
      setUploadingCoverImage(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return false;
    const caratulaSection = sections.find((section) => section.id === "caratula");
    if (hasUntitledConcepts(caratulaSection?.blocks ?? [])) {
      setActiveSectionId("caratula");
      setSaveStatus("error");
      toast.error("Revisa los campos sin título antes de guardar.");
      return false;
    }
    if (hasCaratulaValidationErrors(validateCaratula(caratula, meta))) {
      setActiveSectionId("caratula");
      setSaveStatus("error");
      toast.error("Revisa los campos marcados antes de guardar.");
      return false;
    }
    const telefonoEmpresa = formatMexicanPhone(caratula.telefonoEmpresa);
    const caratulaForSave = { ...caratula, telefonoEmpresa };
    const sectionsForSave = updateCompanyHeaderFields(sections, { telefonoEmpresa });
    snapshotRef.current = { caratula: caratulaForSave, meta, sections: sectionsForSave };
    setCaratula(caratulaForSave);
    setSections(sectionsForSave);
    setSaveStatus("saving");
    try {
      const sectionsPayload = sectionsForSave.map((s) => ({
        id: s.id,
        label: s.label,
        title: s.title,
        ...sectionMetadataFromContent({ enabled: s.enabled, flowSpacingBeforePx: s.flowSpacingBeforePx }),
        sortOrder: s.blocks.length > 0 ? sectionsForSave.indexOf(s) : sectionsForSave.indexOf(s),
        blocks: s.blocks.map((b, bi) => ({
          id: b.id,
          label: b.sectionLabel,
          title: b.title,
          ...blockMetadataFromContent(b),
          sortOrder: bi,
          concepts: b.concepts.map((c) => ({
            id: c.id,
            label: c.label,
            value: c.value,
            ...conceptMetadataFromContent({ ...c, enabled: true }),
            rowId: c.rowId,
          })),
          subBlocks: b.apartados.map((sb, sbi) => ({
            id: sb.id,
            title: sb.title,
            ...apartadoMetadataFromContent({ ...sb, enabled: true }),
            sortOrder: sbi,
            concepts: sb.concepts.map((c) => ({
              id: c.id,
              label: c.label,
              value: c.value,
              ...conceptMetadataFromContent({ ...c, enabled: true }),
              rowId: c.rowId,
            })),
            tables: sb.tables.map((t) => serializeTableForSave({ ...t, enabled: true })),
            images: sb.images.map((img) => ({
              id: img.id,
              title: img.title,
              src: s.id === "datos" || s.id === "datosGenerales" || isTerrenoSection(s)
                ? img.id
                : img.src,
              ...imageMetadataFromContent(img),
            })),
          })),
          tables: b.tables.map((t) => serializeTableForSave({ ...t, enabled: true })),
          images: (s.id === "caratula" && b.id === COMPANY_HEADER_BLOCK_ID ? [] : b.images).map((img) => ({
            id: img.id,
            title: img.title,
            src: s.id === "datos" || s.id === "datosGenerales" ? img.id : img.src,
            ...imageMetadataFromContent({ ...img, enabled: true }),
          })),
        })),
      }));

      if (valuationId) {
        await api.valuations.update(valuationId, {
          folio: meta.folio,
          client: meta.client,
          location: meta.location,
          postalCode: meta.postalCode,
          valuationKind: meta.valuationKind,
          propertyKind: meta.propertyKind,
        });

        await api.valuations.saveFull(valuationId, {
          folio: meta.folio,
          client: meta.client,
          location: meta.location,
          postalCode: meta.postalCode,
          valuationKind: meta.valuationKind,
          propertyKind: meta.propertyKind,
          sections: sectionsPayload,
          caratula: caratulaForSave,
        });
      } else {
        throw new Error("Primero crea el avaluo desde el formulario de alta.");
      }
      toast.success("Avaluo guardado correctamente");
      savedSnapshotRef.current = snapshotRef.current ? { ...snapshotRef.current } : null;
      setSaveStatus("saved");
      return true;
    } catch (err) {
      toast.error(`Error al guardar: ${err instanceof Error ? err.message : "Error desconocido"}`);
      setSaveStatus("error");
      return false;
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const updateMeta = (patch: Partial<ValuationMeta>) => {
    updateEditorState((current) => ({
      ...current,
      caratula: applyMetaPatchToCaratula(current.caratula, patch),
      meta: { ...current.meta, ...patch },
    }), { groupKey: textEditGroupKey("meta", patch) });
  };

  const updateSections = (
    updater: (current: AppSection[]) => AppSection[],
    options?: EditorHistoryOptions,
  ) => {
    updateEditorState((current) => ({
      ...current,
      sections: (() => {
        const updatedSections = updater(current.sections);
        if (updatedSections === current.sections) return current.sections;
        // Leaf content patches (Concept value/title) don't need structural normalization
        if (options?.normalize === false) return updatedSections;
        const normalized = normalizeEditorSections(updatedSections);
        return normalized;
      })(),
    }), options);
  };

  const updateCaratula = (patch: Partial<CaratulaFormData>) => {
    updateEditorState((current) => {
      const nextCaratula = { ...current.caratula, ...patch };
      const syncCompanyHeader =
        patch.tituloInmueble !== undefined ||
        patch.direccionEmpresa !== undefined ||
        patch.telefonoEmpresa !== undefined ||
        patch.correoEmpresa !== undefined;

      return {
        ...current,
        caratula: nextCaratula,
        sections: syncCompanyHeader
          ? normalizeEditorSections(updateCompanyHeaderFields(current.sections, patch))
          : current.sections,
      };
    }, { groupKey: textEditGroupKey("caratula", patch) });
  };

  const updateSectionBlocks = (
    sectionId: string,
    updater: (blocks: Block[]) => Block[],
    options?: EditorHistoryOptions,
  ) => {
    updateSections(
      (current) => {
        let changed = false;
        const nextSections = current.map((section) => {
          if (section.id !== sectionId) return section;
          const nextBlocks = updater(section.blocks);
          if (nextBlocks === section.blocks) return section;
          changed = true;
          return { ...section, blocks: nextBlocks };
        });
        return changed ? nextSections : current;
      },
      options,
    );
  };

  const updateSection = (sectionId: string, patch: Partial<AppSection>) => {
    updateSections(
      (current) =>
        current.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)),
      { groupKey: textEditGroupKey(`section:${sectionId}`, patch) },
    );
  };

  const updateDocumentHeaderImage = (image: ImageContent | null) => {
    updateSections((current) =>
      ensureCompanyHeaderFields(current).map((section) => {
        if (section.id !== "caratula") return section;
        return {
          ...section,
          blocks: section.blocks.map((block) =>
            block.id === COMPANY_HEADER_BLOCK_ID
              ? { ...block, images: image ? [image] : [] }
              : block,
          ),
        };
      }),
    );
  };

  const handleDocumentHeaderImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canEdit) return;

    if (!isSupportedDocumentHeaderImage(file)) {
      toast.error(DOCUMENT_HEADER_IMAGE_FORMAT_ERROR);
      return;
    }

    if (!valuationId) {
      toast.error("Guarda el avalúo antes de agregar imagen al encabezado.");
      return;
    }

    setUploadingDocumentHeaderImage(true);
    try {
      const uploaded = await api.valuations.documentHeaderImage.upload(valuationId, file);
      updateDocumentHeaderImage(imageContentFromDocumentHeaderImage(uploaded));
      toast.success("Imagen del encabezado actualizada.");
    } catch {
      toast.error("No se pudo subir la imagen del encabezado.");
    } finally {
      setUploadingDocumentHeaderImage(false);
    }
  };

  const removeDocumentHeaderImage = async () => {
    const previous = documentHeaderImage;
    updateDocumentHeaderImage(null);
    if (!valuationId || !previous) return;

    try {
      await api.valuations.documentHeaderImage.delete(valuationId);
    } catch {
      updateDocumentHeaderImage(previous);
      toast.error("No se pudo eliminar la imagen del encabezado.");
    }
  };

  const addBlock = (sectionId: string) => {
    updateSectionBlocks(sectionId, (blocks) => [
      ...blocks,
      createBlock(sectionId === "caratula" ? UNTITLED_CARATULA_CONCEPT : undefined),
    ]);
  };

  const updateBlock = (sectionId: string, blockId: string, patch: Partial<Block>) => {
    if (process.env.NODE_ENV === "development" && sectionId === "caratula") {
      updateSectionBlocks(
        sectionId,
        (blocks) => {
          const next = blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block));
          return next;
        },
        { groupKey: textEditGroupKey(`block:${blockId}`, patch) },
      );
    } else {
      updateSectionBlocks(
        sectionId,
        (blocks) =>
          blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
        { groupKey: textEditGroupKey(`block:${blockId}`, patch) },
      );
    }
  };

  const removeBlock = (sectionId: string, blockId: string) => {
    updateSectionBlocks(sectionId, (blocks) => {
      return blocks.filter((block) => block.id !== blockId);
    });
  };

  const addConcept = (sectionId: string, blockId: string, type?: ConceptType) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        const newConcept = createConcept(sectionId === "caratula" ? UNTITLED_CARATULA_CONCEPT : undefined, type);
        const updated = {
          ...block,
          concepts: [...block.concepts, newConcept],
        };
        // Persist both ContentLayoutV2 and BlockFlowV2 atomically
        return ensureBlockContentIntegrity(updated);
      }),
    );
  };

  const addConceptFromExisting = (
    sectionId: string,
    blockId: string,
    source: Concept,
    mode: "copy" | "full" | "value",
    apartadoId?: string,
  ) => {
    updateSections((current) => {
      const linkedConcepts = linkConceptToCollection(flattenConcepts(current), source.id, newId(), mode);
      const linkedConcept = linkedConcepts.at(-1);
      if (!linkedConcept || linkedConcepts.length === flattenConcepts(current).length) return current;

      const byId = new Map(linkedConcepts.map((concept) => [concept.id, concept]));
      return current.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) => {
          const nextBlock = {
            ...block,
            concepts: block.concepts.map((concept) => byId.get(concept.id) ?? concept),
      apartados: block.apartados.map((subBlock) => ({
              ...subBlock,
              concepts: subBlock.concepts.map((concept) => byId.get(concept.id) ?? concept),
            })),
          };

          if (section.id === sectionId && block.id === blockId && !apartadoId) {
            return { ...nextBlock, concepts: [...nextBlock.concepts, linkedConcept] };
          }

          if (section.id === sectionId && block.id === blockId && apartadoId) {
            return {
              ...nextBlock,
              apartados: nextBlock.apartados.map((subBlock) =>
                subBlock.id === apartadoId
                  ? { ...subBlock, concepts: [...subBlock.concepts, linkedConcept] }
                  : subBlock,
              ),
            };
          }

          return nextBlock;
        }),
      }));
    });
  };

  const mapAllConcepts = (sectionsToMap: AppSection[], mapper: (concept: Concept) => Concept) =>
    sectionsToMap.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        concepts: block.concepts.map(mapper),
        apartados: block.apartados.map((subBlock) => ({
          ...subBlock,
          concepts: subBlock.concepts.map(mapper),
        })),
      })),
    }));

  const flattenConcepts = (sectionsToRead: AppSection[]) =>
    flattenSectionConcepts(sectionsToRead);

  const applyLinkedConcepts = (
    updater: (concepts: Concept[]) => Concept[],
    options?: EditorHistoryOptions,
  ) => {
    updateSections((current) => {
      const updated = updater(flattenConcepts(current));
      const byId = new Map(updated.map((concept) => [concept.id, concept]));
      return mapAllConcepts(current, (concept) => byId.get(concept.id) ?? concept);
    }, { normalize: false, ...options });
  };

  const updateConceptEverywhere = (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => {
    applyLinkedConcepts(
      (concepts) => applyConceptUpdateEverywhere(concepts, conceptId, patch),
      { groupKey: textEditGroupKey(`linked-concept:${conceptId}`, patch) },
    );
  };

  const editConceptOnlyHere = (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => {
    applyLinkedConcepts(
      (concepts) => applyConceptEditOnlyHere(concepts, conceptId, patch),
      { groupKey: textEditGroupKey(`concept:${conceptId}`, patch) },
    );
  };

  const unlinkConceptEverywhere = (conceptId: string) => {
    applyLinkedConcepts((concepts) =>
      concepts.map((concept) => (concept.id === conceptId ? unlinkConcept(concept, concepts) : concept)),
    );
  };

  const changeConceptRelation = (conceptId: string, mode: ExistingConceptRelationMode) => {
    applyLinkedConcepts((concepts) => changeExistingConceptRelation(concepts, conceptId, mode));
  };

  const updateConcept = (
    sectionId: string,
    blockId: string,
    conceptId: string,
    patch: Partial<Concept>,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;

          const updatedConcepts = block.concepts.map((concept) =>
            concept.id === conceptId ? { ...concept, ...patch } : concept,
          );

          // When layoutSpan toggles, also update ContentLayoutV2 structure
          // so the visual layout matches the metadata.
          let updatedContentLayout = block.contentLayout;
          if (
            patch.layoutSpan !== undefined &&
            isContentLayout(block.contentLayout)
          ) {
            // Operate on the STORED layout directly — do NOT re-normalize via
            // resolveContentLayout, which can append missing content and
            // reorder items, breaking the flat order invariant.
            const v2Result = patch.layoutSpan === "full"
              ? setItemFullRowPreservingOrder(block.contentLayout, conceptId)
              : mergeItemToAdjacentRow(block.contentLayout, conceptId);
            if (v2Result.changed) {
              updatedContentLayout = v2Result.layout;
            }
          }

          return {
            ...block,
            concepts: updatedConcepts,
            contentLayout: updatedContentLayout,
          };
        }),
      { groupKey: textEditGroupKey(`concept:${conceptId}`, patch), normalize: false },
    );
  };

  const removeConcept = (sectionId: string, blockId: string, conceptId: string) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        const updated = { ...block, concepts: block.concepts.filter((concept) => concept.id !== conceptId) };
        return ensureBlockContentIntegrity(updated);
      }),
    );
  };

  const addApartado = (sectionId: string, blockId: string) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) =>
        block.id === blockId ? { ...block, apartados: [...block.apartados, createApartado()] } : block,
      ),
    );
  };

  const updateApartado = (
    sectionId: string,
    blockId: string,
    apartadoId: string,
    patch: Partial<Apartado>,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                apartados: block.apartados.map((subBlock) =>
                  subBlock.id === apartadoId ? { ...subBlock, ...patch } : subBlock,
                ),
              }
            : block,
        ),
      { groupKey: textEditGroupKey(`subBlock:${apartadoId}`, patch) },
    );
  };

  const removeApartado = (sectionId: string, blockId: string, apartadoId: string) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        // 1. Remove SubBlock from apartados array
        const nextSubBlocks = block.apartados.filter((subBlock) => subBlock.id !== apartadoId);
        // 2. Clean up BlockFlowV2 refs — normalize removes stale apartado refs
        let nextBlockFlow = block.blockFlow;
        if (nextBlockFlow && isBlockFlowV2(nextBlockFlow)) {
          const cleanedBlock = { ...block, apartados: nextSubBlocks };
          nextBlockFlow = normalizeBlockFlowV2(cleanedBlock, nextBlockFlow);
        }
        return {
          ...block,
          apartados: nextSubBlocks,
          blockFlow: nextBlockFlow,
        };
      }),
    );
  };

  const addSubConcept = (sectionId: string, blockId: string, apartadoId: string, type?: ConceptType) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              apartados: block.apartados.map((subBlock) => {
                if (subBlock.id !== apartadoId) return subBlock;
                const updated = {
                  ...subBlock,
                  concepts: [...subBlock.concepts, createConcept(undefined, type)],
                };
                // Reconcile content layout so the new concept appears in the form
                return { ...updated, contentLayout: resolveContentLayout(updated) };
              }),
            }
          : block,
      ),
    );
  };

  const updateSubConcept = (
    sectionId: string,
    blockId: string,
    apartadoId: string,
    conceptId: string,
    patch: Partial<Concept>,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                apartados: block.apartados.map((subBlock) =>
                  subBlock.id === apartadoId
                    ? {
                        ...subBlock,
                        concepts: subBlock.concepts.map((concept) =>
                          concept.id === conceptId ? { ...concept, ...patch } : concept,
                        ),
                      }
                    : subBlock,
                ),
              }
            : block,
        ),
      { groupKey: textEditGroupKey(`concept:${conceptId}`, patch), normalize: false },
    );
  };

  const removeSubConcept = (
    sectionId: string,
    blockId: string,
    apartadoId: string,
    conceptId: string,
  ) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              apartados: block.apartados.map((subBlock) => {
                if (subBlock.id !== apartadoId) return subBlock;
                const updated = {
                  ...subBlock,
                  concepts: subBlock.concepts.filter((concept) => concept.id !== conceptId),
                };
                // Reconcile content layout to remove the stale ref
                return { ...updated, contentLayout: resolveContentLayout(updated) };
              }),
            }
          : block,
      ),
    );
  };

  const addTable = (sectionId: string, blockId: string, apartadoId?: string, preset?: "homologation") => {
    const table = createTable(preset);
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        if (!apartadoId) {
          const updated = { ...block, tables: [...block.tables, table] };
          return ensureBlockContentIntegrity(updated);
        }
        return {
          ...block,
          apartados: block.apartados.map((subBlock) => {
            if (subBlock.id !== apartadoId) return subBlock;
            const updated = { ...subBlock, tables: [...subBlock.tables, table] };
            // Reconcile content layout so the new table appears in the form
            return { ...updated, contentLayout: resolveContentLayout(updated) };
          }),
        };
      }),
    );
  };

  const addHomologationTable = (sectionId: string, blockId: string, apartadoId?: string) => {
    addTable(sectionId, blockId, apartadoId, "homologation");
  };

  const updateTable = (
    sectionId: string,
    blockId: string,
    tableId: string,
    updater: (table: TableContent) => TableContent,
    apartadoId?: string,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (!apartadoId) {
            return {
              ...block,
              tables: block.tables.map((table) => (table.id === tableId ? updater(table) : table)),
            };
          }
          return {
            ...block,
            apartados: block.apartados.map((subBlock) =>
              subBlock.id === apartadoId
                ? {
                    ...subBlock,
                    tables: subBlock.tables.map((table) =>
                      table.id === tableId ? updater(table) : table,
                    ),
                  }
                : subBlock,
            ),
          };
        }),
      { groupKey: `table:${tableId}` },
    );
  };

  const addTableColumn = (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => {
    updateTable(
      sectionId,
      blockId,
      tableId,
      (table) => {
        const v2 = ensureTableV2(table);
        const newColId = `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const newCol = { id: newColId, name: `Columna ${v2.columns.length + 1}` };
        const newRows = v2.rows.map((row) => ({
          ...row,
          cells: { ...row.cells, [newColId]: { kind: "value" as const, value: "" } },
        }));
        return { ...v2, columns: [...v2.columns, newCol], rows: newRows } as unknown as TableContent;
      },
      apartadoId,
    );
  };

  const addTableRow = (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => {
    updateTable(
      sectionId,
      blockId,
      tableId,
      (table) => {
        const v2 = ensureTableV2(table);
        const newRowId = `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const cells: Record<string, { kind: "value"; value: string }> = {};
        for (const col of v2.columns) {
          cells[col.id] = { kind: "value", value: "" };
        }
        return { ...v2, rows: [...v2.rows, { id: newRowId, cells }] } as unknown as TableContent;
      },
      apartadoId,
    );
  };

  const removeTable = (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        if (!apartadoId) {
          const updated = { ...block, tables: block.tables.filter((table) => table.id !== tableId) };
          return ensureBlockContentIntegrity(updated);
        }
        return {
          ...block,
          apartados: block.apartados.map((subBlock) => {
            if (subBlock.id !== apartadoId) return subBlock;
            const updated = { ...subBlock, tables: subBlock.tables.filter((table) => table.id !== tableId) };
            // Reconcile content layout to remove the stale ref
            return { ...updated, contentLayout: resolveContentLayout(updated) };
          }),
        };
      }),
    );
  };

  const addImage = async (
    sectionId: string,
    blockId: string,
    event: ChangeEvent<HTMLInputElement>,
    apartadoId?: string,
    replaceImageId?: string,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      toast.loading("Subiendo imagen...");
      const isDatos = sectionId === "datos" || sectionId === "datosGenerales";
      if (isDatos && !valuationId) {
        throw new Error("Guarda el avalúo antes de agregar imágenes a Datos generales.");
      }
      const uploaded = isDatos
        ? await api.valuations.datosImages.upload(
            valuationId!,
            file,
            blockId,
            apartadoId,
          )
        : await api.uploads.create(file);
      toast.dismiss();
      toast.success("Imagen subida");

      const image: ImageContent = {
        id: isDatos ? uploaded.id : newId(),
        title: isDatos ? uploaded.filename : file.name,
        src: uploaded.url ?? "",
        enabled: true,
      };
      updateSectionBlocks(sectionId, (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (!apartadoId) {
            const updated = {
              ...block,
              images: replaceImageId
                ? block.images.map((current) => current.id === replaceImageId
                  ? { ...image, id: current.id, title: current.title || image.title }
                  : current)
                : [...block.images, image],
            };
            return ensureBlockContentIntegrity(updated);
          }
          return {
            ...block,
            apartados: block.apartados.map((subBlock) => {
              if (subBlock.id !== apartadoId) return subBlock;
              const updated = {
                ...subBlock,
                images: replaceImageId
                  ? subBlock.images.map((current) => current.id === replaceImageId
                    ? { ...image, id: current.id, title: current.title || image.title }
                    : current)
                  : [...subBlock.images, image],
              };
              // Reconcile content layout so the new image appears in the form
              return { ...updated, contentLayout: resolveContentLayout(updated) };
            }),
          };
        }),
      );
    } catch (err) {
      toast.dismiss();
      toast.error(`Error al subir imagen: ${err instanceof Error ? err.message : "Error desconocido"}`);
    }
    event.target.value = "";
  };

  const updateImage = (
    sectionId: string,
    blockId: string,
    imageId: string,
    patch: Partial<ImageContent>,
    apartadoId?: string,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (!apartadoId) {
            return {
              ...block,
              images: block.images.map((image) => (image.id === imageId ? { ...image, ...patch } : image)),
            };
          }
          return {
            ...block,
            apartados: block.apartados.map((subBlock) =>
              subBlock.id === apartadoId
                ? {
                    ...subBlock,
                    images: subBlock.images.map((image) =>
                      image.id === imageId ? { ...image, ...patch } : image,
                    ),
                  }
                : subBlock,
            ),
          };
        }),
      { groupKey: textEditGroupKey(`image:${imageId}`, patch) },
    );
  };

  const removeImage = async (
    sectionId: string,
    blockId: string,
    imageId: string,
    apartadoId?: string,
  ) => {
    const isDatos = sectionId === "datos" || sectionId === "datosGenerales";
    const targetSection = sections.find((section) => section.id === sectionId);
    const targetBlock = targetSection?.blocks.find((block) => block.id === blockId);
    const targetSubBlock = targetBlock?.apartados.find((subBlock) => subBlock.id === apartadoId);
    // Capture the image for surgical rollback before optimistic removal
    let removedImage: { image: ImageContent; index: number; inSubBlock: boolean } | null = null;
    if (isDatos && valuationId) {
      const container = apartadoId ? targetSubBlock : targetBlock;
      if (container) {
        const idx = container.images.findIndex((img) => img.id === imageId);
        if (idx !== -1) {
          removedImage = { image: container.images[idx], index: idx, inSubBlock: Boolean(apartadoId) };
        }
      }
      // Optimistic: remove from local state immediately so any concurrent
      // handleSave builds its payload without this image.
      updateSectionBlocks(sectionId, (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (!apartadoId) return { ...block, images: block.images.filter((image) => image.id !== imageId) };
          return {
            ...block,
            apartados: block.apartados.map((subBlock) => {
              if (subBlock.id !== apartadoId) return subBlock;
              const updated = { ...subBlock, images: subBlock.images.filter((image) => image.id !== imageId) };
              return { ...updated, contentLayout: resolveContentLayout(updated) };
            }),
          };
        }),
      );
      try {
        await api.valuations.datosImages.delete(valuationId, imageId);
      } catch (error) {
        // Surgical rollback: re-insert only the removed image at its original position
        if (removedImage) {
          updateSectionBlocks(sectionId, (blocks) =>
            blocks.map((block) => {
              if (block.id !== blockId) return block;
              if (removedImage!.inSubBlock) {
                if (apartadoId === undefined) return block;
                return {
                  ...block,
                  apartados: block.apartados.map((subBlock) => {
                    if (subBlock.id !== apartadoId) return subBlock;
                    // Guard against duplicate if image was re-added by other means
                    if (subBlock.images.some((img) => img.id === imageId)) return subBlock;
                    const reinserted = [...subBlock.images];
                    reinserted.splice(removedImage!.index, 0, removedImage!.image);
                    const updated = { ...subBlock, images: reinserted };
                    return { ...updated, contentLayout: resolveContentLayout(updated) };
                  }),
                };
              }
              // Block-level rollback
              if (block.images.some((img) => img.id === imageId)) return block;
              const reinserted = [...block.images];
              reinserted.splice(removedImage!.index, 0, removedImage!.image);
              return { ...block, images: reinserted };
            }),
          );
        }
        toast.error(`No se pudo quitar la imagen: ${error instanceof Error ? error.message : "Error desconocido"}`);
        return;
      }
      return;
    }
    // Non-DATOS path: local-only removal (no backend delete needed)
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        if (!apartadoId) return { ...block, images: block.images.filter((image) => image.id !== imageId) };
        return {
          ...block,
          apartados: block.apartados.map((subBlock) => {
            if (subBlock.id !== apartadoId) return subBlock;
            const updated = { ...subBlock, images: subBlock.images.filter((image) => image.id !== imageId) };
            return { ...updated, contentLayout: resolveContentLayout(updated) };
          }),
        };
      }),
    );
  };

  const onBlockDragEnd = (sectionId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    updateSectionBlocks(sectionId, (blocks) => {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);
      return arrayMove(blocks, oldIndex, newIndex);
    });
  };

  const moveBlock = (sectionId: string, blockId: string, direction: -1 | 1) => {
    updateSectionBlocks(sectionId, (blocks) => {
      const isDatos = sectionId === "datos" || sectionId === "datosGenerales";
      const movableBlocks = isDatos
        ? blocks
        : blocks.filter(
            (block) => block.id !== COMPANY_HEADER_BLOCK_ID && isCaratulaIntermediateBlock(block),
          );
      const currentPosition = movableBlocks.findIndex((block) => block.id === blockId);
      const targetBlock = movableBlocks[currentPosition + direction];
      if (currentPosition < 0 || !targetBlock) return blocks;
      const currentIndex = blocks.findIndex((block) => block.id === blockId);
      const targetIndex = blocks.findIndex((block) => block.id === targetBlock.id);
      return arrayMove(blocks, currentIndex, targetIndex);
    });
  };

  const handleExportPdf = async () => {
    if (!valuationId) return;
    try {
      toast.loading("Generando PDF...");
      const res = await fetch(`/api/avaluos/${valuationId}/export`);
      if (!res.ok) throw new Error("Error al generar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avaluo-${meta.folio}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success("PDF generado correctamente");
    } catch {
      toast.dismiss();
      toast.error("Error al generar PDF");
    }
  };

  const handleExit = () => {
    if (saveStatus === "dirty" || saveStatus === "error") {
      setExitDialogOpen(true);
      return;
    }
    router.push("/dashboard");
  };

  const handleSaveAndExit = async () => {
    const ok = await handleSave();
    if (ok) router.push("/dashboard");
  };

  const editorPanel = (
    <>
      {enabledSections.map((section) => (
        <TabsContent value={section.id} key={section.id}>
          <ValuationEditorPanel
            section={section}
            allSections={enabledSections}
            readOnly={!canEdit}
            sensors={sensors}
            onAddBlock={addBlock}
            onAddConcept={addConcept}
            onAddConceptFromExisting={addConceptFromExisting}
            onAddImage={addImage}
            onAddApartado={addApartado}
            onAddSubConcept={addSubConcept}
            onAddTable={addTable}
            onAddHomologationTable={addHomologationTable}
            onAddTableColumn={addTableColumn}
            onAddTableRow={addTableRow}
            onBlockDragEnd={onBlockDragEnd}
            onMoveBlock={moveBlock}
            onRemoveBlock={removeBlock}
            onRemoveConcept={removeConcept}
            onRemoveImage={removeImage}
            onRemoveApartado={removeApartado}
            onRemoveSubConcept={removeSubConcept}
            onRemoveTable={removeTable}
            onUpdateBlock={updateBlock}
            onUpdateSection={updateSection}
            onUpdateConcept={updateConcept}
            onUpdateConceptEverywhere={updateConceptEverywhere}
            onEditConceptOnlyHere={editConceptOnlyHere}
            onChangeConceptRelation={changeConceptRelation}
            onUnlinkConcept={unlinkConceptEverywhere}
            onUpdateImage={updateImage}
            onUpdateApartado={updateApartado}
            onUpdateSubConcept={updateSubConcept}
            onUpdateTable={updateTable}
            caratula={caratula}
            meta={meta}
            onUpdateCaratula={updateCaratula}
            onUpdateMeta={updateMeta}
            documentHeaderImage={documentHeaderImage}
            documentHeaderImageUploading={uploadingDocumentHeaderImage}
            onDocumentHeaderImageRemove={removeDocumentHeaderImage}
            onDocumentHeaderImageUpload={handleDocumentHeaderImageUpload}
            principalCoverImage={principalCoverImage}
            principalCoverImageAvailable={Boolean(valuationId)}
            principalCoverImageUploading={uploadingCoverImage}
            onPrincipalCoverImageUpload={handlePrincipalCoverImageUpload}
          />
        </TabsContent>
      ))}
    </>
  );

  const previewPanel = (
    <ValuationPreviewPanel
      activeSection={activeSection}
      caratula={caratula}
      companyName={currentUser.organizationName}
      meta={meta}
      selectedComparables={selectedComparables}
      principalCoverImage={principalCoverImage}
      documentHeaderImage={documentHeaderImage}
    />
  );

  return (
    <Tabs value={activeSection.id} onValueChange={setActiveSectionId} className="gap-0 h-full">
      <main className="min-h-0 bg-muted/40 text-foreground flex flex-col h-full overflow-hidden">
      <section className="shrink-0 border-b bg-background">
        <div className="mx-auto grid max-w-[1760px] gap-4 overflow-hidden px-4 py-4 lg:px-6">
          <ValuationTopBar
            activeSectionId={activeSection.id}
            canEdit={canEdit}
            canExport={canExport}
            enabledSections={enabledSections}
            iconMap={sectionIconMap}
            meta={meta}
            onExport={handleExportPdf}
            onExit={handleExit}
            onReorderSections={(next) => setSections(next)}
            onRedo={redoEditorChange}
            onSave={handleSave}
            onSplitLayoutChange={handleSplitLayoutChange}
            onUndo={undoEditorChange}
            onWorkspaceModeChange={handleWorkspaceModeChange}
            readOnly={!canEdit}
            redoAvailable={canRedo}
            saveStatus={saveStatus}
            saving={saving}
            splitLayout={splitLayout}
            undoAvailable={canUndo}
            valuationId={valuationId}
            workspaceMode={workspaceMode}
          />

          {!canEdit ? <ReadOnlyValuationAlert /> : null}
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1760px] p-4 min-h-0 flex-1">
        {workspaceComposition.showEditor && !workspaceComposition.showPreview ? (
          <div id="valuation-form" className="h-full min-h-0 overflow-y-auto overscroll-contain pb-4">
            {editorPanel}
          </div>
        ) : workspaceComposition.showPreview && !workspaceComposition.showEditor ? (
          <div id="valuation-preview" className="h-full min-h-0 min-w-0 overflow-hidden pb-4">
            {previewPanel}
          </div>
        ) : isDesktopWorkspace ? (
          <ResizablePanelGroup
            orientation={splitLayout === "vertical" ? "horizontal" : "vertical"}
            className="h-full min-h-0 items-stretch"
          >
            {workspaceComposition.showPreview ? (
              <ResizablePanel
                id="valuation-preview"
                panelRef={previewPanelRef}
                defaultSize={splitLayout === "vertical" ? "50%" : "42%"}
                minSize="25%"
                maxSize="75%"
              >
                <div id="valuation-preview" className="h-full min-h-0 min-w-0 overflow-hidden pb-3">
                  {previewPanel}
                </div>
              </ResizablePanel>
            ) : null}
            {workspaceComposition.showSplitter ? (
              <ResizableHandle
                withHandle
                className={splitLayout === "vertical" ? "mx-1" : "my-1 w-full"}
              />
            ) : null}
            {workspaceComposition.showEditor ? (
              <ResizablePanel
                id="valuation-editor"
                panelRef={editorPanelRef}
                defaultSize={splitLayout === "vertical" ? "50%" : "58%"}
                minSize="25%"
                maxSize="75%"
              >
                <div
                  id="valuation-form"
                  className={cn(
                    "h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-4",
                    splitLayout === "vertical" ? "pl-3" : "pt-3",
                  )}
                >
                  {editorPanel}
                </div>
              </ResizablePanel>
            ) : null}
          </ResizablePanelGroup>
        ) : (
          <div className="grid gap-4">
            {workspaceComposition.showPreview ? <div id="valuation-preview">{previewPanel}</div> : null}
            {workspaceComposition.showEditor ? <div id="valuation-form">{editorPanel}</div> : null}
          </div>
        )}
      </div>
      <AlertDialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay cambios pendientes</AlertDialogTitle>
            <AlertDialogDescription>
              Puedes guardar antes de volver al dashboard, salir sin guardar o continuar editando.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction type="button" variant="outline" onClick={() => router.push("/dashboard")}>
              Salir sin guardar
            </AlertDialogAction>
            <AlertDialogAction type="button" onClick={handleSaveAndExit} disabled={saving}>
              Guardar y salir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </main>
    </Tabs>
  );
}
