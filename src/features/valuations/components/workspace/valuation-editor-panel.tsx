"use client";

import { ConceptCreationControl } from "../editor/concept-creation-control";
import { isGeneratedBlock } from "@/features/valuations/calculation/market-document";
import {
  LongTextConceptEditor,
} from "../editor/concept-editor";
import { ConceptSelectionScope } from "../editor/concept-selection";
import {
  ApartadoTransferMenu,
  BlockTransferMenu,
  MoveConceptsButton,
  PasteApartadoButton,
  PasteBlockButton,
} from "../editor/structure-transfer-actions";
import { ImportBlockButton } from "./template-dialogs";
import { BlockCard } from "../editor/block-card";
import { StructuralActions } from "../editor/structural-actions";
import { ApartadoEditor } from "../editor/apartado-editor";
import { BlockFlowRenderer } from "../editor/block-flow-renderer";
import { AssumptionsDraftAssist, DraftScopeProvider, ApartadoSummaryDraft } from "../editor/draft-assist";
import type { EditorCapabilities } from "../editor/editor-capabilities";
import { EditableContentLayout } from "../editor/editable-content-layout-v2";

import {
  ActionStrip,
  ContentCreationControl,
} from "../editor/content-creation-control";

import { CaratulaEditor, CalculatedValuesEditor } from "../editor/caratula-editor";
import { DocumentNumberFormatControl } from "../editor/number-format-control";
import { DocumentPageFormatControl } from "../editor/page-format-control";
import { SignaturesEditor } from "../editor/signatures-editor";

import { Check, Eye, EyeOff, GripVertical, PencilLine, Plus, Trash2, X } from "lucide-react";

import { ChangeEvent, useMemo, useState, type ReactNode } from "react";
import { ensureTableV2 } from "@/features/valuations/services/table";
import { sectionDisplayName } from "./model/section-numbering";
import type { DragEndEvent } from "@dnd-kit/core";
import { ContentDndScope } from "../editor/content-dnd-scope";
import {
  applyContentDropToBlocks,
  type ContentDropSource,
  type ContentDropTarget,
} from "@/features/valuations/services/content-drop";
import { contentMoveRulesForSection } from "@/features/valuations/services/content-move-rules";
import { flattenSectionConcepts } from "./model/section-content";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { setColumnPresentation, clearColumnPresentation, clearConceptCellPresentations } from "@/features/valuations/services/concept-presentation";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type {
  AppSection,
  Block,
  CaratulaFormData,
  Concept,
  ConceptType,
  ImageContent,
  PrincipalCoverImage,
  Apartado,
  TableContent,
  ValuationMeta,
} from "@/features/valuations/model";
import { COMPANY_HEADER_BLOCK_ID } from "@/features/valuations/services/caratula-company-header";
import {
  getCaratulaBlockKind,
  isCaratulaIntermediateBlock,
  isConclusionNarrativeConcept,
} from "@/features/valuations/services/caratula-blocks";
import { formatVisibleChildLabel, getBlockFlowApartadoOrder } from "@/features/valuations/services/visible-numbering";
import { resolveBlockFlowV2, moveBlockFlowV2ApartadoOneStep, canMoveBlockFlowV2ApartadoOneStep } from "@/features/valuations/services/block-flow";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import {
  isTerrenoSection,
} from "@/features/valuations/sections/terreno";
import { cn } from "@/lib/utils";
import { stripLeadingRomanNumeral } from "../datos-generales-display";
import { pinFullLinkResolution, type ExistingConceptRelationMode } from "@/features/valuations/concept-links";
import { canRemoveSection, SECTION_TITLE_MAX } from "@/features/valuations/services/section-edit-operations";
import { blockContentHidden } from "@/features/valuations/services/hidden-content";

const PRE_MARKET_EDITOR_SECTION_KEYS = new Set([
  "DATOS_GENERALES",
  "TERRENO",
  "CONSTRUCCION",
  "CONSIDERACIONES",
  "COSTOS",
]);

const PRE_MARKET_CONCEPT_CONTROL_SECTION_KEYS = new Set([
  "CARATULA",
  ...PRE_MARKET_EDITOR_SECTION_KEYS,
]);

type ConceptReference = {
  concept: Concept;
  source: string;
};

const GENERIC_CONTENT_CAPABILITIES: Pick<EditorCapabilities, "apartados" | "concepts" | "images" | "tables"> = {
  apartados: true,
  concepts: true,
  images: true,
  tables: true,
};

function hasPreMarketSectionBoundary(section: AppSection) {
  return PRE_MARKET_EDITOR_SECTION_KEYS.has(getCanonicalSectionKey(section.id));
}

function hasPreMarketConceptControls(section: AppSection) {
  return PRE_MARKET_CONCEPT_CONTROL_SECTION_KEYS.has(getCanonicalSectionKey(section.id));
}

/**
 * Every section has the same controls: hide, delete, rename, import and add
 * blocks. A required one (carátula, datos generales, conclusión) shows hide
 * and delete disabled, saying why.
 */
function getSectionEditorCapabilities(section: AppSection): EditorCapabilities {
  return {
    visibility: canRemoveSection(section),
    delete: canRemoveSection(section),
  };
}

const REQUIRED_SECTION_HINT = "Sección obligatoria del dictamen: no se oculta ni se elimina";

function getBlockEditorCapabilities({
  isCaratula,
  isIntermediateCaratulaBlock,
  isRemovableCaratulaBlock,
  supportsPageBreak,
}: {
  isCaratula: boolean;
  isIntermediateCaratulaBlock: boolean;
  isRemovableCaratulaBlock: boolean;
  supportsPageBreak: boolean;
}): EditorCapabilities {
  if (isIntermediateCaratulaBlock) {
    return {
      apartados: true,
      delete: isRemovableCaratulaBlock,
      move: true,
      visibility: true,
    };
  }
  if (isCaratula) return { visibility: true };

  return {
    ...GENERIC_CONTENT_CAPABILITIES,
    delete: true,
    move: true,
    pageBreak: supportsPageBreak,
    visibility: true,
  };
}

function getApartadoEditorCapabilities(): EditorCapabilities {
  return {
    ...GENERIC_CONTENT_CAPABILITIES,
    delete: true,
    move: true,
    pageBreak: true,
    visibility: true,
  };
}

function getCaratulaApartadoEditorCapabilities(): EditorCapabilities {
  return {
    concepts: true,
    delete: true,
    move: true,
    pageBreak: true,
    visibility: true,
  };
}

function hasStructuralActionCapabilities(capabilities: EditorCapabilities) {
  return Boolean(capabilities.delete || capabilities.move || capabilities.pageBreak || capabilities.visibility);
}

function hasContentCreationCapabilities(capabilities: EditorCapabilities) {
  return Boolean(capabilities.apartados || capabilities.concepts || capabilities.images || capabilities.tables);
}

function collectConceptReferences(sections: AppSection[], currentBlockId: string): ConceptReference[] {
  return sections.flatMap((section) =>
    section.blocks.flatMap((block) => {
      const source = `${section.title} · ${block.title || section.title}`;
      const blockConcepts = block.concepts
        .filter((concept) => block.id !== currentBlockId || concept.label.trim() || concept.value.trim())
        .map((concept) => ({ concept, source }));
      const subBlockConcepts = block.apartados.flatMap((subBlock) => {
        const subSource = `${source} › ${subBlock.title}`;
        return subBlock.concepts
          .filter((concept) => concept.label.trim() || concept.value.trim())
          .map((concept) => ({ concept, source: subSource }));
      });
      return [...blockConcepts, ...subBlockConcepts];
    }),
  );
}

export function ValuationEditorPanel(props: {
  section: AppSection;
  /** Calculation panel of the section (market approach), shown above its blocks. */
  calculationPanel?: ReactNode;
  allSections: AppSection[];
  readOnly: boolean;
  onAddBlock: (sectionId: string) => void;
  onAddConcept: (sectionId: string, blockId: string, type?: ConceptType) => void;
  onAddConceptFromExisting: (sectionId: string, blockId: string, source: Concept, mode: "copy" | "full" | "value", apartadoId?: string) => void;
  onAddImage: (sectionId: string, blockId: string, event: ChangeEvent<HTMLInputElement>, apartadoId?: string, replaceImageId?: string) => void;
  onAddApartado: (sectionId: string, blockId: string) => void;
  onAddSubConcept: (sectionId: string, blockId: string, apartadoId: string, type?: ConceptType) => void;
  onAddTable: (sectionId: string, blockId: string, apartadoId?: string) => void;
  onAddHomologationTable: (sectionId: string, blockId: string, apartadoId?: string) => void;
  onAddTableColumn: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onAddTableRow: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onBlockDragEnd: (sectionId: string, event: DragEndEvent) => void;
  onMoveBlock: (sectionId: string, blockId: string, direction: -1 | 1) => void;
  onRemoveBlock: (sectionId: string, blockId: string) => void;
  onRemoveConcept: (sectionId: string, blockId: string, conceptId: string) => void;
  onRemoveImage: (sectionId: string, blockId: string, imageId: string, apartadoId?: string) => void;
  onRemoveApartado: (sectionId: string, blockId: string, apartadoId: string) => void;
  /** Asks to delete the section; the workspace confirms first. */
  onRemoveSection?: (sectionId: string) => void;
  /** Renames the section, as its tab does. */
  onRenameSection?: (sectionId: string, title: string) => void;
  onRemoveSubConcept: (sectionId: string, blockId: string, apartadoId: string, conceptId: string) => void;
  onRemoveTable: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onUpdateBlock: (sectionId: string, blockId: string, patch: Partial<Block>) => void;
  onUpdateSection: (sectionId: string, patch: Partial<AppSection>) => void;
  onUpdateConcept: (sectionId: string, blockId: string, conceptId: string, patch: Partial<Concept>) => void;
  onUpdateConceptEverywhere: (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => void;
  onEditConceptOnlyHere: (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => void;
  onChangeConceptRelation: (conceptId: string, mode: ExistingConceptRelationMode) => void;
  onUnlinkConcept: (conceptId: string) => void;
  onUpdateImage: (sectionId: string, blockId: string, imageId: string, patch: Partial<ImageContent>, apartadoId?: string) => void;
  onUpdateApartado: (sectionId: string, blockId: string, apartadoId: string, patch: Partial<Apartado>) => void;
  onUpdateSubConcept: (
    sectionId: string,
    blockId: string,
    apartadoId: string,
    conceptId: string,
    patch: Partial<Concept>,
  ) => void;
  onUpdateTable: (
    sectionId: string,
    blockId: string,
    tableId: string,
    updater: (table: TableContent) => TableContent,
    apartadoId?: string,
  ) => void;
  caratula?: CaratulaFormData;
  meta?: ValuationMeta;
  onUpdateCaratula?: (patch: Partial<CaratulaFormData>) => void;
  onUpdateMeta?: (patch: Partial<ValuationMeta>) => void;
  documentHeaderImage?: ImageContent | null;
  documentHeaderImageUploading?: boolean;
  onDocumentHeaderImageRemove?: () => void;
  onDocumentHeaderImageUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
  principalCoverImage?: PrincipalCoverImage | null;
  principalCoverImageAvailable?: boolean;
  principalCoverImageUploading?: boolean;
  onPrincipalCoverImageUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const { section } = props;

  const isCaratula = section.id === "caratula";
  const isDatosGenerales =
    section.id === "datos" || getCanonicalSectionKey(section.id) === "DATOS_GENERALES";
  const isTerreno = isTerrenoSection(section);
  const sectionCapabilities = getSectionEditorCapabilities(section);
  const [renaming, setRenaming] = useState(false);
  const usesSectionTerminology = hasPreMarketSectionBoundary(section);
  const blockTerm = usesSectionTerminology ? "Sección" : "Bloque";
  const blocksTerm = usesSectionTerminology ? "secciones" : "bloques";
  const subBlocksTerm = "subbloques";
  const editableBlocks = section.blocks.filter(
    (block) => !(isCaratula && block.id === COMPANY_HEADER_BLOCK_ID),
  );
  const intermediateBlocks = editableBlocks.filter(isCaratulaIntermediateBlock);
  const assumptionsBlocks = editableBlocks.filter(
    (block) => getCaratulaBlockKind(block) === "assumptions",
  );
  const conclusionBlocks = editableBlocks.filter(
    (block) => getCaratulaBlockKind(block) === "conclusion",
  );
  const sortableBlockIds = editableBlocks.map((block) => block.id);
  // Content moves between the Blocks of the section, except where something else owns it.
  const moveRules = useMemo(() => contentMoveRulesForSection(section), [section]);
  const handleContentDrop = (source: ContentDropSource, target: ContentDropTarget) => {
    // A full link reads from its first concept in document order: settle it before the order changes.
    const pinned = source.itemType === "concept"
      ? new Map(
          pinFullLinkResolution(source.itemId, flattenSectionConcepts(props.allSections))
            .map((concept) => [concept.id, concept]),
        )
      : new Map<string, Concept>();
    const settle = (concept: Concept) => pinned.get(concept.id) ?? concept;
    const blocks = pinned.size === 0 ? section.blocks : section.blocks.map((block) => ({
      ...block,
      concepts: block.concepts.map(settle),
      apartados: block.apartados.map((apartado) => ({ ...apartado, concepts: apartado.concepts.map(settle) })),
    }));

    const result = applyContentDropToBlocks(blocks, source, target, moveRules);
    // One update for the section keeps the move a single undo step.
    if (result.changed) props.onUpdateSection(section.id, { blocks: result.blocks });
  };
  const renderBlockEditor = (block: Block, blockIndex: number, blockCount: number) => isGeneratedBlock(block) ? (
    <GeneratedBlockNotice
      key={block.id}
      block={block}
      readOnly={props.readOnly}
      onVisibleChange={(enabled) => props.onUpdateBlock(section.id, block.id, { enabled })}
    />
  ) : (
    <SortableBlockEditor
      key={block.id}
      block={block}
      blockCount={blockCount}
      blockIndex={blockIndex}
      readOnly={props.readOnly}
      section={section}
      allSections={props.allSections}
      onAddConcept={props.onAddConcept}
      onAddConceptFromExisting={props.onAddConceptFromExisting}
      onAddImage={props.onAddImage}
      onAddApartado={props.onAddApartado}
      onAddSubConcept={props.onAddSubConcept}
      onAddTable={props.onAddTable}
      onAddHomologationTable={props.onAddHomologationTable}
      onAddTableColumn={props.onAddTableColumn}
      onAddTableRow={props.onAddTableRow}
      onMoveBlock={props.onMoveBlock}
      onRemoveBlock={props.onRemoveBlock}
      onRemoveConcept={props.onRemoveConcept}
      onRemoveImage={props.onRemoveImage}
      onRemoveApartado={props.onRemoveApartado}
      onRemoveSubConcept={props.onRemoveSubConcept}
      onRemoveTable={props.onRemoveTable}
      onUpdateBlock={props.onUpdateBlock}
      onUpdateConcept={props.onUpdateConcept}
      onUpdateConceptEverywhere={props.onUpdateConceptEverywhere}
      onEditConceptOnlyHere={props.onEditConceptOnlyHere}
      onChangeConceptRelation={props.onChangeConceptRelation}
      onUnlinkConcept={props.onUnlinkConcept}
      onUpdateImage={props.onUpdateImage}
      onUpdateApartado={props.onUpdateApartado}
      onUpdateSubConcept={props.onUpdateSubConcept}
      onUpdateTable={props.onUpdateTable}
      sectionCapabilities={sectionCapabilities}
    />
  );

  return (
    <Card className="min-h-[680px] rounded-lg">
      <CardHeader>
        <CardTitle>
          {renaming && props.onRenameSection ? (
            <SectionTitleField
              title={section.title}
              onCommit={(title) => {
                setRenaming(false);
                props.onRenameSection?.(section.id, title);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : isCaratula
            ? "Encabezado del Avalúo"
            : isDatosGenerales
              ? "Datos generales"
            : isTerreno
              ? `${section.label} ${section.title}`
            : sectionDisplayName(section)}
        </CardTitle>
        <CardDescription>
          {isCaratula
            ? "Edita aquí los datos generales que aparecen en el encabezado de todas las secciones."
            : isTerreno
              ? `Edita aquí la información del terreno. Agrega y ordena ${blocksTerm}, ${subBlocksTerm}, conceptos, tablas e imágenes.`
            : `Formato de la sección. Agrega y ordena ${blocksTerm}, ${subBlocksTerm}, conceptos, tablas e imágenes.`}
        </CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <SectionHeaderActions
            section={section}
            capabilities={sectionCapabilities}
            readOnly={props.readOnly}
            renaming={renaming}
            onStartRename={() => setRenaming(true)}
            onVisibleChange={(enabled) => props.onUpdateSection(section.id, { enabled })}
            onRemove={props.onRemoveSection ? () => props.onRemoveSection?.(section.id) : undefined}
            onRename={props.onRenameSection}
          />
          {!isCaratula ? (
            <>
              <PasteBlockButton section={section} />
              <ImportBlockButton section={section} />
              <Button type="button" size="sm" disabled={props.readOnly} onClick={() => props.onAddBlock(section.id)}>
                <Plus />
                {blockTerm}
              </Button>
            </>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* The calculation panels save on their own: Ctrl+Z in their fields is the browser's (or the panel's) own. */}
        {props.calculationPanel ? <div data-native-undo="">{props.calculationPanel}</div> : null}
        {isCaratula && props.caratula && props.meta && props.onUpdateCaratula && props.onUpdateMeta ? (
          <CaratulaEditor
            caratula={props.caratula}
            meta={props.meta}
            readOnly={props.readOnly}
            onUpdate={props.onUpdateCaratula}
            onUpdateMeta={props.onUpdateMeta}
            headerImage={props.documentHeaderImage ?? null}
            headerImageUploading={props.documentHeaderImageUploading ?? false}
            onHeaderImageRemove={props.onDocumentHeaderImageRemove}
            onHeaderImageUpload={props.onDocumentHeaderImageUpload}
            principalImage={props.principalCoverImage ?? null}
            imageUploadAvailable={props.principalCoverImageAvailable ?? false}
            imageUploading={props.principalCoverImageUploading ?? false}
            onImageUpload={props.onPrincipalCoverImageUpload}
          />
        ) : null}
        {isCaratula ? (
          <>
            <DocumentNumberFormatControl section={section} readOnly={props.readOnly} onUpdateSection={props.onUpdateSection} />
            <DocumentPageFormatControl section={section} readOnly={props.readOnly} onUpdateSection={props.onUpdateSection} />
          </>
        ) : null}
        {isCaratula ? (
          <ContentDndScope id={`blocks-${section.id}`} blockIds={sortableBlockIds} moveRules={moveRules} onContentDrop={handleContentDrop}>
            <SortableContext items={sortableBlockIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <FieldTitle>Secciones de Carátula</FieldTitle>
                    <Button
                      type="button"
                      size="sm"
                      disabled={props.readOnly}
                      onClick={() => props.onAddBlock(section.id)}
                    >
                      <Plus />
                      Sección
                    </Button>
                  </div>
                  {intermediateBlocks.map((block, index) =>
                    renderBlockEditor(block, index, intermediateBlocks.length),
                  )}
                </section>

                <section className="space-y-4">
                  <FieldTitle>Supuestos y condiciones</FieldTitle>
                  {assumptionsBlocks.map((block, index) =>
                    renderBlockEditor(block, index, assumptionsBlocks.length),
                  )}
                </section>

                <section className="space-y-4">
                  <FieldTitle>Conclusión</FieldTitle>
                  {conclusionBlocks.map((block, index) =>
                    renderBlockEditor(block, index, conclusionBlocks.length),
                  )}
                  {props.caratula && props.onUpdateCaratula ? (
                    <CalculatedValuesEditor
                      caratula={props.caratula}
                      readOnly={props.readOnly}
                      onUpdate={props.onUpdateCaratula}
                    />
                  ) : null}
                </section>

                {props.caratula && props.onUpdateCaratula ? (
                  <SignaturesEditor
                    description="Quienes firman el dictamen, cada quien con su cédula profesional. Se imprimen en este orden."
                    idPrefix="caratula-firma"
                    signatures={props.caratula.firmas}
                    readOnly={props.readOnly}
                    onChange={(firmas) => props.onUpdateCaratula?.({ firmas })}
                  />
                ) : null}
              </div>
            </SortableContext>
          </ContentDndScope>
        ) : (
          <ContentDndScope
            id={`blocks-${section.id}`}
            blockIds={sortableBlockIds}
            moveRules={moveRules}
            onBlockDragEnd={(event) => props.onBlockDragEnd(section.id, event)}
            onContentDrop={handleContentDrop}
          >
            <SortableContext items={sortableBlockIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {editableBlocks.map((block, index) => renderBlockEditor(block, index, editableBlocks.length))}
              </div>
            </SortableContext>
          </ContentDndScope>
        )}
      </CardContent>
    </Card>
  );
}




function SortableBlockEditor(props: {
  section: AppSection;
  allSections: AppSection[];
  block: Block;
  blockCount: number;
  blockIndex: number;
  readOnly: boolean;
  sectionCapabilities: EditorCapabilities;
  onAddConcept: (sectionId: string, blockId: string, type?: ConceptType) => void;
  onAddConceptFromExisting: (sectionId: string, blockId: string, source: Concept, mode: "copy" | "full" | "value", apartadoId?: string) => void;
  onAddImage: (sectionId: string, blockId: string, event: ChangeEvent<HTMLInputElement>, apartadoId?: string, replaceImageId?: string) => void;
  onAddApartado: (sectionId: string, blockId: string) => void;
  onAddSubConcept: (sectionId: string, blockId: string, apartadoId: string, type?: ConceptType) => void;
  onAddTable: (sectionId: string, blockId: string, apartadoId?: string) => void;
  onAddHomologationTable: (sectionId: string, blockId: string, apartadoId?: string) => void;
  onAddTableColumn: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onAddTableRow: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onMoveBlock: (sectionId: string, blockId: string, direction: -1 | 1) => void;
  onRemoveBlock: (sectionId: string, blockId: string) => void;
  onRemoveConcept: (sectionId: string, blockId: string, conceptId: string) => void;
  onRemoveImage: (sectionId: string, blockId: string, imageId: string, apartadoId?: string) => void;
  onRemoveApartado: (sectionId: string, blockId: string, apartadoId: string) => void;
  onRemoveSubConcept: (sectionId: string, blockId: string, apartadoId: string, conceptId: string) => void;
  onRemoveTable: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onUpdateBlock: (sectionId: string, blockId: string, patch: Partial<Block>) => void;
  onUpdateConcept: (sectionId: string, blockId: string, conceptId: string, patch: Partial<Concept>) => void;
  onUpdateConceptEverywhere: (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => void;
  onEditConceptOnlyHere: (conceptId: string, patch: Partial<Pick<Concept, "label" | "value">>) => void;
  onChangeConceptRelation: (conceptId: string, mode: ExistingConceptRelationMode) => void;
  onUnlinkConcept: (conceptId: string) => void;
  onUpdateImage: (sectionId: string, blockId: string, imageId: string, patch: Partial<ImageContent>, apartadoId?: string) => void;
  onUpdateApartado: (sectionId: string, blockId: string, apartadoId: string, patch: Partial<Apartado>) => void;
  onUpdateSubConcept: (
    sectionId: string,
    blockId: string,
    apartadoId: string,
    conceptId: string,
    patch: Partial<Concept>,
  ) => void;
  onUpdateTable: (
    sectionId: string,
    blockId: string,
    tableId: string,
    updater: (table: TableContent) => TableContent,
    apartadoId?: string,
  ) => void;
}) {
  const { allSections, block, readOnly, section } = props;
  const isCaratula = section.id === "caratula";
  const hasSectionBoundary = hasPreMarketSectionBoundary(section);
  const hasConceptLayoutControls = hasPreMarketConceptControls(section);
  const usesSectionTerminology = hasPreMarketConceptControls(section);
  const blockTerm = usesSectionTerminology ? "sección" : "bloque";
  const subBlockTerm = "subbloque";
  // One word on the buttons of every section (observations of 27 Oct 2026).
  const subBlockButtonLabel = "Subbloque";
  const caratulaBlockKind = isCaratula ? getCaratulaBlockKind(block) : "intermediate";
  const isIntermediateCaratulaBlock = isCaratula && caratulaBlockKind === "intermediate";
  const isRemovableCaratulaBlock =
    isIntermediateCaratulaBlock && !block.id.startsWith("caratula-block-");
  const blockCapabilities = getBlockEditorCapabilities({
    isCaratula,
    isIntermediateCaratulaBlock,
    isRemovableCaratulaBlock,
    supportsPageBreak: hasConceptLayoutControls && !isCaratula,
  });
  const apartadoCapabilities = isCaratula
    ? getCaratulaApartadoEditorCapabilities()
    : getApartadoEditorCapabilities();
  const usesCompactConceptSystem = isIntermediateCaratulaBlock || (!isCaratula && hasConceptLayoutControls);
  const conclusionNarrativeConcepts = block.concepts.filter(isConclusionNarrativeConcept);
  const [conceptSearch, setConceptSearch] = useState("");
  const allWorkspaceConcepts = allSections.flatMap((item) =>
    item.blocks.flatMap((sectionBlock) => [
      ...sectionBlock.concepts,
      ...sectionBlock.apartados.flatMap((subBlock) => subBlock.concepts),
    ]),
  );
  const conceptReferences = usesCompactConceptSystem
    ? collectConceptReferences(allSections, block.id).filter((reference) => {
      const needle = conceptSearch.trim().toLowerCase();
      if (!needle) return true;
      return `${reference.concept.label} ${reference.concept.value} ${reference.source}`
        .toLowerCase()
        .includes(needle);
    })
    : [];
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: block.id,
    disabled: readOnly || isCaratula,
  });
  const displayBlockLabel = block.enabled ? block.sectionLabel : "";
  const showStructuralNumbering = !isCaratula;
  const blockFlowV2 = useMemo(() => resolveBlockFlowV2(block), [block]);
  const dragHandle = !isCaratula ? (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={`Mover ${block.title}`}
      disabled={readOnly}
      {...attributes}
      {...listeners}
    >
      <GripVertical />
    </Button>
  ) : null;

  return (
    <BlockCard
      cardRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg", hasSectionBoundary && "border bg-muted/20", !block.enabled && "border-dashed opacity-65")}
      badge={showStructuralNumbering
        ? block.enabled && !blockContentHidden(block)
          ? displayBlockLabel
            ? `${displayBlockLabel.replace(/\.+$/, "")}.`
            : "Fijo"
          : "Oculto"
        : null}
      dragHandle={dragHandle}
      extraActions={!isCaratula ? <BlockTransferMenu section={section} block={block} label={blockTerm === "sección" ? "la sección" : "el bloque"} /> : undefined}
      title={stripLeadingRomanNumeral(block.title)}
      titleEdit={
        caratulaBlockKind === "intermediate"
          ? {
              disabled: readOnly,
              value: block.title,
              onChange: (title) => props.onUpdateBlock(section.id, block.id, { title: title.toUpperCase() }),
            }
          : undefined
      }
      structuralActions={hasStructuralActionCapabilities(blockCapabilities) ? {
        conceptPresentation: block.conceptPresentation,
        disabled: readOnly,
        itemLabel: usesSectionTerminology ? "sección" : blockTerm.toLowerCase(),
        move: blockCapabilities.move ? {
          canMoveUp: props.blockIndex > 0,
          canMoveDown: props.blockIndex < props.blockCount - 1,
          onMoveUp: () => props.onMoveBlock(section.id, block.id, -1),
          onMoveDown: () => props.onMoveBlock(section.id, block.id, 1),
        } : undefined,
        onConceptPresentationChange: (next) =>
          props.onUpdateBlock(section.id, block.id, { conceptPresentation: next }),
        onResetConceptPresentations: () => {
          const layout = resolveContentLayout(block);
          const conceptIds = new Set(block.concepts.map((c) => c.id));
          const next = clearConceptCellPresentations(layout, conceptIds);
          props.onUpdateBlock(section.id, block.id, { contentLayout: next });
        },
        visibility: blockCapabilities.visibility ? {
          visible: block.enabled,
          onChange: (enabled) => props.onUpdateBlock(section.id, block.id, { enabled }),
        } : undefined,
        pageBreak: blockCapabilities.pageBreak ? {
          value: Boolean(block.startOnNewPage),
          onChange: (startOnNewPage) => props.onUpdateBlock(section.id, block.id, { startOnNewPage }),
        } : undefined,
        deleteAction: blockCapabilities.delete ? {
          size: "icon",
          onDelete: () => props.onRemoveBlock(section.id, block.id),
        } : undefined,
      } : undefined}
    >
        {isIntermediateCaratulaBlock ? <div className="grid gap-3 md:grid-cols-[120px_1fr]">
          <Field>
            <FieldLabel>Clave</FieldLabel>
            <Input
              disabled={readOnly}
              value={block.sectionLabel}
              onChange={(event) => props.onUpdateBlock(section.id, block.id, { sectionLabel: event.target.value })}
            />
          </Field>
        </div> : null}

          {hasContentCreationCapabilities(blockCapabilities) ? (
            <ActionStrip
              capabilities={blockCapabilities}
              readOnly={readOnly}
              conceptControl={
                <ConceptCreationControl
                  conceptReferences={conceptReferences}
                  conceptSearch={conceptSearch}
                  readOnly={readOnly}
                  triggerClassName="w-full justify-start"
                  triggerVariant="ghost"
                  onAddConcept={(type) =>
                    props.onAddConcept(section.id, block.id, type)
                  }
                  onAddConceptFromExisting={(concept, mode) =>
                    props.onAddConceptFromExisting(
                      section.id,
                      block.id,
                      concept,
                      mode,
                    )
                  }
                  onConceptSearchChange={setConceptSearch}
                />
              }
              onAddImage={(event) =>
                props.onAddImage(section.id, block.id, event)
              }
              onAddApartado={() =>
                props.onAddApartado(section.id, block.id)
              }
              onAddTable={() =>
                props.onAddTable(section.id, block.id)
              }
              onAddHomologationTable={() =>
                props.onAddHomologationTable(section.id, block.id)
              }
              subBlockLabel={subBlockButtonLabel}
            />
          ) : null}
          {!isCaratula ? <PasteApartadoButton section={section} block={block} /> : null}
        {caratulaBlockKind === "assumptions" ? (
          <LongTextConceptEditor
            concepts={block.concepts}
            label="Supuestos y condiciones limitantes"
            readOnly={readOnly}
            onUpdate={(conceptId, patch) => props.onUpdateConcept(section.id, block.id, conceptId, patch)}
            renderAssist={(concept) => (
              <AssumptionsDraftAssist
                concept={concept}
                title={block.title}
                sections={allSections}
                onInsert={(value) => props.onUpdateConcept(section.id, block.id, concept.id, { value })}
              />
            )}
          />
        ) : caratulaBlockKind === "conclusion" ? (
          <div className="space-y-3">
            {conclusionNarrativeConcepts.length ? (
              // No draft assistance here: the checks of a draft cannot tell a restated conclusion from an argued one.
              <LongTextConceptEditor
                concepts={conclusionNarrativeConcepts}
                readOnly={readOnly}
                onUpdate={(conceptId, patch) => props.onUpdateConcept(section.id, block.id, conceptId, patch)}
              />
            ) : null}
            <FieldDescription>
              El valor comercial, el valor con letra y los datos de firma se toman de los campos compartidos de Carátula.
            </FieldDescription>
          </div>
        ) : (
          // A draft for a descriptive field goes with the title and the tables of its block or apartado.
          <DraftScopeProvider title={block.title} tables={block.tables}>
          {/* The block's own concepts chosen at once: one "Espacio", or "Mover a…" together. */}
          <ConceptSelectionScope
            concepts={block.concepts}
            readOnly={readOnly}
            onApplySpacing={(conceptIds, spacingAfter) =>
              conceptIds.forEach((conceptId) => props.onUpdateConcept(section.id, block.id, conceptId, { spacingAfter }))
            }
            renderMove={(conceptIds, done) => (
              <MoveConceptsButton source={{ sectionId: section.id, blockId: block.id }} conceptIds={conceptIds} onMoved={done} />
            )}
          >
          <BlockFlowRenderer
            block={block}
            allConcepts={allWorkspaceConcepts}
            conceptCallbacks={{
              onRemove: (conceptId) => props.onRemoveConcept(section.id, block.id, conceptId),
              onUpdate: (conceptId, patch) => props.onUpdateConcept(section.id, block.id, conceptId, patch),
              onUpdateEverywhere: props.onUpdateConceptEverywhere,
              onChangeRelation: props.onChangeConceptRelation,
              onUnlink: props.onUnlinkConcept,
              onColumnPresentationChange: (columnId, presentation) => {
                const layout = resolveContentLayout(block);
                const next = presentation != null
                  ? setColumnPresentation(layout, columnId, presentation)
                  : clearColumnPresentation(layout, columnId);
                props.onUpdateBlock(section.id, block.id, { contentLayout: next });
              },
            }}
            imageCallbacks={{
              onRemove: (imageId) => props.onRemoveImage(section.id, block.id, imageId),
              onUpdate: (imageId, patch) => props.onUpdateImage(section.id, block.id, imageId, patch),
            }}
            tableCallbacks={{
              onAddColumn: (tableId) => props.onAddTableColumn(section.id, block.id, tableId),
              onAddRow: (tableId) => props.onAddTableRow(section.id, block.id, tableId),
              onRemove: (tableId) => props.onRemoveTable(section.id, block.id, tableId),
              onUpdate: (tableId, updater) => props.onUpdateTable(section.id, block.id, tableId, updater),
            }}
            readOnly={readOnly}
            enableLayoutControls={hasConceptLayoutControls}
            layout={usesCompactConceptSystem ? "caratulaGrid" : "default"}
            requireTitle={isCaratula}
            onContentLayoutChange={(next) =>
              props.onUpdateBlock(section.id, block.id, { contentLayout: next })
            }
            onBlockFlowChange={(nextFlow) =>
              props.onUpdateBlock(section.id, block.id, { blockFlow: nextFlow })
            }
            renderApartado={(subBlock, flowIndex, dndState) => (
              <ApartadoEditor
                extraActions={!isCaratula ? <ApartadoTransferMenu section={section} block={block} apartado={subBlock} label={`el ${subBlockTerm}`} /> : undefined}
                displayLabel={showStructuralNumbering ? formatVisibleChildLabel(displayBlockLabel, getBlockFlowApartadoOrder(block), subBlock.id) : ""}
                readOnly={readOnly}
                subBlock={subBlock}
                subBlockTerm={subBlockTerm}
                siblingIndex={flowIndex}
                conceptPresentation={subBlock.conceptPresentation}
                onConceptPresentationChange={(next) =>
                  props.onUpdateApartado(section.id, block.id, subBlock.id, { conceptPresentation: next })
                }
                onPresentationModeChange={(next) =>
                  props.onUpdateApartado(section.id, block.id, subBlock.id, { presentationMode: next })
                }
                onResetConceptPresentations={() => {
                  const layout = resolveContentLayout(subBlock);
                  const conceptIds = new Set(subBlock.concepts.map((c) => c.id));
                  const next = clearConceptCellPresentations(layout, conceptIds);
                  props.onUpdateApartado(section.id, block.id, subBlock.id, { contentLayout: next });
                }}
                onRemove={() =>
                  props.onRemoveApartado(section.id, block.id, subBlock.id)
                }
                onTitleChange={(title) =>
                  props.onUpdateApartado(section.id, block.id, subBlock.id, { title })
                }
                onVisibleChange={(enabled) =>
                  props.onUpdateApartado(section.id, block.id, subBlock.id, { enabled })
                }
                onStartOnNewPageChange={(startOnNewPage) =>
                  props.onUpdateApartado(section.id, block.id, subBlock.id, { startOnNewPage })
                }
                onMoveUp={() => {
                  if (!blockFlowV2 || readOnly) return;
                  const result = moveBlockFlowV2ApartadoOneStep(blockFlowV2, subBlock.id, "up");
                  if (result.changed) props.onUpdateBlock(section.id, block.id, { blockFlow: result.flow });
                }}
                onMoveDown={() => {
                  if (!blockFlowV2 || readOnly) return;
                  const result = moveBlockFlowV2ApartadoOneStep(blockFlowV2, subBlock.id, "down");
                  if (result.changed) props.onUpdateBlock(section.id, block.id, { blockFlow: result.flow });
                }}
                canMoveUp={blockFlowV2 ? canMoveBlockFlowV2ApartadoOneStep(blockFlowV2, subBlock.id, "up") : false}
                canMoveDown={blockFlowV2 ? canMoveBlockFlowV2ApartadoOneStep(blockFlowV2, subBlock.id, "down") : false}
                capabilities={apartadoCapabilities}
              >
                {/* Several concepts of the apartado chosen at once: one "Espacio", or "Mover a…" together. */}
                <ConceptSelectionScope
                  concepts={subBlock.concepts}
                  readOnly={readOnly}
                  onApplySpacing={(conceptIds, spacingAfter) =>
                    conceptIds.forEach((conceptId) =>
                      props.onUpdateSubConcept(section.id, block.id, subBlock.id, conceptId, { spacingAfter }),
                    )
                  }
                  renderMove={(conceptIds, done) => (
                    <MoveConceptsButton
                      source={{ sectionId: section.id, blockId: block.id, apartadoId: subBlock.id }}
                      conceptIds={conceptIds}
                      onMoved={done}
                    />
                  )}
                >
                <ContentCreationControl
                  capabilities={apartadoCapabilities}
                  conceptControl={
                    <ConceptCreationControl
                      conceptReferences={conceptReferences}
                      conceptSearch={conceptSearch}
                      readOnly={readOnly}
                      triggerClassName="w-full justify-start"
                      triggerVariant="ghost"
                      onAddConcept={(type) =>
                        props.onAddSubConcept(section.id, block.id, subBlock.id, type)
                      }
                      onAddConceptFromExisting={(concept, mode) =>
                        props.onAddConceptFromExisting(section.id, block.id, concept, mode, subBlock.id)
                      }
                      onConceptSearchChange={setConceptSearch}
                    />
                  }
                  readOnly={readOnly}
                  onAddImage={(event) =>
                    props.onAddImage(section.id, block.id, event, subBlock.id)
                  }
                  onAddTable={() =>
                    props.onAddTable(section.id, block.id, subBlock.id)
                  }
                  onAddHomologationTable={() =>
                    props.onAddHomologationTable(section.id, block.id, subBlock.id)
                  }
                />

                <DraftScopeProvider title={subBlock.title} tables={subBlock.tables}>
                <EditableContentLayout
                  container={subBlock}
                  allConcepts={allWorkspaceConcepts}
                  allContainers={[subBlock]}
                  externalActiveColumnId={dndState.activeColumnId}
                  externalActiveTarget={dndState.activeTarget}
                  conceptCallbacks={{
                    onRemove: (conceptId) =>
                      props.onRemoveSubConcept(section.id, block.id, subBlock.id, conceptId),
                    onUpdate: (conceptId, patch) =>
                      props.onUpdateSubConcept(section.id, block.id, subBlock.id, conceptId, patch),
                    onUpdateEverywhere: props.onUpdateConceptEverywhere,
                    onUnlink: props.onUnlinkConcept,
                    onColumnPresentationChange: (columnId, presentation) => {
                      const layout = resolveContentLayout(subBlock);
                      const next = presentation != null
                        ? setColumnPresentation(layout, columnId, presentation)
                        : clearColumnPresentation(layout, columnId);
                      props.onUpdateApartado(section.id, block.id, subBlock.id, { contentLayout: next });
                    },
                  }}
                  imageCallbacks={{
                    onRemove: (imageId) =>
                      props.onRemoveImage(section.id, block.id, imageId, subBlock.id),
                    onUpdate: (imageId, patch) =>
                      props.onUpdateImage(section.id, block.id, imageId, patch, subBlock.id),
                  }}
                  tableCallbacks={{
                    onAddColumn: (tableId) =>
                      props.onAddTableColumn(section.id, block.id, tableId, subBlock.id),
                    onAddRow: (tableId) =>
                      props.onAddTableRow(section.id, block.id, tableId, subBlock.id),
                    onRemove: (tableId) =>
                      props.onRemoveTable(section.id, block.id, tableId, subBlock.id),
                    onUpdate: (tableId, updater) =>
                      props.onUpdateTable(section.id, block.id, tableId, updater, subBlock.id),
                  }}
                  readOnly={readOnly}
                  enableLayoutControls={hasConceptLayoutControls}
                  layout={usesCompactConceptSystem ? "caratulaGrid" : "default"}
                  onContentLayoutChange={(next) =>
                    props.onUpdateApartado(section.id, block.id, subBlock.id, { contentLayout: next })
                  }
                  dndContextMode="external"
                  containerRef={{ kind: "apartado", blockId: block.id, apartadoId: subBlock.id }}
                />
                <ApartadoSummaryDraft
                  title={subBlock.title}
                  concepts={subBlock.concepts}
                  allConcepts={allWorkspaceConcepts}
                  tables={subBlock.tables}
                  target={[...subBlock.concepts].reverse().find((concept) => concept.type === "longText" || concept.type === "paragraph") ?? null}
                  onInsert={(conceptId, value) => props.onUpdateSubConcept(section.id, block.id, subBlock.id, conceptId, { value })}
                />
                </DraftScopeProvider>
                </ConceptSelectionScope>
              </ApartadoEditor>
            )}
          />
          </ConceptSelectionScope>
          </DraftScopeProvider>
        )}

        {usesCompactConceptSystem && isCaratula ? (
          <div className="flex justify-start border-t pt-3">
            <ConceptCreationControl
              conceptReferences={conceptReferences}
              conceptSearch={conceptSearch}
              readOnly={readOnly}
              onAddConcept={(type) => props.onAddConcept(section.id, block.id, type)}
              onAddConceptFromExisting={(concept, mode) =>
                props.onAddConceptFromExisting(section.id, block.id, concept, mode)
              }
              onConceptSearchChange={setConceptSearch}
            />
          </div>
        ) : null}

    </BlockCard>
  );
}

/** A block written by the calculation: its data is edited in the calculation panel, not here. It is still hidden here. */
function GeneratedBlockNotice({ block, readOnly, onVisibleChange }: { block: Block; readOnly: boolean; onVisibleChange: (visible: boolean) => void }) {
  const rows = block.tables.reduce((count, table) => count + ensureTableV2(table).rows.length, 0);
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm", !block.enabled && "opacity-65")} data-block-id={block.id}>
      <span className="font-medium">{block.sectionLabel && block.enabled ? `${block.sectionLabel} ` : ""}{block.title}{block.enabled ? "" : " · oculto"}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        Generado por el cálculo{rows ? ` · ${rows} filas` : ""}{block.images.length ? ` · ${block.images.length} fotos` : ""}. Se edita en el panel de cálculo.
        <StructuralActions
          disabled={readOnly}
          itemLabel="bloque"
          visibility={{ visible: block.enabled, onChange: onVisibleChange }}
        />
      </span>
    </div>
  );
}

/**
 * The controls of a section's header, the same for every section: hide,
 * rename and delete. A required section shows hide and delete disabled.
 */
function SectionHeaderActions({
  capabilities,
  onRemove,
  onRename,
  onStartRename,
  onVisibleChange,
  readOnly,
  renaming,
  section,
}: {
  capabilities: EditorCapabilities;
  onRemove?: () => void;
  onRename?: (sectionId: string, title: string) => void;
  onStartRename: () => void;
  onVisibleChange: (visible: boolean) => void;
  readOnly: boolean;
  renaming: boolean;
  section: AppSection;
}) {
  const visible = section.enabled !== false;
  const hideLabel = capabilities.visibility ? `${visible ? "Ocultar" : "Mostrar"} sección` : REQUIRED_SECTION_HINT;
  const deleteLabel = capabilities.delete ? "Eliminar la sección con todo su contenido" : REQUIRED_SECTION_HINT;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={hideLabel}
        title={hideLabel}
        disabled={readOnly || !capabilities.visibility}
        onClick={() => onVisibleChange(!visible)}
      >
        {visible ? <EyeOff /> : <Eye />}
        {visible ? "Ocultar" : "Mostrar"}
      </Button>
      {onRename ? (
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Renombrar sección"
          title="Renombrar sección"
          disabled={readOnly || renaming}
          onClick={onStartRename}
        >
          <PencilLine />
        </Button>
      ) : null}
      {/* Deleting a section takes it whole: a labeled button, not a bare trash can that reads like "clear". */}
      {onRemove ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={capabilities.delete ? "Eliminar sección" : REQUIRED_SECTION_HINT}
          title={deleteLabel}
          disabled={readOnly || !capabilities.delete}
          onClick={onRemove}
        >
          <Trash2 />
          Eliminar sección
        </Button>
      ) : null}
    </>
  );
}

/** The section's title as a text box: Enter or the check keeps it, Escape or the cross drops it. */
function SectionTitleField({ title, onCommit, onCancel }: { title: string; onCommit: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(title);
  return (
    <span className="flex items-center gap-1">
      <Input
        autoFocus
        aria-label="Título de la sección"
        className="h-8 max-w-80 font-semibold uppercase"
        maxLength={SECTION_TITLE_MAX}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Guardar el título" onClick={() => onCommit(value)}>
        <Check />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancelar" onClick={onCancel}>
        <X />
      </Button>
    </span>
  );
}
