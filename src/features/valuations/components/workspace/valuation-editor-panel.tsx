"use client";

import { ConceptCreationControl } from "../editor/concept-creation-control";
import { isGeneratedBlock } from "@/features/valuations/calculation/market-document";
import {
  ConceptValueFormatEverywhere,
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
import { BlockTitleContextMenu } from "../editor/block-title-context-menu";
import { ApartadoEditor } from "../editor/apartado-editor";
import {
  ADD_BLOCK_LABEL,
  ADD_SUBBLOCK_LABEL,
  BLOCK_TERM,
  SUBBLOCK_TERM,
  blockToolbarLocks,
  blockToolbarState,
} from "../editor/block-toolbar";
import { deleteConfirmation, useConfirmDelete } from "../editor/delete-confirm";
import { structureLockReason } from "@/features/valuations/services/structure-transfer";
import { BlockFlowRenderer } from "../editor/block-flow-renderer";
import { AssumptionsDraftAssist, DraftScopeProvider, ApartadoSummaryDraft } from "../editor/draft-assist";
import type { EditorCapabilities } from "../editor/editor-capabilities";
import { EditableContentLayout } from "../editor/editable-content-layout-v2";

import {
  ActionStrip,
  ContentCreationControl,
} from "../editor/content-creation-control";

import { CaratulaEditor, CalculatedValuesEditor } from "../editor/caratula-editor";
import { ValuationSettingsPanel } from "../editor/valuation-settings-panel";
import { ReportInclusionBadge, SectionDocumentSettings } from "../editor/section-document-settings";
import { SignaturesEditor } from "../editor/signatures-editor";
import { GeneratedConceptLabels, GeneratedTableColumns } from "../editor/generated-table-columns";

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
  ConceptCreationKind,
  ConceptValueFormat,
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
import { apartadoDisplayLabel, getBlockFlowApartadoOrder } from "@/features/valuations/services/visible-numbering";
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
import { pageBreakPatch, resolvePageBreak, resolvePageOrientation } from "@/features/valuations/services/document-structure";
import { isNumericConcept, supportsValueFormat } from "@/features/valuations/services/concept-value-format";
import { setContentRowTagStyle } from "@/features/valuations/services/content-layout";
import { applyTextMark, type TextMark } from "@/features/valuations/services/text-marks";
import type { ContentRowTagStyle } from "@/features/valuations/model";

const PRE_MARKET_EDITOR_SECTION_KEYS = new Set([
  "DATOS_GENERALES",
  "TERRENO",
  "CONSTRUCCION",
  "CONSIDERACIONES",
  "COSTOS",
]);

type ConceptReference = {
  concept: Concept;
  source: string;
};

/** One patch for every chosen concept, or one written for each. */
type ConceptsPatch = Partial<Concept> | ((concept: Concept) => Partial<Concept>);

const GENERIC_CONTENT_CAPABILITIES: Pick<EditorCapabilities, "apartados" | "concepts" | "images" | "tables"> = {
  apartados: true,
  concepts: true,
  images: true,
  tables: true,
};

function hasPreMarketSectionBoundary(section: AppSection) {
  return PRE_MARKET_EDITOR_SECTION_KEYS.has(getCanonicalSectionKey(section.id));
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

/**
 * What "Agregar" offers in a Block: everything, except in the carátula, whose
 * Blocks hold concepts and subbloques only (its fixed Blocks, nothing). The
 * structural controls are the same in every Block: see block-toolbar.ts.
 */
function getBlockContentCapabilities({
  isCaratula,
  isIntermediateCaratulaBlock,
}: {
  isCaratula: boolean;
  isIntermediateCaratulaBlock: boolean;
}): EditorCapabilities {
  if (isIntermediateCaratulaBlock) return { apartados: true, concepts: true };
  if (isCaratula) return {};
  return { ...GENERIC_CONTENT_CAPABILITIES };
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
  onAddConcept: (sectionId: string, blockId: string, type?: ConceptCreationKind) => void;
  onAddConceptFromExisting: (sectionId: string, blockId: string, source: Concept, mode: "copy" | "full" | "value", apartadoId?: string) => void;
  onAddImage: (sectionId: string, blockId: string, event: ChangeEvent<HTMLInputElement>, apartadoId?: string, replaceImageId?: string) => void;
  onAddApartado: (sectionId: string, blockId: string) => void;
  onAddSubConcept: (sectionId: string, blockId: string, apartadoId: string, type?: ConceptCreationKind) => void;
  onAddTable: (sectionId: string, blockId: string, apartadoId?: string) => void;
  onAddHomologationTable: (sectionId: string, blockId: string, apartadoId?: string) => void;
  onAddTableColumn: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onAddTableRow: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onBlockDragEnd: (sectionId: string, event: DragEndEvent) => void;
  /** "Duplicar" of one or several concepts: a copy after each, in one step. */
  onDuplicateConcepts: (sectionId: string, blockId: string, conceptIds: string[], apartadoId?: string) => void;
  onMoveBlock: (sectionId: string, blockId: string, direction: -1 | 1) => void;
  onRemoveBlock: (sectionId: string, blockId: string) => void;
  onRemoveConcept: (sectionId: string, blockId: string, conceptId: string) => void;
  /** Several concepts deleted at once, in one step. */
  onRemoveConcepts: (sectionId: string, blockId: string, conceptIds: string[], apartadoId?: string) => void;
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
  /** The same patch to several concepts at once, in one step. */
  onUpdateConcepts: (sectionId: string, blockId: string, conceptIds: string[], patch: ConceptsPatch, apartadoId?: string) => void;
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
  /** The valuation, for the precision of the calculation in the carátula's settings. */
  valuationId?: string | null;
}) {
  const { section } = props;

  const isCaratula = section.id === "caratula";
  const isDatosGenerales =
    section.id === "datos" || getCanonicalSectionKey(section.id) === "DATOS_GENERALES";
  const isTerreno = isTerrenoSection(section);
  const sectionCapabilities = getSectionEditorCapabilities(section);
  const [renaming, setRenaming] = useState(false);
  // One word in every tab: a tab is a section, what it holds are blocks ("+ Sección" used to create a block).
  const blocksTerm = `${BLOCK_TERM}s`;
  const subBlocksTerm = `${SUBBLOCK_TERM}s`;
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
    <GeneratedBlockEditor
      key={block.id}
      block={block}
      blockCount={blockCount}
      blockIndex={blockIndex}
      readOnly={props.readOnly}
      section={section}
      onMoveBlock={props.onMoveBlock}
      onUpdateBlock={(patch) => props.onUpdateBlock(section.id, block.id, patch)}
      onUpdateTable={(tableId, table, apartadoId) => props.onUpdateTable(section.id, block.id, tableId, () => table, apartadoId)}
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
      onDuplicateConcepts={props.onDuplicateConcepts}
      onMoveBlock={props.onMoveBlock}
      onRemoveBlock={props.onRemoveBlock}
      onRemoveConcept={props.onRemoveConcept}
      onRemoveConcepts={props.onRemoveConcepts}
      onRemoveImage={props.onRemoveImage}
      onRemoveApartado={props.onRemoveApartado}
      onRemoveSubConcept={props.onRemoveSubConcept}
      onRemoveTable={props.onRemoveTable}
      onUpdateBlock={props.onUpdateBlock}
      onUpdateConcept={props.onUpdateConcept}
      onUpdateConcepts={props.onUpdateConcepts}
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
          <span className="ml-2 inline-flex align-middle"><ReportInclusionBadge section={section} /></span>
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
              <Button type="button" size="sm" disabled={props.readOnly} title="Agregar un bloque al final de la sección" onClick={() => props.onAddBlock(section.id)}>
                <Plus />
                {ADD_BLOCK_LABEL}
              </Button>
            </>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <ConceptValueFormatEverywhere enabled={!isCaratula}>
        {isCaratula ? (
          <ValuationSettingsPanel section={section} readOnly={props.readOnly} valuationId={props.valuationId} onUpdateSection={props.onUpdateSection} />
        ) : (
          <SectionDocumentSettings section={section} allSections={props.allSections} readOnly={props.readOnly} onUpdateSection={props.onUpdateSection} />
        )}
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
          <ContentDndScope
            id={`blocks-${section.id}`}
            blockIds={sortableBlockIds}
            moveRules={moveRules}
            onBlockDragEnd={(event) => props.onBlockDragEnd(section.id, event)}
            onContentDrop={handleContentDrop}
          >
            <SortableContext items={sortableBlockIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <FieldTitle>Bloques de la carátula</FieldTitle>
                    <Button
                      type="button"
                      size="sm"
                      disabled={props.readOnly}
                      title="Agregar un bloque a la carátula"
                      onClick={() => props.onAddBlock(section.id)}
                    >
                      <Plus />
                      {ADD_BLOCK_LABEL}
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
        </ConceptValueFormatEverywhere>
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
  onAddConcept: (sectionId: string, blockId: string, type?: ConceptCreationKind) => void;
  onAddConceptFromExisting: (sectionId: string, blockId: string, source: Concept, mode: "copy" | "full" | "value", apartadoId?: string) => void;
  onAddImage: (sectionId: string, blockId: string, event: ChangeEvent<HTMLInputElement>, apartadoId?: string, replaceImageId?: string) => void;
  onAddApartado: (sectionId: string, blockId: string) => void;
  onAddSubConcept: (sectionId: string, blockId: string, apartadoId: string, type?: ConceptCreationKind) => void;
  onAddTable: (sectionId: string, blockId: string, apartadoId?: string) => void;
  onAddHomologationTable: (sectionId: string, blockId: string, apartadoId?: string) => void;
  onAddTableColumn: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onAddTableRow: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onDuplicateConcepts: (sectionId: string, blockId: string, conceptIds: string[], apartadoId?: string) => void;
  onMoveBlock: (sectionId: string, blockId: string, direction: -1 | 1) => void;
  onRemoveBlock: (sectionId: string, blockId: string) => void;
  onRemoveConcept: (sectionId: string, blockId: string, conceptId: string) => void;
  onRemoveConcepts: (sectionId: string, blockId: string, conceptIds: string[], apartadoId?: string) => void;
  onRemoveImage: (sectionId: string, blockId: string, imageId: string, apartadoId?: string) => void;
  onRemoveApartado: (sectionId: string, blockId: string, apartadoId: string) => void;
  onRemoveSubConcept: (sectionId: string, blockId: string, apartadoId: string, conceptId: string) => void;
  onRemoveTable: (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => void;
  onUpdateBlock: (sectionId: string, blockId: string, patch: Partial<Block>) => void;
  onUpdateConcept: (sectionId: string, blockId: string, conceptId: string, patch: Partial<Concept>) => void;
  onUpdateConcepts: (sectionId: string, blockId: string, conceptIds: string[], patch: ConceptsPatch, apartadoId?: string) => void;
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
  // The ⋮ menu of a concept offers the same in every section: spacing, format, indent, duplicate, move, delete.
  const hasConceptLayoutControls = true;
  const subBlockTerm = SUBBLOCK_TERM;
  // One word on the buttons of every section (observations of 27 Oct 2026).
  const subBlockButtonLabel = ADD_SUBBLOCK_LABEL;
  const caratulaBlockKind = isCaratula ? getCaratulaBlockKind(block) : "intermediate";
  const isIntermediateCaratulaBlock = isCaratula && caratulaBlockKind === "intermediate";
  const isRemovableCaratulaBlock =
    isIntermediateCaratulaBlock && !block.id.startsWith("caratula-block-");
  const blockCapabilities = getBlockContentCapabilities({ isCaratula, isIntermediateCaratulaBlock });
  // The same toolbar in every Block; what cannot apply here is disabled and says why.
  const toolbar = blockToolbarState({
    kind: isIntermediateCaratulaBlock ? "caratula-block" : isCaratula ? "caratula-fixed" : "content",
    readOnly,
    transferLock: structureLockReason(section, block.id),
    deletable: !isCaratula || isRemovableCaratulaBlock,
  });
  const locks = blockToolbarLocks(toolbar);
  const confirmDelete = useConfirmDelete();
  const apartadoCapabilities = isCaratula
    ? getCaratulaApartadoEditorCapabilities()
    : getApartadoEditorCapabilities();
  const usesCompactConceptSystem = isIntermediateCaratulaBlock || !isCaratula;
  const conclusionNarrativeConcepts = block.concepts.filter(isConclusionNarrativeConcept);
  const [conceptSearch, setConceptSearch] = useState("");
  const allWorkspaceConcepts = allSections.flatMap((item) =>
    item.blocks.flatMap((sectionBlock) => [
      ...sectionBlock.concepts,
      ...sectionBlock.apartados.flatMap((subBlock) => subBlock.concepts),
    ]),
  );
  // Every section offers the concepts of the valuation to reuse, the map of comparables too.
  const conceptReferences = collectConceptReferences(allSections, block.id).filter((reference) => {
    const needle = conceptSearch.trim().toLowerCase();
    if (!needle) return true;
    return `${reference.concept.label} ${reference.concept.value} ${reference.source}`
      .toLowerCase()
      .includes(needle);
  });
  // The carátula's own blocks are dragged among themselves; its fixed ones stay where they print.
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: block.id,
    disabled: readOnly || (isCaratula && !isIntermediateCaratulaBlock),
  });
  const displayBlockLabel = block.enabled ? block.sectionLabel : "";
  const showStructuralNumbering = !isCaratula;
  const blockFlowV2 = useMemo(() => resolveBlockFlowV2(block), [block]);
  const dragHandle = (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={`Mover ${block.title}`}
      title={isCaratula && !isIntermediateCaratulaBlock ? "Bloque fijo de la carátula: se imprime en su lugar" : "Arrastrar para reordenar"}
      disabled={readOnly || (isCaratula && !isIntermediateCaratulaBlock)}
      {...attributes}
      {...listeners}
    >
      <GripVertical />
    </Button>
  );

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
      extraActions={<BlockTransferMenu section={section} block={block} label="el bloque" lock={toolbar.transfer.enabled ? null : toolbar.transfer.reason} />}
      titleContextMenu={!readOnly ? ({ titleRef }) => (
        // The right-click menu of the title offers what the toolbar does, under the same locks.
        <BlockTitleContextMenu
          section={section}
          block={block}
          label="el bloque"
          titleRef={titleRef}
          canRename={caratulaBlockKind === "intermediate"}
          visibility={toolbar.visibility.enabled ? { visible: block.enabled, onChange: (enabled) => props.onUpdateBlock(section.id, block.id, { enabled }) } : undefined}
          pageBreak={toolbar.pageBreak.enabled ? {
            before: resolvePageBreak(block) === "new-page",
            onChange: (before) => props.onUpdateBlock(section.id, block.id, pageBreakPatch(before ? "new-page" : "auto")),
          } : undefined}
          onDelete={toolbar.delete.enabled ? () => props.onRemoveBlock(section.id, block.id) : undefined}
        />
      ) : undefined}
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
      structuralActions={{
        conceptPresentation: block.conceptPresentation,
        disabled: readOnly,
        itemLabel: BLOCK_TERM,
        locks,
        move: {
          canMoveUp: props.blockIndex > 0,
          canMoveDown: props.blockIndex < props.blockCount - 1,
          onMoveUp: () => props.onMoveBlock(section.id, block.id, -1),
          onMoveDown: () => props.onMoveBlock(section.id, block.id, 1),
        },
        onConceptPresentationChange: (next) =>
          props.onUpdateBlock(section.id, block.id, { conceptPresentation: next }),
        onResetConceptPresentations: () => {
          const layout = resolveContentLayout(block);
          const conceptIds = new Set(block.concepts.map((c) => c.id));
          const next = clearConceptCellPresentations(layout, conceptIds);
          props.onUpdateBlock(section.id, block.id, { contentLayout: next });
        },
        visibility: {
          visible: block.enabled,
          onChange: (enabled) => props.onUpdateBlock(section.id, block.id, { enabled }),
        },
        pageBreak: {
          value: resolvePageBreak(block),
          onChange: (mode) => props.onUpdateBlock(section.id, block.id, pageBreakPatch(mode)),
        },
        pageOrientation: {
          value: resolvePageOrientation(block),
          onChange: (orientation) => props.onUpdateBlock(section.id, block.id, { pageOrientation: orientation === "landscape" ? "landscape" : undefined }),
        },
        deleteAction: {
          size: "icon",
          // Deleting asks first; the block comes back with "Deshacer".
          onDelete: () => confirmDelete({
            ...deleteConfirmation("block", stripLeadingRomanNumeral(block.title)),
            onConfirm: () => props.onRemoveBlock(section.id, block.id),
          }),
        },
      }}
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

          <ActionStrip
              capabilities={blockCapabilities}
              locks={{ add: locks.add, subblock: locks.subblock }}
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
            onApplySpacing={(conceptIds, spacingAfter) => props.onUpdateConcepts(section.id, block.id, conceptIds, { spacingAfter })}
            onApplyValueFormat={(conceptIds, valueFormat, customUnit) =>
              props.onUpdateConcepts(section.id, block.id, formattableConceptIds(block.concepts, conceptIds), valueFormatPatch(valueFormat, customUnit))
            }
            onApplyTagStyle={(conceptIds, tagStyle) =>
              props.onUpdateBlock(section.id, block.id, { contentLayout: layoutWithTagStyle(resolveContentLayout(block), conceptIds, tagStyle) })
            }
            onApplyTextMark={(conceptIds, mark) => props.onUpdateConcepts(section.id, block.id, conceptIds, textMarkPatch(mark))}
            onDuplicate={(conceptIds) => props.onDuplicateConcepts(section.id, block.id, conceptIds)}
            onRemove={(conceptIds) => props.onRemoveConcepts(section.id, block.id, conceptIds)}
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
              onDuplicate: (conceptId) => props.onDuplicateConcepts(section.id, block.id, [conceptId]),
              moveSource: { sectionId: section.id, blockId: block.id },
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
                extraActions={<ApartadoTransferMenu section={section} block={block} apartado={subBlock} label={`el ${subBlockTerm}`} />}
                displayLabel={showStructuralNumbering ? apartadoDisplayLabel({ annex: block.annex, sectionLabel: displayBlockLabel }, getBlockFlowApartadoOrder(block), subBlock.id) : ""}
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
                onPageBreakChange={(mode) =>
                  props.onUpdateApartado(section.id, block.id, subBlock.id, pageBreakPatch(mode))
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
                  onApplySpacing={(conceptIds, spacingAfter) => props.onUpdateConcepts(section.id, block.id, conceptIds, { spacingAfter }, subBlock.id)}
                  onApplyValueFormat={(conceptIds, valueFormat, customUnit) =>
                    props.onUpdateConcepts(section.id, block.id, formattableConceptIds(subBlock.concepts, conceptIds), valueFormatPatch(valueFormat, customUnit), subBlock.id)
                  }
                  onApplyTagStyle={(conceptIds, tagStyle) =>
                    props.onUpdateApartado(section.id, block.id, subBlock.id, { contentLayout: layoutWithTagStyle(resolveContentLayout(subBlock), conceptIds, tagStyle) })
                  }
                  onApplyTextMark={(conceptIds, mark) => props.onUpdateConcepts(section.id, block.id, conceptIds, textMarkPatch(mark), subBlock.id)}
                  onDuplicate={(conceptIds) => props.onDuplicateConcepts(section.id, block.id, conceptIds, subBlock.id)}
                  onRemove={(conceptIds) => props.onRemoveConcepts(section.id, block.id, conceptIds, subBlock.id)}
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
                    onDuplicate: (conceptId) => props.onDuplicateConcepts(section.id, block.id, [conceptId], subBlock.id),
                    moveSource: { sectionId: section.id, blockId: block.id, apartadoId: subBlock.id },
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

/** The concepts a "Formato del valor" applies to: texts and numbers, never dates, phones or paragraphs. */
function formattableConceptIds(concepts: Concept[], conceptIds: string[]) {
  const chosen = new Set(conceptIds);
  return concepts.filter((concept) => chosen.has(concept.id) && supportsValueFormat(concept)).map((concept) => concept.id);
}

/** The layout with the rows that hold any of the concepts printed in the style ("Renglón" of the selection). */
function layoutWithTagStyle(layout: ReturnType<typeof resolveContentLayout>, conceptIds: string[], tagStyle: ContentRowTagStyle | undefined) {
  const chosen = new Set(conceptIds);
  return layout.rows
    .filter((row) => row.columns.some((column) => column.items[0]?.type === "concept" && chosen.has(column.items[0].id)))
    .reduce((next, row) => setContentRowTagStyle(next, row.id, tagStyle), layout);
}

/** N, K or S on the whole value of each chosen text; a date, a number or a phone is left as it is. */
function textMarkPatch(mark: TextMark) {
  return (concept: Concept): Partial<Concept> => {
    const type = concept.type ?? "text";
    const takesMarks = (type === "text" || type === "longText" || type === "paragraph") && !isNumericConcept(concept);
    return takesMarks && concept.value.trim() ? { value: applyTextMark(concept.value, mark).value } : {};
  };
}

/** The patch "Formato del valor" writes on a concept. */
function valueFormatPatch(valueFormat: ConceptValueFormat, customUnit?: string): Partial<Concept> {
  return { valueFormat, customUnit: valueFormat === "custom" ? customUnit : undefined };
}

/**
 * A block the calculation writes: its figures are edited in the calculation
 * panel. It has the same toolbar as any other block: it is hidden, moved,
 * aligned or given a page break here; what the calculation owns (its
 * content, copying it, deleting it) is disabled and says why. The columns
 * of its tables are hidden, renamed or added.
 */
function GeneratedBlockEditor({ block, blockCount, blockIndex, readOnly, section, onMoveBlock, onUpdateBlock, onUpdateTable }: {
  block: Block;
  blockCount: number;
  blockIndex: number;
  readOnly: boolean;
  section: AppSection;
  onMoveBlock: (sectionId: string, blockId: string, direction: -1 | 1) => void;
  onUpdateBlock: (patch: Partial<Block>) => void;
  onUpdateTable: (tableId: string, table: TableContent, apartadoId?: string) => void;
}) {
  const tables = [
    ...block.tables.map((table) => ({ table, apartadoId: undefined as string | undefined })),
    ...block.apartados.flatMap((apartado) => apartado.tables.map((table) => ({ table, apartadoId: apartado.id }))),
  ].filter(({ table }) => !ensureTableV2(table).schema?.plain);
  const rows = tables.reduce((count, { table }) => count + ensureTableV2(table).rows.length, 0);
  const toolbar = blockToolbarState({ kind: "generated", readOnly });
  const locks = blockToolbarLocks(toolbar);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id, disabled: readOnly });
  return (
    <BlockCard
      blockId={block.id}
      cardRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg border border-dashed bg-muted/20", !block.enabled && "opacity-65")}
      badge={block.enabled ? (block.sectionLabel ? `${block.sectionLabel.replace(/\.+$/, "")}.` : "Fijo") : "Oculto"}
      dragHandle={
        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Mover ${block.title}`} title="Arrastrar para reordenar" disabled={readOnly} {...attributes} {...listeners}>
          <GripVertical />
        </Button>
      }
      extraActions={<BlockTransferMenu section={section} block={block} label="el bloque" lock={toolbar.transfer.reason} />}
      title={stripLeadingRomanNumeral(block.title)}
      structuralActions={{
        conceptPresentation: block.conceptPresentation,
        disabled: readOnly,
        itemLabel: BLOCK_TERM,
        locks,
        move: {
          canMoveUp: blockIndex > 0,
          canMoveDown: blockIndex < blockCount - 1,
          onMoveUp: () => onMoveBlock(section.id, block.id, -1),
          onMoveDown: () => onMoveBlock(section.id, block.id, 1),
        },
        onConceptPresentationChange: (next) => onUpdateBlock({ conceptPresentation: next }),
        visibility: { visible: block.enabled, onChange: (enabled) => onUpdateBlock({ enabled }) },
        pageBreak: { value: resolvePageBreak(block), onChange: (mode) => onUpdateBlock(pageBreakPatch(mode)) },
        deleteAction: { size: "icon", onDelete: () => undefined },
      }}
    >
      <ActionStrip
        capabilities={{}}
        locks={{ add: locks.add, subblock: locks.subblock }}
        readOnly={readOnly}
        conceptControl={null}
        onAddImage={() => undefined}
        onAddApartado={() => undefined}
        onAddTable={() => undefined}
        subBlockLabel={ADD_SUBBLOCK_LABEL}
      />
      <p className="text-xs text-muted-foreground" data-generated-block-notice>
        Generado por el cálculo{rows ? ` · ${rows} filas` : ""}{block.images.length ? ` · ${block.images.length} fotos` : ""}. Las cifras se editan en el panel de cálculo.
      </p>
      {block.enabled ? <GeneratedConceptLabels block={block} readOnly={readOnly} onChange={onUpdateBlock} /> : null}
      {block.enabled ? tables.map(({ table, apartadoId }) => (
        <GeneratedTableColumns
          key={table.id}
          table={table}
          readOnly={readOnly}
          onChange={(next) => onUpdateTable(table.id, next, apartadoId)}
        />
      )) : null}
    </BlockCard>
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
