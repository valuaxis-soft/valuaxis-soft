import type { Concept, ConceptType } from "@/features/valuations/model";
import { normalizeConceptTitle } from "@/features/valuations/services/concept-title";

export type ConceptLinkIndicator = "full" | "partial" | "none";
export type ConceptLinkMode = "copy" | "full" | "value";
export type ExistingConceptRelationMode = "copyConcept" | "copyValue" | "full" | "unlink" | "value";

let localKeyCounter = 0;

function nextIdentityKey(prefix: string) {
  localKeyCounter += 1;
  return `${prefix}-${localKeyCounter}`;
}

function keyPrefix(id: string, part: "label" | "value") {
  return `${id}-${part}`;
}

export function createIndependentConcept(input: {
  id: string;
  label: string;
  value: string;
  type?: ConceptType;
  valueFormat?: Concept["valueFormat"];
  sourceUnit?: Concept["sourceUnit"];
  customUnit?: string;
}): Concept {
  return {
    id: input.id,
    label: normalizeConceptTitle(input.label),
    value: input.value,
    type: input.type ?? "text",
    valueFormat: input.valueFormat,
    sourceUnit: input.sourceUnit,
    customUnit: input.customUnit,
    labelKey: nextIdentityKey(keyPrefix(input.id, "label")),
    valueKey: nextIdentityKey(keyPrefix(input.id, "value")),
    enabled: true,
  };
}

export function copyConceptAsIndependent(source: Concept, id: string): Concept {
  return createIndependentConcept({
    id,
    label: source.label,
    value: source.value,
    type: source.type ?? "text",
    valueFormat: source.valueFormat,
    sourceUnit: source.sourceUnit,
    customUnit: source.customUnit,
  });
}

function ensureLabelKey(concept: Concept) {
  return concept.labelKey ?? keyPrefix(concept.id, "label");
}

function ensureValueKey(concept: Concept) {
  return concept.valueKey ?? keyPrefix(concept.id, "value");
}

export function linkConceptFully(source: Concept, id: string): Concept {
  return {
    ...source,
    id,
    label: normalizeConceptTitle(source.label),
    type: source.type ?? "text",
    labelKey: ensureLabelKey(source),
    valueKey: ensureValueKey(source),
    enabled: true,
  };
}

export function linkConceptValueOnly(source: Concept, id: string): Concept {
  return {
    ...source,
    id,
    label: normalizeConceptTitle(source.label),
    type: source.type ?? "text",
    labelKey: nextIdentityKey(keyPrefix(id, "label")),
    valueKey: ensureValueKey(source),
    enabled: true,
  };
}

function ensureSourceKeysForLink(source: Concept, mode: Exclude<ConceptLinkMode, "copy">): Concept {
  if (mode === "full") {
    return {
      ...source,
      label: normalizeConceptTitle(source.label),
      labelKey: ensureLabelKey(source),
      valueKey: ensureValueKey(source),
    };
  }

  return {
    ...source,
    valueKey: ensureValueKey(source),
  };
}

export function linkConceptToCollection(
  concepts: Concept[],
  sourceId: string,
  id: string,
  mode: ConceptLinkMode,
): Concept[] {
  const source = concepts.find((concept) => concept.id === sourceId);
  if (!source) return concepts;

  if (mode === "copy") {
    return [...concepts, copyConceptAsIndependent(source, id)];
  }

  const sourceWithKeys = ensureSourceKeysForLink(source, mode);
  const linked = mode === "full"
    ? linkConceptFully(sourceWithKeys, id)
    : linkConceptValueOnly(sourceWithKeys, id);

  return [
    ...concepts.map((concept) => (concept.id === sourceId ? sourceWithKeys : concept)),
    linked,
  ];
}

function conceptsSharingLabelAndValue(concepts: Concept[], target: Concept) {
  return concepts.filter((concept) =>
    concept.labelKey
    && concept.valueKey
    && concept.labelKey === target.labelKey
    && concept.valueKey === target.valueKey,
  );
}

function firstConceptSharingLabel(concepts: Concept[], target: Concept) {
  return concepts.find((concept) =>
    concept.labelKey
    && concept.labelKey === target.labelKey,
  );
}

function firstConceptSharingValue(concepts: Concept[], target: Concept) {
  return concepts.find((concept) =>
    concept.valueKey
    && concept.valueKey === target.valueKey,
  );
}

export function getFullLinkSource(concept: Concept, concepts: Concept[]): Concept | null {
  if (!concept.labelKey || !concept.valueKey) return null;
  const linkedConcepts = conceptsSharingLabelAndValue(concepts, concept);
  const hasLinkedPeer = linkedConcepts.some((item) => item.id !== concept.id);
  if (!hasLinkedPeer) return null;

  return linkedConcepts[0] ?? null;
}

function getFullLinkResolvedSource(concept: Concept, concepts: Concept[]): Concept | null {
  const source = getFullLinkSource(concept, concepts);
  if (!source || source.id !== concept.id) return source;

  return conceptsSharingLabelAndValue(concepts, concept).find((item) =>
    item.id !== concept.id
    && (
      (concept.valueFormat === undefined && item.valueFormat !== undefined)
      || (concept.customUnit === undefined && item.customUnit !== undefined)
      || ((concept.type === undefined || concept.type === "text") && item.type !== undefined && item.type !== "text")
    ),
  ) ?? null;
}

export function isFullLinkedSourceOwned(concept: Concept, concepts: Concept[]) {
  const source = getFullLinkSource(concept, concepts);
  return Boolean(source && source.id !== concept.id);
}

export function resolveEffectiveConcept(concept: Concept, concepts: Concept[]): Concept {
  const fullSource = getFullLinkResolvedSource(concept, concepts);
  if (fullSource) {
    return {
      ...concept,
      label: normalizeConceptTitle(fullSource.label),
      value: fullSource.value,
      type: fullSource.type ?? concept.type ?? "text",
      valueFormat: fullSource.valueFormat,
      sourceUnit: fullSource.sourceUnit,
      customUnit: fullSource.customUnit,
    };
  }

  const labelSource = firstConceptSharingLabel(concepts, concept);
  const valueSource = firstConceptSharingValue(concepts, concept);

  return {
    ...concept,
    label: labelSource ? normalizeConceptTitle(labelSource.label) : normalizeConceptTitle(concept.label),
    value: valueSource?.value ?? concept.value,
    type: concept.type ?? "text",
  };
}

export function unlinkConcept(concept: Concept, concepts: Concept[] = [concept]): Concept {
  const effective = resolveEffectiveConcept(concept, concepts);
  return {
    ...concept,
    label: normalizeConceptTitle(effective.label),
    value: effective.value,
    type: effective.type ?? "text",
    valueFormat: effective.valueFormat,
    sourceUnit: effective.sourceUnit,
    customUnit: effective.customUnit,
    labelKey: nextIdentityKey(keyPrefix(concept.id, "label")),
    valueKey: nextIdentityKey(keyPrefix(concept.id, "value")),
  };
}

function findCurrentConceptSource(concepts: Concept[], target: Concept, mode: ExistingConceptRelationMode) {
  if (mode === "full") {
    return concepts.find((concept) =>
      concept.id !== target.id
      && (
        (target.labelKey && concept.labelKey === target.labelKey)
        || (target.valueKey && concept.valueKey === target.valueKey)
      ),
    );
  }

  if (mode === "value" || mode === "copyValue") {
    return concepts.find((concept) =>
      concept.id !== target.id
      && target.valueKey
      && concept.valueKey === target.valueKey,
    );
  }

  return concepts.find((concept) =>
    concept.id !== target.id
    && (
      (target.labelKey && concept.labelKey === target.labelKey)
      || (target.valueKey && concept.valueKey === target.valueKey)
    ),
  );
}

export function changeExistingConceptRelation(
  concepts: Concept[],
  conceptId: string,
  mode: ExistingConceptRelationMode,
): Concept[] {
  const target = concepts.find((concept) => concept.id === conceptId);
  if (!target) return concepts;

  if (mode === "unlink") {
    return concepts.map((concept) => (concept.id === conceptId ? unlinkConcept(concept, concepts) : concept));
  }

  const source = findCurrentConceptSource(concepts, target, mode) ?? target;
  const sourceWithKeys = mode === "full" || mode === "value"
    ? ensureSourceKeysForLink(source, mode)
    : source;
  const nextConcept = mode === "full"
    ? linkConceptFully(sourceWithKeys, target.id)
    : mode === "value"
      ? linkConceptValueOnly(sourceWithKeys, target.id)
        : mode === "copyConcept"
        ? unlinkConcept({
            ...target,
            label: normalizeConceptTitle(sourceWithKeys.label),
            value: sourceWithKeys.value,
            type: sourceWithKeys.type ?? target.type ?? "text",
            valueFormat: sourceWithKeys.valueFormat,
            sourceUnit: sourceWithKeys.sourceUnit,
            customUnit: sourceWithKeys.customUnit,
          })
        : unlinkConcept({
            ...target,
            value: sourceWithKeys.value,
            type: sourceWithKeys.type ?? target.type ?? "text",
            valueFormat: sourceWithKeys.valueFormat,
            sourceUnit: sourceWithKeys.sourceUnit,
            customUnit: sourceWithKeys.customUnit,
          });

  return concepts.map((concept) => {
    if (concept.id === conceptId) return nextConcept;
    if (concept.id === source.id && source.id !== target.id) return sourceWithKeys;
    return concept;
  });
}

export function conceptLinkIndicator(concept: Concept, concepts: Concept[]): ConceptLinkIndicator {
  const labelKey = concept.labelKey;
  const valueKey = concept.valueKey;
  if (!labelKey && !valueKey) return "none";

  const sharesLabel = Boolean(labelKey && concepts.some((item) => item.id !== concept.id && item.labelKey === labelKey));
  const sharesValue = Boolean(valueKey && concepts.some((item) => item.id !== concept.id && item.valueKey === valueKey));

  if (sharesLabel && sharesValue) return "full";
  if (sharesLabel || sharesValue) return "partial";
  return "none";
}

export function applyConceptUpdateEverywhere(
  concepts: Concept[],
  conceptId: string,
  patch: Partial<Pick<Concept, "label" | "value">>,
): Concept[] {
  const target = concepts.find((concept) => concept.id === conceptId);
  if (!target) return concepts;

  return concepts.map((concept) => {
    const next: Concept = { ...concept };
    const sharesLabel = target.labelKey
      ? concept.labelKey === target.labelKey
      : concept.id === target.id;
    const sharesValue = target.valueKey
      ? concept.valueKey === target.valueKey
      : concept.id === target.id;

    if (patch.label !== undefined && sharesLabel) {
      next.label = patch.label;
    }
    if (patch.value !== undefined && sharesValue) {
      next.value = patch.value;
    }
    return next;
  });
}

export function applyConceptEditOnlyHere(
  concepts: Concept[],
  conceptId: string,
  patch: Partial<Pick<Concept, "label" | "value">>,
): Concept[] {
  return concepts.map((concept) => {
    if (concept.id !== conceptId) return concept;
    return {
      ...concept,
      ...patch,
      ...(patch.label !== undefined ? { labelKey: nextIdentityKey(keyPrefix(concept.id, "label")) } : {}),
      ...(patch.value !== undefined ? { valueKey: nextIdentityKey(keyPrefix(concept.id, "value")) } : {}),
    };
  });
}
