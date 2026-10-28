"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import type { AppSection } from "@/features/valuations/model";
import { documentNumberPresentation } from "@/features/valuations/services/number-presentation";

/**
 * The document's choice of thousands separator, kept on its carátula section:
 * "40,000" with it, "40000" without. Amounts of money keep their format.
 */
export function DocumentNumberFormatControl({
  section,
  readOnly,
  onUpdateSection,
}: {
  section: AppSection;
  readOnly: boolean;
  onUpdateSection: (sectionId: string, patch: Partial<AppSection>) => void;
}) {
  const { thousandsSeparator } = documentNumberPresentation([section]);
  return (
    <section className="rounded-md border bg-background p-3">
      <Field orientation="horizontal">
        <Checkbox
          id="document-thousands-separator"
          checked={thousandsSeparator}
          disabled={readOnly}
          onCheckedChange={(checked) => onUpdateSection(section.id, { thousandsSeparator: checked === true })}
        />
        <div className="grid gap-1">
          <FieldLabel htmlFor="document-thousands-separator">Separador de miles</FieldLabel>
          <FieldDescription>
            Los números del documento se escriben {thousandsSeparator ? "con separador (40,000)" : "sin separador (40000)"}. Los importes en pesos conservan su formato.
          </FieldDescription>
        </div>
      </Field>
    </section>
  );
}
