"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import type { AppSection } from "@/features/valuations/model";
import type { CalculationPrecision } from "@/features/valuations/calculation/calculation-precision";
import { CalculationPrecisionControl } from "../calculation/calculation-precision-control";
import { EditorConfigPanel } from "./editor-config-panel";
import { DocumentNumberFormatControl } from "./number-format-control";
import { DocumentPageFormatControl } from "./page-format-control";

/**
 * "Configuración del avalúo", at the top of the carátula: the choices that
 * shape the whole document (thousands separator, binding margin, title bars
 * and band) and the precision of the calculation, set apart from the
 * carátula's content, which prints.
 */
export function ValuationSettingsPanel({
  section,
  readOnly,
  valuationId,
  onUpdateSection,
}: {
  section: AppSection;
  readOnly: boolean;
  valuationId?: string | null;
  onUpdateSection: (sectionId: string, patch: Partial<AppSection>) => void;
}) {
  return (
    <EditorConfigPanel
      title="Configuración del avalúo"
      description="Se aplica a todo el documento. Lo que capturas abajo, en la carátula, es lo que se imprime."
    >
      <DocumentNumberFormatControl section={section} readOnly={readOnly} onUpdateSection={onUpdateSection} />
      <DocumentPageFormatControl section={section} readOnly={readOnly} onUpdateSection={onUpdateSection} />
      {valuationId ? <PrecisionAccess valuationId={valuationId} readOnly={readOnly} /> : null}
    </EditorConfigPanel>
  );
}

/** The precision of the calculation, the same control the calculation panels show. */
function PrecisionAccess({ valuationId, readOnly }: { valuationId: string; readOnly: boolean }) {
  const [precision, setPrecision] = useState<(CalculationPrecision & { locked: boolean }) | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    api.precision.get(valuationId)
      .then((next) => { if (active) setPrecision(next); })
      .catch(() => { if (active) setPrecision(null); });
    return () => { active = false; };
  }, [valuationId, version]);
  if (!precision) return null;
  return (
    <CalculationPrecisionControl
      valuationId={valuationId}
      precision={precision}
      readOnly={readOnly || precision.locked}
      onChanged={() => setVersion((current) => current + 1)}
    />
  );
}
