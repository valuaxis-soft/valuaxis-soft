"use client";

/**
 * «Tipo de inmueble» / «Tipo de bien» of a comparable: the list of its class
 * (Valuaxis's kinds and the firm's own), and «Otro», which asks for the name
 * and offers to keep it for the firm with a tick, as the units of measure do
 * (24 Nov 2026). The firm's kinds are read once per page.
 */
import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/lib/api-client";
import type { ComparableClass } from "@/features/valuations/calculation/comparable-classes";
import {
  MAX_KIND_LABEL_LENGTH,
  isOtherKind,
  kindNameKey,
  kindOptions,
  otherKindOf,
  type ComparableKind,
} from "@/features/valuations/calculation/comparable-kinds";

let loaded: Promise<ComparableKind[]> | null = null;
const listeners = new Set<(kinds: ComparableKind[]) => void>();

/** The firm's own kinds, shared by every list of the page; `add` keeps one for the firm and offers it at once. */
export function useFirmComparableKinds() {
  const [kinds, setKinds] = useState<ComparableKind[]>([]);
  useEffect(() => {
    let active = true;
    listeners.add(setKinds);
    loaded ??= api.firm.comparableKinds().then((data) => data.kinds).catch(() => {
      // Without them the lists still offer Valuaxis's kinds; the next list asks again.
      loaded = null;
      return [];
    });
    void loaded.then((next) => { if (active) setKinds(next); });
    return () => { active = false; listeners.delete(setKinds); };
  }, []);
  const add = useCallback(async (label: string, kindClass: ComparableClass): Promise<ComparableKind | null> => {
    try {
      const saved = await api.firm.addComparableKind(label, kindClass);
      loaded = Promise.resolve(saved.kinds);
      for (const listener of listeners) listener(saved.kinds);
      if (saved.kind) toast.success(`«${saved.kind.label}» quedó en la lista de tipos del despacho.`);
      return saved.kind;
    } catch {
      toast.error("No se pudo guardar el tipo. Intenta de nuevo.");
      return null;
    }
  }, []);
  return { kinds, add };
}

export type KindDraft = { key: string; label: string };

/** «Tipo de inmueble» for real estate, «Tipo de bien» for machinery and equipment. */
export const kindFieldLabel = (kindClass: ComparableClass) => (kindClass === "MAQUINARIA" ? "Tipo de bien" : "Tipo de inmueble");

export function ComparableKindField(props: {
  id: string;
  kindClass: ComparableClass;
  value: KindDraft;
  onChange: (next: KindDraft) => void;
  disabled?: boolean;
  /** An empty choice («Cualquiera» in a filter, «Sin especificar» in the card). */
  emptyLabel?: string;
  /** In a filter there is nothing to write: «Otro» is a choice like the others. */
  filter?: boolean;
}) {
  const { kinds, add } = useFirmComparableKinds();
  const options = kindOptions(props.kindClass, kinds);
  // A kind of the firm it no longer lists (or of another class) still shows as chosen.
  const known = !props.value.key || options.some((kind) => kind.key === props.value.key);
  const other = isOtherKind(props.value.key);
  const typed = props.value.label.trim();
  const listed = typed ? options.find((kind) => kindNameKey(kind.label) === kindNameKey(typed) && !isOtherKind(kind.key)) : undefined;
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!typed) return;
    if (listed) { props.onChange({ key: listed.key, label: listed.label }); return; }
    setSaving(true);
    const kept = await add(typed, props.kindClass);
    setSaving(false);
    if (kept) props.onChange({ key: kept.key, label: kept.label });
  };

  return (
    <div className="grid gap-1.5" data-comparable-kind={props.kindClass}>
      <NativeSelect
        id={props.id}
        className="w-full"
        disabled={props.disabled}
        value={props.value.key}
        onChange={(event) => {
          const key = event.target.value;
          const kind = options.find((item) => item.key === key);
          props.onChange({ key, label: kind && !isOtherKind(kind.key) ? kind.label : "" });
        }}
      >
        <NativeSelectOption value="">{props.emptyLabel ?? "Sin especificar"}</NativeSelectOption>
        {!known ? <NativeSelectOption value={props.value.key}>{props.value.label || "Tipo anterior"}</NativeSelectOption> : null}
        {options.map((kind) => (
          <NativeSelectOption key={kind.key} value={kind.key}>{isOtherKind(kind.key) ? "Otro…" : kind.label}</NativeSelectOption>
        ))}
      </NativeSelect>
      {other && !props.filter ? (
        <div className="grid gap-1">
          <div className="flex items-center gap-1">
            <Input
              aria-label={`¿Qué ${props.kindClass === "MAQUINARIA" ? "bien" : "inmueble"} es?`}
              autoComplete="off"
              className="h-8"
              disabled={props.disabled}
              maxLength={MAX_KIND_LABEL_LENGTH}
              placeholder={props.kindClass === "MAQUINARIA" ? "Retroexcavadora, tractor, avión…" : "Granja, hotel, salón de eventos…"}
              value={props.value.label}
              onChange={(event) => props.onChange({ key: otherKindOf(props.kindClass), label: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && typed) {
                  event.preventDefault();
                  void confirm();
                }
              }}
            />
            {/* Ticking keeps the kind for the firm: every list of comparables offers it from then on. */}
            <Button
              type="button"
              size="icon-sm"
              variant={typed ? "default" : "ghost"}
              aria-label="Agregar a la lista del despacho"
              title="Agregar a la lista de tipos del despacho"
              disabled={props.disabled || !typed || saving}
              onClick={() => void confirm()}
            >
              <Check />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {listed ? `Ya está en la lista: «${listed.label}».` : "Escribe el tipo y confírmalo para que aparezca en la lista del despacho; sin confirmar, se guarda solo en esta ficha."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
