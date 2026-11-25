"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { ADULT_DECLARATION_TEXT, TERMS_BOX_SEGMENTS } from "../consent-rules";
import { legalDocumentHref, type LegalDocumentKey } from "../legal-documents";

/**
 * The boxes of the simplified notice, Part II, and casilla T (matrix 1.1 and
 * 2): each one apart, none ticked when the page loads, the texts quoted from
 * the version shown. Casillas 2 to 4 are optional and separate.
 */

export type ConsentBoxState = {
  adult: boolean;
  privacy: boolean;
  terms: boolean;
  commercial: boolean;
  newsletter: boolean;
  statistics: boolean;
};

export const EMPTY_CONSENT_BOXES: ConsentBoxState = { adult: false, privacy: false, terms: false, commercial: false, newsletter: false, statistics: false };

/** The version each link opens; a draft says so. */
export type ConsentLinks = Partial<Record<LegalDocumentKey, { version: number; published: boolean }>>;

function DocumentLink({ document, label, links }: { document: LegalDocumentKey; label: string; links: ConsentLinks }) {
  const target = links[document];
  return (
    <a
      href={target ? legalDocumentHref(document, target.version) : legalDocumentHref(document)}
      target="_blank"
      rel="noopener"
      data-legal-link={document}
      className="font-medium text-brand underline underline-offset-2"
    >
      {label}
      {target && !target.published ? " (borrador)" : null}
    </a>
  );
}

function Box({
  name,
  checked,
  onChange,
  disabled,
  error,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <Field data-invalid={Boolean(error)} orientation="horizontal" className="items-start">
      <Checkbox
        id={name}
        name={name}
        checked={checked}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        onCheckedChange={(value) => onChange(Boolean(value))}
        className="mt-0.5"
      />
      <div className="grid gap-1">
        <FieldLabel htmlFor={name} className="block font-normal leading-snug">
          {children}
        </FieldLabel>
        <FieldError>{error}</FieldError>
      </div>
    </Field>
  );
}

export function ConsentCheckboxes({
  boxTexts,
  links,
  state,
  onChange,
  disabled,
  errors,
  showAdult = true,
  showOptional = true,
}: {
  boxTexts: Record<1 | 2 | 3 | 4, string>;
  links: ConsentLinks;
  state: ConsentBoxState;
  onChange: (next: ConsentBoxState) => void;
  disabled?: boolean;
  errors?: Record<string, string[] | undefined>;
  showAdult?: boolean;
  showOptional?: boolean;
}) {
  const set = (key: keyof ConsentBoxState) => (checked: boolean) => onChange({ ...state, [key]: checked });
  return (
    <div className="grid gap-4" data-consent-boxes="">
      {showAdult ? (
        <Box name="adultDeclaration" checked={state.adult} onChange={set("adult")} disabled={disabled} error={errors?.adultDeclaration?.[0]}>
          {ADULT_DECLARATION_TEXT}
        </Box>
      ) : null}
      <Box name="consentPrivacy" checked={state.privacy} onChange={set("privacy")} disabled={disabled} error={errors?.consentPrivacy?.[0]}>
        {boxTexts[1]}{" "}
        <span className="text-muted-foreground">
          (<DocumentLink document="privacidad-integral" label="Aviso de privacidad integral" links={links} />)
        </span>
      </Box>
      <Box name="consentTerms" checked={state.terms} onChange={set("terms")} disabled={disabled} error={errors?.consentTerms?.[0]}>
        {TERMS_BOX_SEGMENTS.map((segment, index) =>
          typeof segment === "string" ? segment : <DocumentLink key={index} document={segment.document} label={segment.label} links={links} />,
        )}
      </Box>
      {showOptional ? (
        <fieldset className="grid gap-3 rounded-lg border border-dashed p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Opcionales: puedes cambiarlas cuando quieras en «Mi cuenta» → «Privacidad»</legend>
          <Box name="consentCommercial" checked={state.commercial} onChange={set("commercial")} disabled={disabled}>
            {boxTexts[2]}
          </Box>
          <Box name="consentNewsletter" checked={state.newsletter} onChange={set("newsletter")} disabled={disabled}>
            {boxTexts[3]}
          </Box>
          <Box name="consentStatistics" checked={state.statistics} onChange={set("statistics")} disabled={disabled}>
            {boxTexts[4]}
          </Box>
        </fieldset>
      ) : null}
    </div>
  );
}

/** Casillas 1 and T (and the age, when asked) ticked: the only state in which the button accepts. */
export const requiredBoxesTicked = (state: ConsentBoxState, askAdult = true) => state.privacy && state.terms && (!askAdult || state.adult);
