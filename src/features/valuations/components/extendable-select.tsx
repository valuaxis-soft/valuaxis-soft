"use client";

/**
 * A list the firm makes longer, as the units of measure (24 Nov 2026: «quiero
 * agregar esta unidad de medida, y palomita, se agrega»): the choices, and
 * «Otro…» to type a new one; the check keeps it in the firm's list, so every
 * valuation of the firm offers it from then on. Without the check, the name
 * stays only in this valuation.
 */
import { Check, Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { NEW_OWN_CHOICE, type ExtendableChoice } from "@/features/valuations/services/property-kinds";

export function ExtendableSelect({
  id,
  choices,
  value,
  onChange,
  typed,
  onTypedChange,
  onKeep,
  placeholder,
  disabled = false,
  required = false,
  className,
  selectClassName = "w-full",
  inputClassName,
}: {
  id?: string;
  choices: readonly ExtendableChoice[];
  value: string;
  onChange: (value: string) => void;
  /** The name typed with «Otro…». */
  typed: string;
  onTypedChange: (value: string) => void;
  /** Keeps the name typed in the firm's list; resolves to whether it was kept. Without it, there is no check. */
  onKeep?: (name: string) => Promise<boolean>;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
}) {
  const typedId = useId();
  const [keeping, setKeeping] = useState(false);
  const writing = value === NEW_OWN_CHOICE;
  const keep = async () => {
    if (!onKeep || !typed.trim()) return;
    setKeeping(true);
    try {
      await onKeep(typed.trim());
    } finally {
      setKeeping(false);
    }
  };
  return (
    <div className={className}>
      <NativeSelect id={id} className={selectClassName} disabled={disabled} required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        {choices.map((choice) => (
          <NativeSelectOption key={choice.value} value={choice.value}>{choice.label}</NativeSelectOption>
        ))}
      </NativeSelect>
      {writing ? (
        <div className="mt-1.5 grid gap-1.5" data-own-kind-field>
          <FieldLabel htmlFor={typedId}>¿Cuál?</FieldLabel>
          <div className="flex gap-1.5">
            <Input
              id={typedId}
              required={required}
              autoComplete="off"
              maxLength={80}
              placeholder={placeholder}
              className={inputClassName}
              readOnly={disabled}
              value={typed}
              onChange={(event) => onTypedChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && onKeep) {
                  event.preventDefault();
                  void keep();
                }
              }}
            />
            {onKeep && !disabled ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 gap-1 px-2.5 sm:h-9"
                disabled={keeping || !typed.trim()}
                onClick={() => void keep()}
                aria-label="Guardar en la lista del despacho"
                title="Guardar en la lista del despacho"
                data-keep-own-kind
              >
                {keeping ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                <span className="hidden sm:inline">Guardar en la lista</span>
              </Button>
            ) : null}
          </div>
          {onKeep ? <FieldDescription>Con la palomita queda en la lista del despacho para los siguientes avalúos.</FieldDescription> : null}
        </div>
      ) : null}
    </div>
  );
}
