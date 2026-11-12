"use client";

import type { Apartado, Block, Concept, ContentRowTagStyle } from "@/features/valuations/model";
import { withConceptLabel } from "@/features/valuations/calculation/generated-table-layout";
import { GENERATED_CONCEPT_HINT } from "@/features/valuations/services/concept-context-menu";
import { supportsValueFormat } from "@/features/valuations/services/concept-value-format";
import { resolveContentLayout, setConceptRowsTagStyle } from "@/features/valuations/services/content-layout";
import { CommitCell } from "../calculation/commit-cell";
import { ConceptContextMenu } from "./concept-context-menu";
import { ConceptOptionsMenu } from "./concept-editor";
import { ConceptSelectionCheckbox, ConceptSelectionScope } from "./concept-selection";

/** Only what the appraiser sets on a concept the calculation writes: its spacing. */
const spacingOf = (patch: Partial<Concept>): Partial<Concept> => ({
  ...("spacingBefore" in patch ? { spacingBefore: patch.spacingBefore } : {}),
  ...("spacingAfter" in patch ? { spacingAfter: patch.spacingAfter } : {}),
});

/** The layout of a container with the rows that hold any of the concepts printed in the style ("Renglón"). */
function withTagStyle<T extends Block | Apartado>(container: T, conceptIds: string[], tagStyle: ContentRowTagStyle | undefined): T {
  return { ...container, contentLayout: setConceptRowsTagStyle(resolveContentLayout(container), conceptIds, tagStyle) };
}

/**
 * The concepts a calculation writes as label and value (the income
 * approach's result, the market's dispersion…), with the same controls as
 * the concepts of any block: "Seleccionar conceptos", the ⋮ menu and the
 * right-click menu. The appraiser prints them under names of their own, with
 * the spacing and the row style ("Renglón") he chooses, and all of it stays
 * when the calculation writes the block again; the value, its format, its
 * place and deleting it are the calculation's, shown disabled with the reason.
 */
export function GeneratedConcepts(props: { block: Block; readOnly: boolean; onChange: (patch: Partial<Block>) => void }) {
  const { block, readOnly } = props;
  const containers: Array<{ container: Block | Apartado; apartado?: Apartado }> = [
    { container: block },
    ...block.apartados.map((apartado) => ({ container: apartado, apartado })),
  ].filter(({ container }) => container.concepts.length > 0);
  if (!containers.length) return null;

  const changeConcept = (id: string, change: (concept: Concept) => Concept) => {
    const map = (items: Concept[]) => items.map((concept) => (concept.id === id ? change(concept) : concept));
    props.onChange({
      concepts: map(block.concepts),
      apartados: block.apartados.map((apartado) => ({ ...apartado, concepts: map(apartado.concepts) })),
    });
  };
  const changeConcepts = (ids: string[], patch: Partial<Concept>) => {
    const chosen = new Set(ids);
    const map = (items: Concept[]) => items.map((concept) => (chosen.has(concept.id) ? { ...concept, ...patch } : concept));
    props.onChange({
      concepts: map(block.concepts),
      apartados: block.apartados.map((apartado) => ({ ...apartado, concepts: map(apartado.concepts) })),
    });
  };
  const applyTagStyle = (apartado: Apartado | undefined, ids: string[], tagStyle: ContentRowTagStyle | undefined) => {
    if (!apartado) {
      props.onChange({ contentLayout: withTagStyle(block, ids, tagStyle).contentLayout });
      return;
    }
    props.onChange({ apartados: block.apartados.map((item) => (item.id === apartado.id ? withTagStyle(item, ids, tagStyle) : item)) });
  };

  return (
    <div className="grid gap-3 rounded-md border bg-background p-2 text-xs" data-generated-concepts={block.id}>
      <p className="text-muted-foreground">
        Escribe el nombre con el que se imprime cada dato y su espacio o renglón; la cifra la sigue escribiendo el cálculo. Vacío, vuelve el nombre del cálculo.
      </p>
      {containers.map(({ container, apartado }) => (
        <div key={container.id} className="grid gap-1">
          {apartado ? <span className="font-semibold">{apartado.title}</span> : null}
          <ConceptSelectionScope
            concepts={container.concepts}
            readOnly={readOnly}
            lockedReason={GENERATED_CONCEPT_HINT}
            onApplySpacing={(ids, field, lines) => changeConcepts(ids, { [field]: lines })}
            onApplyTagStyle={(ids, tagStyle) => applyTagStyle(apartado, ids, tagStyle)}
          >
            {container.concepts.map((concept) => {
              const original = concept.generatedLabel ?? concept.label;
              const onPatch = (patch: Partial<Concept>) => changeConcept(concept.id, (current) => ({ ...current, ...spacingOf(patch) }));
              const row = (
                <div className="grid grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)_auto] items-center gap-2" data-generated-concept={concept.id}>
                  <ConceptSelectionCheckbox conceptId={concept.id} label={concept.label} />
                  <CommitCell
                    ariaLabel={`Etiqueta ${original}`}
                    disabled={readOnly}
                    value={concept.generatedLabel !== undefined ? concept.label : ""}
                    placeholder={original}
                    className="border-input text-xs"
                    onCommit={(text) => changeConcept(concept.id, (current) => withConceptLabel(current, text))}
                  />
                  <span className="truncate tabular-nums text-muted-foreground" title={GENERATED_CONCEPT_HINT}>{concept.value || "—"}</span>
                  <ConceptOptionsMenu
                    concept={concept}
                    concepts={container.concepts}
                    enableSpacingControl
                    enableValueFormatControl={supportsValueFormat(concept)}
                    enableWidthControl={false}
                    readOnly={readOnly}
                    lockedReason={GENERATED_CONCEPT_HINT}
                    onRemove={() => undefined}
                    onUpdate={(_id, patch) => onPatch(patch)}
                  />
                </div>
              );
              return readOnly ? <div key={concept.id}>{row}</div> : (
                <ConceptContextMenu
                  key={concept.id}
                  concept={concept}
                  name={concept.label}
                  target={{
                    generated: true,
                    readOnly,
                    takesTextMarks: false,
                    hasValue: Boolean(concept.value.trim()),
                    valueFormat: supportsValueFormat(concept) ? "enabled" : "unsupported",
                    date: concept.type === "date",
                    hasLineBreaks: false,
                    canDuplicate: false,
                    canDelete: false,
                  }}
                  onPatch={onPatch}
                >
                  {row}
                </ConceptContextMenu>
              );
            })}
          </ConceptSelectionScope>
        </div>
      ))}
    </div>
  );
}
