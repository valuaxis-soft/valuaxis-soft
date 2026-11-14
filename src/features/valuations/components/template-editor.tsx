"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import type { AutosaveSeconds } from "@/features/account/user-preferences";
import type { AuthUser } from "@/features/auth/model";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { AppSection, Letterhead } from "../model";
import type { CatalogOption } from "../services/valuation-catalogs.service";
import type { ValuationTemplateDetail, ValuationTemplateSummary } from "../services/valuation-template.service";
import { appliesToLabel, TemplateDetailsDialog } from "./template-details-dialog";
import { ValuationWorkspace } from "./workspace/valuation-workspace";

/**
 * «Nueva plantilla» / «Editar plantilla»: the valuation editor on a template
 * of the firm. The first save of the session adds a version of the template,
 * the next ones (autosave included) change that version; «Datos de la
 * plantilla» changes its name, notes and what it is meant for.
 */
export function TemplateEditor(props: {
  currentUser: AuthUser;
  template: ValuationTemplateDetail;
  letterhead: Letterhead;
  customUnits: string[];
  autosaveSeconds: AutosaveSeconds;
  appraisalTypes: CatalogOption[];
  propertyTypes: CatalogOption[];
  /** Just created with «Nueva plantilla»: its saves complete version 1 instead of adding version 2. */
  justCreated?: boolean;
}) {
  const [summary, setSummary] = useState<ValuationTemplateSummary>(props.template);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The version this editor opened, then the one it saved; whether this session already added one.
  const version = useRef(props.template.version);
  const sameSession = useRef(props.justCreated === true);

  const save = async (sections: AppSection[]) => {
    const saved = await api.templates.saveDocument(summary.id, { sections, version: version.current, sameSession: sameSession.current });
    version.current = saved.version;
    sameSession.current = true;
    setSummary(saved);
  };

  const saveDetails = async (details: { name: string; description: string | null; appraisalTypeId: number; propertyTypeId: number | null }) => {
    try {
      setSummary(await api.templates.update(summary.id, details));
      toast.success("Datos de la plantilla guardados.");
      return true;
    } catch (error) {
      toast.error(error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudieron guardar los datos.");
      return false;
    }
  };

  return (
    <>
      <ValuationWorkspace
        currentUser={props.currentUser}
        letterhead={props.letterhead}
        customUnits={props.customUnits}
        autosaveSeconds={props.autosaveSeconds}
        valuationId={null}
        initialValuation={null}
        template={{
          id: summary.id,
          name: summary.name,
          appliesTo: appliesToLabel(summary.appraisalType.name, summary.propertyType?.name),
          sections: props.template.content.sections,
          save,
          onEditDetails: () => setDetailsOpen(true),
        }}
      />
      <TemplateDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title="Datos de la plantilla"
        intro="El nombre con que aparece en «Plantilla base» e «Importar», para qué avalúos es y sus notas. La estructura se edita en el editor."
        submitLabel="Guardar datos"
        initial={{
          name: summary.name,
          description: summary.description,
          appraisalTypeId: summary.appraisalType.id,
          propertyTypeId: summary.propertyType?.id ?? null,
        }}
        appraisalTypes={props.appraisalTypes}
        propertyTypes={props.propertyTypes}
        onSubmit={saveDetails}
      />
    </>
  );
}
