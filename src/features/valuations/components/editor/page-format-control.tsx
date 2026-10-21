"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { AppSection } from "@/features/valuations/model";
import {
  documentPagePresentation,
  isBindingMargin,
  isTitleBandStyle,
  isTitleBarStyle,
} from "@/features/valuations/services/page-presentation";

/**
 * The document's page choices, kept on its carátula section: the left margin
 * for binding, on every page, blue or outlined title bars for its blocks, and
 * the title band of the page header filled or white with a line.
 */
export function DocumentPageFormatControl({
  section,
  readOnly,
  onUpdateSection,
}: {
  section: AppSection;
  readOnly: boolean;
  onUpdateSection: (sectionId: string, patch: Partial<AppSection>) => void;
}) {
  const { bindingMargin, titleBars, titleBand } = documentPagePresentation([section]);
  return (
    <section className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
      <Field className="gap-1.5">
        <FieldLabel htmlFor="document-binding-margin">Margen izquierdo para encuadernar</FieldLabel>
        <NativeSelect
          id="document-binding-margin"
          className="w-full"
          value={bindingMargin}
          disabled={readOnly}
          onChange={(event) => {
            if (isBindingMargin(event.target.value)) onUpdateSection(section.id, { bindingMargin: event.target.value });
          }}
        >
          <NativeSelectOption value="normal">Normal</NativeSelectOption>
          <NativeSelectOption value="wide">Amplio (+1.5 cm)</NativeSelectOption>
        </NativeSelect>
        <FieldDescription>Se aplica a todas las páginas del documento.</FieldDescription>
      </Field>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="document-title-bars">Títulos de las secciones</FieldLabel>
        <NativeSelect
          id="document-title-bars"
          className="w-full"
          value={titleBars}
          disabled={readOnly}
          onChange={(event) => {
            if (isTitleBarStyle(event.target.value)) onUpdateSection(section.id, { titleBars: event.target.value });
          }}
        >
          <NativeSelectOption value="filled">Barra azul</NativeSelectOption>
          <NativeSelectOption value="outline">Sin relleno (texto con línea)</NativeSelectOption>
        </NativeSelect>
        <FieldDescription>Las barras de título de los bloques se imprimen {titleBars === "outline" ? "sin relleno, con texto oscuro y una línea fina" : "en azul"}.</FieldDescription>
      </Field>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="document-title-band">Banda «Dictamen valuatorio»</FieldLabel>
        <NativeSelect
          id="document-title-band"
          className="w-full"
          value={titleBand}
          disabled={readOnly}
          onChange={(event) => {
            if (isTitleBandStyle(event.target.value)) onUpdateSection(section.id, { titleBand: event.target.value });
          }}
        >
          <NativeSelectOption value="filled">Barra azul</NativeSelectOption>
          <NativeSelectOption value="outline">Sin relleno (letras azules y línea)</NativeSelectOption>
        </NativeSelect>
        <FieldDescription>
          {titleBand === "outline"
            ? "El título del documento va en blanco con letras azules y una línea azul separa el encabezado del cuerpo, como en tu Excel."
            : "El título del documento, bajo el encabezado de cada página, va en una barra azul."}
        </FieldDescription>
      </Field>
    </section>
  );
}
