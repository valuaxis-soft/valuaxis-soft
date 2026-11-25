"use client";

/**
 * «Clase de avalúo», «¿Qué se está valuando?», «Tipo de avalúo» and «Tipo de
 * operación» of the carátula (24 Nov 2026). What is valued decides the
 * catalog's «Tipo de bien» (appraisal-subject.ts), so a house that becomes a
 * piece of land still takes the land's sections and panels; the class of
 * machinery is chosen when the valuation is created, since its panels and
 * wordings depend on it.
 */
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ValuationMeta } from "@/features/valuations/model";
import {
  APPRAISAL_CLASSES,
  APPRAISAL_CLASS_LABELS,
  classOfPropertyKind,
  defaultEssence,
  essenceChoices,
  essenceKey,
  propertyKindFor,
  type AppraisalClass,
} from "@/features/valuations/services/appraisal-subject";
import {
  NEW_OWN_CHOICE,
  OTHER_VALUATION_KIND,
  VALUATION_KIND_OPTIONS,
  appraisalKindChoiceOf,
  appraisalKindChoices,
  appraisalKindOfChoice,
  isOwnKindKey,
  normalizeValuationKind,
} from "@/features/valuations/services/property-kinds";
import { ExtendableSelect } from "../extendable-select";
import { useFirmLists } from "./firm-lists-context";

const FIELD = "min-w-0 md:col-span-3 xl:col-span-3";

/** The meta a class and an essence stand for: the essence and the «Tipo de bien» (with its name when it is «Otro»). */
export function subjectPatch(appraisalClass: AppraisalClass, essence: string): Partial<ValuationMeta> {
  const propertyKind = propertyKindFor(appraisalClass, essence);
  return { appraisalClass, essence, propertyKind, propertyKindOther: isOwnKindKey(propertyKind) ? essence : "" };
}

export function CaratulaSubjectFields({
  meta,
  onUpdateMeta,
  readOnly,
}: {
  meta: ValuationMeta;
  onUpdateMeta: (patch: Partial<ValuationMeta>) => void;
  readOnly: boolean;
}) {
  const { lists, keep } = useFirmLists();
  const machinery = classOfPropertyKind(meta.propertyKind) === "MAQUINARIA";
  const appraisalClass: AppraisalClass = machinery ? "MAQUINARIA" : meta.appraisalClass && meta.appraisalClass !== "MAQUINARIA" ? meta.appraisalClass : "INMUEBLE";
  const essence = meta.essence ?? "";
  // «Otro…» chosen: the name is typed here and goes to the meta as it is typed.
  const [writingEssence, setWritingEssence] = useState(false);
  const [writingKind, setWritingKind] = useState(false);
  const essences = essenceChoices(appraisalClass, lists.essences[appraisalClass], writingEssence ? undefined : essence);
  const essenceValue = writingEssence ? NEW_OWN_CHOICE : essences.find((choice) => essenceKey(choice.value) === essenceKey(essence))?.value ?? NEW_OWN_CHOICE;
  const kindChoices = appraisalKindChoices(lists.appraisalKinds, writingKind ? undefined : meta.appraisalKindOther);
  const kindValue = writingKind ? NEW_OWN_CHOICE : appraisalKindChoiceOf(meta.appraisalKind, meta.appraisalKindOther);

  return (
    <>
      <div className={FIELD}>
        <Field>
          <FieldLabel htmlFor="caratula-clase-avaluo">Clase de avalúo</FieldLabel>
          <NativeSelect
            id="caratula-clase-avaluo"
            className="w-full"
            // Machinery is chosen when the valuation is created: its panels and wordings depend on it.
            disabled={readOnly || machinery}
            value={appraisalClass}
            onChange={(event) => {
              const next = event.target.value as AppraisalClass;
              setWritingEssence(false);
              onUpdateMeta(subjectPatch(next, defaultEssence(next)));
            }}
          >
            {APPRAISAL_CLASSES.map((option) => (
              <NativeSelectOption key={option} value={option} disabled={!machinery && option === "MAQUINARIA"}>{APPRAISAL_CLASS_LABELS[option]}</NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className={FIELD}>
        <Field>
          <FieldLabel htmlFor="caratula-que-se-valua">¿Qué se está valuando?</FieldLabel>
          <ExtendableSelect
            id="caratula-que-se-valua"
            choices={essences}
            value={essenceValue}
            disabled={readOnly}
            onChange={(value) => {
              if (value === NEW_OWN_CHOICE) {
                setWritingEssence(true);
                onUpdateMeta(subjectPatch(appraisalClass, ""));
                return;
              }
              setWritingEssence(false);
              onUpdateMeta(subjectPatch(appraisalClass, value));
            }}
            typed={writingEssence ? essence : ""}
            onTypedChange={(value) => onUpdateMeta(subjectPatch(appraisalClass, value))}
            placeholder={appraisalClass === "MAQUINARIA" ? "Ej. Grúa" : "Ej. Hotel boutique"}
            onKeep={async (name) => {
              const kept = await keep({ list: "queSeValua", appraisalClass, name });
              if (kept) {
                setWritingEssence(false);
                onUpdateMeta(subjectPatch(appraisalClass, name));
              }
              return kept;
            }}
          />
        </Field>
      </div>
      <div className={FIELD}>
        <Field>
          <FieldLabel htmlFor="caratula-tipo-avaluo">Tipo de avalúo</FieldLabel>
          <ExtendableSelect
            id="caratula-tipo-avaluo"
            choices={kindChoices}
            value={kindValue}
            disabled={readOnly}
            onChange={(value) => {
              setWritingKind(value === NEW_OWN_CHOICE);
              const { key, ownName } = appraisalKindOfChoice(value);
              onUpdateMeta({ appraisalKind: key, appraisalKindOther: ownName });
            }}
            typed={writingKind ? meta.appraisalKindOther ?? "" : ""}
            onTypedChange={(value) => onUpdateMeta({ appraisalKind: "otro", appraisalKindOther: value })}
            placeholder="Ej. Arbitraje"
            onKeep={async (name) => {
              const kept = await keep({ list: "tipoAvaluo", name });
              if (kept) {
                setWritingKind(false);
                onUpdateMeta({ appraisalKind: "otro", appraisalKindOther: name });
              }
              return kept;
            }}
          />
        </Field>
      </div>
      <div className={FIELD}>
        <Field>
          {/* Venta, renta, garantía…: what the valuation is for. It was called «Tipo de avalúo» here before. */}
          <FieldLabel htmlFor="caratula-tipo-operacion">Tipo de operación</FieldLabel>
          <NativeSelect
            id="caratula-tipo-operacion"
            className="w-full"
            disabled={readOnly}
            value={normalizeValuationKind(meta.valuationKind)}
            onChange={(event) => onUpdateMeta({ valuationKind: event.target.value })}
          >
            {VALUATION_KIND_OPTIONS.map((option) => (
              <NativeSelectOption key={option.key} value={option.key}>{option.label}</NativeSelectOption>
            ))}
          </NativeSelect>
          {normalizeValuationKind(meta.valuationKind) === OTHER_VALUATION_KIND ? (
            <Input
              aria-label="Nombre del tipo de operación"
              className="mt-1"
              placeholder="Escribe el tipo de operación"
              maxLength={120}
              readOnly={readOnly}
              value={meta.valuationKindOther ?? ""}
              onChange={(event) => onUpdateMeta({ valuationKindOther: event.target.value })}
            />
          ) : null}
        </Field>
      </div>
    </>
  );
}
