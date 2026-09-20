import type { Concept } from "../model";

export function groupConceptsIntoRows(concepts: Concept[]): Concept[][] {
  const rows: Concept[][] = [];
  const explicitRows = new Map<string, Concept[]>();
  let legacyHalfRow: Concept[] | null = null;

  for (const concept of concepts) {
    if (concept.rowId) {
      legacyHalfRow = null;
      let row = explicitRows.get(concept.rowId);
      if (!row) {
        row = [];
        explicitRows.set(concept.rowId, row);
        rows.push(row);
      }
      row.push(concept);
      continue;
    }

    if (concept.layoutSpan === "full") {
      legacyHalfRow = null;
      rows.push([concept]);
      continue;
    }

    if (!legacyHalfRow || legacyHalfRow.length === 2) {
      legacyHalfRow = [];
      rows.push(legacyHalfRow);
    }
    legacyHalfRow.push(concept);
  }

  return rows;
}

export type ConceptDropPosition = "before" | "inside" | "left" | "right" | "after";

export type ConceptDrop = {
  activeId: string;
  newRowId?: string;
  overId?: string;
  position: ConceptDropPosition;
  targetRowId?: string;
  targetRowIndex: number;
};

export function moveConceptIntoRows(concepts: Concept[], drop: ConceptDrop): Concept[] {
  const rows = groupConceptsIntoRows(concepts).map((row) => [...row]);
  const sourceRowIndex = rows.findIndex((row) => row.some((concept) => concept.id === drop.activeId));
  if (sourceRowIndex < 0 || drop.targetRowIndex < 0 || drop.targetRowIndex >= rows.length) return concepts;

  const sourceRow = rows[sourceRowIndex];
  const activeIndex = sourceRow.findIndex((concept) => concept.id === drop.activeId);
  const [activeConcept] = sourceRow.splice(activeIndex, 1);
  if (!activeConcept) return concepts;
  const sourceRowRemoved = !sourceRow.length;
  if (sourceRowRemoved) rows.splice(sourceRowIndex, 1);

  let targetRowIndex = drop.targetRowIndex;
  if (sourceRowRemoved && sourceRowIndex < targetRowIndex) targetRowIndex -= 1;

  if (drop.position === "inside" || drop.position === "left" || drop.position === "right") {
    const targetRow = rows[targetRowIndex];
    if (!targetRow) return concepts;
    const targetRowId = targetRow[0]?.rowId ?? drop.targetRowId;
    if (!targetRowId) return concepts;
    const normalizedTargetRow = targetRow.map((concept) => ({ ...concept, rowId: targetRowId }));
    const overIndex = drop.overId
      ? normalizedTargetRow.findIndex((concept) => concept.id === drop.overId)
      : -1;
    const insertionIndex = overIndex >= 0
      ? overIndex + (drop.position === "right" ? 1 : 0)
      : normalizedTargetRow.length;
    normalizedTargetRow.splice(insertionIndex, 0, {
      ...activeConcept,
      rowId: targetRowId,
    });
    rows[targetRowIndex] = normalizedTargetRow;
  } else {
    if (!drop.newRowId) return concepts;
    rows.splice(targetRowIndex + (drop.position === "after" ? 1 : 0), 0, [{
      ...activeConcept,
      rowId: drop.newRowId,
    }]);
  }

  return rows.flatMap((row) => row);
}
