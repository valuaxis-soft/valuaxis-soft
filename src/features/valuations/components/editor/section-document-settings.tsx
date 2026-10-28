"use client";

import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { AppSection } from "@/features/valuations/model";
import {
  SECTION_PAGE_BREAK_LABELS,
  canChooseDocumentRole,
  isSectionDocumentRole,
  isSectionPageBreak,
  sectionDocumentRole,
} from "@/features/valuations/services/document-structure";
import {
  REPORT_APPROACH_LABELS,
  approachIncluded,
  sectionLeftOutOfReport,
  sectionReportApproaches,
  withApproachIncluded,
} from "@/features/valuations/services/report-approaches";
import { ConfigSwitch, EditorConfigPanel } from "./editor-config-panel";

const ANNEX_TITLE_MAX = 60;

/** "No incluido en el informe": the section, or some of its approaches, stay out of the dictamen. */
export function ReportInclusionBadge({ section }: { section: AppSection }) {
  const held = sectionReportApproaches(section);
  if (!held.length) return null;
  if (sectionLeftOutOfReport(section)) {
    return <Badge variant="destructive" data-report-inclusion="out">No incluido en el informe</Badge>;
  }
  const out = held.filter((approach) => !approachIncluded(section, approach));
  if (!out.length) return null;
  return (
    <Badge variant="outline" className="border-destructive/50 text-destructive" data-report-inclusion="partial">
      No incluido en el informe: {out.map((approach) => REPORT_APPROACH_LABELS[approach].toLowerCase()).join(", ")}
    </Badge>
  );
}

/**
 * How the section enters the dictamen: whether each of its approaches goes in
 * ("Agregar al informe valuatorio"), chapter or annex and the annex's label,
 * and where it starts on the printed pages. Nothing of it prints.
 */
export function SectionDocumentSettings({
  section,
  allSections,
  readOnly,
  onUpdateSection,
}: {
  section: AppSection;
  allSections: AppSection[];
  readOnly: boolean;
  onUpdateSection: (sectionId: string, patch: Partial<AppSection>) => void;
}) {
  if (section.id === "caratula") return null;
  const approaches = sectionReportApproaches(section);
  const role = sectionDocumentRole(section, allSections);
  const choosesRole = canChooseDocumentRole(section);
  const pageBreak = section.pageBreak ?? "new-page";
  const id = (name: string) => `section-${section.id}-${name}`;

  return (
    <EditorConfigPanel title="Configuración de la sección">
      {approaches.length ? (
        <div className="grid gap-2" data-report-approaches="">
          {approaches.map((approach) => (
            <ConfigSwitch
              key={approach}
              checked={approachIncluded(section, approach)}
              disabled={readOnly}
              label={approaches.length > 1 ? `Agregar al informe valuatorio: ${REPORT_APPROACH_LABELS[approach].toLowerCase()}` : "Agregar al informe valuatorio"}
              description={approachIncluded(section, approach)
                ? "Se imprime en el dictamen y entra a la conclusión."
                : "No se imprime ni entra a la conclusión; sus cálculos se conservan."}
              onCheckedChange={(included) => onUpdateSection(section.id, { excludedFromReport: withApproachIncluded(section, approach, included) })}
            />
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {choosesRole ? (
          <Field className="gap-1.5">
            <FieldLabel htmlFor={id("role")}>Tipo de sección</FieldLabel>
            <NativeSelect
              id={id("role")}
              className="w-full"
              value={role}
              disabled={readOnly}
              onChange={(event) => {
                if (isSectionDocumentRole(event.target.value)) onUpdateSection(section.id, { documentRole: event.target.value });
              }}
            >
              <NativeSelectOption value="chapter">Capítulo (número romano)</NativeSelectOption>
              <NativeSelectOption value="annex">Anexo («ANEXO n»)</NativeSelectOption>
            </NativeSelect>
            <FieldDescription>Las secciones después de la conclusión son anexos, salvo que elijas otra cosa.</FieldDescription>
          </Field>
        ) : null}
        {role === "annex" ? (
          <Field className="gap-1.5">
            <FieldLabel htmlFor={id("annex-title")}>Rótulo del anexo</FieldLabel>
            <Input
              id={id("annex-title")}
              maxLength={ANNEX_TITLE_MAX}
              placeholder={section.annexTitle ? "ANEXO" : section.label || "ANEXO"}
              value={section.annexTitle ?? ""}
              disabled={readOnly}
              onChange={(event) => onUpdateSection(section.id, { annexTitle: event.target.value.toUpperCase() || undefined })}
            />
            <FieldDescription>Se imprime en lugar del número romano. Vacío, se numera solo.</FieldDescription>
          </Field>
        ) : null}
        <Field className="gap-1.5">
          <FieldLabel htmlFor={id("page-break")}>Inicio de la sección</FieldLabel>
          <NativeSelect
            id={id("page-break")}
            className="w-full"
            value={pageBreak}
            disabled={readOnly}
            onChange={(event) => {
              const value = event.target.value;
              if (isSectionPageBreak(value)) onUpdateSection(section.id, { pageBreak: value === "new-page" ? undefined : value });
            }}
          >
            {(["new-page", "continue"] as const).map((value) => (
              <NativeSelectOption key={value} value={value}>{SECTION_PAGE_BREAK_LABELS[value]}</NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            {pageBreak === "continue"
              ? "En el dictamen empieza justo debajo de la sección anterior, sin dejar hueco."
              : "En el dictamen empieza en una página nueva."}
          </FieldDescription>
        </Field>
      </div>
    </EditorConfigPanel>
  );
}
