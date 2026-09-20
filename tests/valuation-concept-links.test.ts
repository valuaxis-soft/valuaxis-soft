import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { Concept } from "../src/features/valuations/model";
import {
  applyConceptEditOnlyHere,
  applyConceptUpdateEverywhere,
  changeExistingConceptRelation,
  conceptLinkIndicator,
  copyConceptAsIndependent,
  createIndependentConcept,
  isFullLinkedSourceOwned,
  linkConceptFully,
  linkConceptToCollection,
  linkConceptValueOnly,
  resolveEffectiveConcept,
  unlinkConcept,
} from "../src/features/valuations/concept-links";

const root = process.cwd();

test("concept type defaults to text while identity keys are local when missing", () => {
  const concept = createIndependentConcept({
    id: "concept-1",
    label: "Local title",
    value: "Local value",
  });

  assert.equal(concept.type, "text");
  assert.equal(concept.label, "Local title");
  assert.equal(concept.value, "Local value");
  assert.notEqual(concept.labelKey, undefined);
  assert.notEqual(concept.valueKey, undefined);
  assert.notEqual(concept.labelKey, concept.valueKey);
});

test("copy as new creates independent keys while copying title value and type", () => {
  const source: Concept = {
    id: "source",
    label: "Precio",
    value: "$100",
    type: "currency",
    valueFormat: "mxn",
    customUnit: "pesos",
    labelKey: "label-source",
    valueKey: "value-source",
  };

  const copy = copyConceptAsIndependent(source, "copy");

  assert.equal(copy.id, "copy");
  assert.equal(copy.label, source.label);
  assert.equal(copy.value, source.value);
  assert.equal(copy.type, source.type);
  assert.equal(copy.valueFormat, source.valueFormat);
  assert.equal(copy.customUnit, source.customUnit);
  assert.notEqual(copy.labelKey, source.labelKey);
  assert.notEqual(copy.valueKey, source.valueKey);
  assert.equal(conceptLinkIndicator(copy, [source, copy]), "none");
});

test("full links resolve numeric type and format from the source without migrating legacy targets", () => {
  const source = createIndependentConcept({
    id: "source",
    label: "Superficie",
    value: "1234",
    type: "measurement",
    valueFormat: "m2",
  });
  const linked: Concept = {
    ...linkConceptFully(source, "linked"),
    label: "Legacy local",
    value: "0",
    type: "text",
    valueFormat: undefined,
    customUnit: undefined,
  };

  const effective = resolveEffectiveConcept(linked, [source, linked]);

  assert.equal(effective.label, "Superficie");
  assert.equal(effective.value, "1234");
  assert.equal(effective.type, "measurement");
  assert.equal(effective.valueFormat, "m2");
  assert.equal(isFullLinkedSourceOwned(linked, [source, linked]), true);
});

test("legacy full links can resolve missing target format even when the target is encountered first", () => {
  const source = createIndependentConcept({
    id: "source",
    label: "Superficie",
    value: "1234",
    type: "measurement",
    valueFormat: "m2",
  });
  const linked: Concept = {
    ...linkConceptFully(source, "linked"),
    type: "text",
    valueFormat: undefined,
  };

  const effective = resolveEffectiveConcept(linked, [linked, source]);

  assert.equal(effective.type, "measurement");
  assert.equal(effective.valueFormat, "m2");
});

test("value-only links resolve raw value but keep target-local type and format", () => {
  const source = createIndependentConcept({
    id: "source",
    label: "Importe",
    value: "5000",
    type: "currency",
    valueFormat: "mxn",
  });
  const linked: Concept = {
    ...linkConceptValueOnly(source, "linked"),
    label: "Superficie local",
    type: "measurement",
    valueFormat: "ha",
    customUnit: "local",
  };

  const updated = applyConceptUpdateEverywhere([source, linked], source.id, { value: "9000" });
  const effective = resolveEffectiveConcept(updated[1], updated);

  assert.equal(effective.value, "9000");
  assert.equal(effective.label, "Superficie local");
  assert.equal(effective.type, "measurement");
  assert.equal(effective.valueFormat, "ha");
  assert.equal(effective.customUnit, "local");
});

test("unlinking a legacy full numeric link snapshots the currently resolved format metadata", () => {
  const source = createIndependentConcept({
    id: "source",
    label: "Superficie",
    value: "2500",
    type: "measurement",
    valueFormat: "custom",
    customUnit: "varas",
  });
  const linked: Concept = {
    ...linkConceptFully(source, "linked"),
    type: "text",
    valueFormat: undefined,
    customUnit: undefined,
  };

  const unlinked = unlinkConcept(linked, [source, linked]);

  assert.equal(unlinked.label, "Superficie");
  assert.equal(unlinked.value, "2500");
  assert.equal(unlinked.type, "measurement");
  assert.equal(unlinked.valueFormat, "custom");
  assert.equal(unlinked.customUnit, "varas");
  assert.equal(conceptLinkIndicator(unlinked, [source, unlinked]), "none");
});

test("changing a full link to copy concept snapshots resolved numeric metadata and unlinks", () => {
  const source = createIndependentConcept({
    id: "source",
    label: "Superficie",
    value: "2500",
    type: "measurement",
    valueFormat: "m2",
  });
  const linked: Concept = {
    ...linkConceptFully(source, "linked"),
    type: "text",
    valueFormat: undefined,
  };

  const updated = changeExistingConceptRelation([source, linked], linked.id, "copyConcept");
  const copied = updated.find((concept) => concept.id === linked.id)!;

  assert.equal(copied.type, "measurement");
  assert.equal(copied.valueFormat, "m2");
  assert.equal(conceptLinkIndicator(copied, updated), "none");
});



test("linking from a keyless source writes generated keys to both source and linked concept", () => {
  const source: Concept = { id: "source", label: "Cliente", value: "Ada" };

  const full = linkConceptToCollection([source], source.id, "linked-full", "full");

  assert.equal(full.length, 2);
  assert.ok(full[0].labelKey);
  assert.ok(full[0].valueKey);
  assert.equal(full[1].labelKey, full[0].labelKey);
  assert.equal(full[1].valueKey, full[0].valueKey);
  assert.equal(conceptLinkIndicator(full[1], full), "full");

  const valueOnly = linkConceptToCollection([source], source.id, "linked-value", "value");

  assert.equal(valueOnly.length, 2);
  assert.equal(valueOnly[0].labelKey, undefined);
  assert.ok(valueOnly[0].valueKey);
  assert.notEqual(valueOnly[1].labelKey, valueOnly[0].labelKey);
  assert.equal(valueOnly[1].valueKey, valueOnly[0].valueKey);
  assert.equal(conceptLinkIndicator(valueOnly[1], valueOnly), "partial");

  const copy = linkConceptToCollection([source], source.id, "copy", "copy");

  assert.equal(copy.length, 2);
  assert.equal(copy[0].labelKey, undefined);
  assert.equal(copy[0].valueKey, undefined);
  assert.notEqual(copy[1].labelKey, copy[0].labelKey);
  assert.notEqual(copy[1].valueKey, copy[0].valueKey);
  assert.equal(conceptLinkIndicator(copy[1], copy), "none");
});

test("linked updates propagate by existing keys and keyless edits stay local", () => {
  const keyless: Concept = { id: "keyless", label: "Local", value: "One" };

  const local = applyConceptUpdateEverywhere([keyless], keyless.id, { label: "Only here", value: "Two" });

  assert.deepEqual(local, [{ ...keyless, label: "Only here", value: "Two" }]);

  const [source, linked] = linkConceptToCollection([keyless], keyless.id, "linked", "full");
  const fromCopy = applyConceptUpdateEverywhere([source, linked], linked.id, { label: "Shared", value: "Three" });

  assert.deepEqual(fromCopy.map((concept) => concept.label), ["Shared", "Shared"]);
  assert.deepEqual(fromCopy.map((concept) => concept.value), ["Three", "Three"]);
});

test("full link shares labelKey and valueKey and derives blue indicator", () => {
  const source = createIndependentConcept({ id: "source", label: "Cliente", value: "Ada" });
  const linked = linkConceptFully(source, "linked");

  assert.equal(linked.labelKey, source.labelKey);
  assert.equal(linked.valueKey, source.valueKey);
  assert.equal(linked.type, source.type);
  assert.equal(conceptLinkIndicator(linked, [source, linked]), "full");
});

test("value-only link shares valueKey but not labelKey and derives partial indicator", () => {
  const source = createIndependentConcept({ id: "source", label: "Cliente", value: "Ada" });
  const linked = linkConceptValueOnly(source, "linked");

  assert.notEqual(linked.labelKey, source.labelKey);
  assert.equal(linked.valueKey, source.valueKey);
  assert.equal(conceptLinkIndicator(linked, [source, linked]), "partial");
});

test("label-only identity sharing derives partial indicator and syncs only title", () => {
  const source = createIndependentConcept({ id: "source", label: "Cliente", value: "Ada" });
  const linked: Concept = {
    ...source,
    id: "label-only",
    value: "Local value",
    valueKey: "label-only-value",
  };

  assert.equal(linked.labelKey, source.labelKey);
  assert.notEqual(linked.valueKey, source.valueKey);
  assert.equal(conceptLinkIndicator(linked, [source, linked]), "partial");

  const updated = applyConceptUpdateEverywhere([source, linked], linked.id, {
    label: "Solicitante",
    value: "Different",
  });

  assert.deepEqual(updated.map((concept) => concept.label), ["Solicitante", "Solicitante"]);
  assert.deepEqual(updated.map((concept) => concept.value), ["Ada", "Different"]);
});

test("unlink keeps visible data and type but creates independent identity keys", () => {
  const source = createIndependentConcept({ id: "source", label: "Cliente", value: "Ada", type: "email" });
  const linked = linkConceptFully(source, "linked");
  const unlinked = unlinkConcept(linked);

  assert.equal(unlinked.label, linked.label);
  assert.equal(unlinked.value, linked.value);
  assert.equal(unlinked.type, linked.type);
  assert.notEqual(unlinked.labelKey, source.labelKey);
  assert.notEqual(unlinked.valueKey, source.valueKey);
  assert.equal(conceptLinkIndicator(unlinked, [source, unlinked]), "none");
});

test("linked updates can update everywhere or edit only here", () => {
  const source = createIndependentConcept({ id: "source", label: "Cliente", value: "Ada" });
  const full = linkConceptFully(source, "full");
  const valueOnly = linkConceptValueOnly(source, "value-only");

  const updatedEverywhere = applyConceptUpdateEverywhere([source, full, valueOnly], full.id, {
    label: "Solicitante",
    value: "Grace",
  });

  assert.deepEqual(updatedEverywhere.map((concept) => concept.label), ["Solicitante", "Solicitante", "Cliente"]);
  assert.deepEqual(updatedEverywhere.map((concept) => concept.value), ["Grace", "Grace", "Grace"]);

  const editedHere = applyConceptEditOnlyHere(updatedEverywhere, full.id, { label: "Local", value: "Local value" });
  const local = editedHere.find((concept) => concept.id === full.id);

  assert.equal(local?.label, "Local");
  assert.equal(local?.value, "Local value");
  assert.equal(conceptLinkIndicator(local!, editedHere), "none");
  assert.equal(editedHere.find((concept) => concept.id === source.id)?.label, "Solicitante");
  assert.equal(editedHere.find((concept) => concept.id === source.id)?.value, "Grace");
});

test("Carátula compact layout remains a small grid and avoids preview/report imports", () => {
  const editor = readFileSync(join(root, "src/features/valuations/components/workspace/valuation-editor-panel.tsx"), "utf8");
  const preview = readFileSync(join(root, "src/features/valuations/components/workspace/valuation-preview-panel.tsx"), "utf8");
  const report = readFileSync(join(root, "src/features/valuations/components/report-preview.tsx"), "utf8");
  const branchStart = editor.indexOf('if (layout === "caratulaGrid")');
  const branchEnd = editor.indexOf("  return (\n    <div\n      className={cn(", branchStart);
  const branch = editor.slice(branchStart, branchEnd);

  assert.match(editor, /layout=\{usesCompactConceptSystem \? "caratulaGrid" : "default"\}/);
  assert.match(editor, /grid-cols-1[\s\S]*md:grid-cols-2[\s\S]*xl:grid-cols-3/);
  assert.doesNotMatch(branch, /rounded-lg border bg-background p-3/);
  assert.doesNotMatch(preview, /concept-links|labelKey|valueKey|ConceptLink/);
  assert.doesNotMatch(report, /concept-links|labelKey|valueKey|ConceptLink/);
});
