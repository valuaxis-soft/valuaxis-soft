"use client";

import { GripVertical, Loader2, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { CustomFactor } from "@/features/firm/custom-factors";
import {
  FACTOR_TYPES,
  FACTOR_TYPE_LABELS,
  MAX_FACTOR_SLOTS,
  factorKey,
  type FactorSlotConfig,
  type FactorType,
} from "@/features/valuations/calculation/market-types";
import { cn } from "@/lib/utils";

const CREATE = "__crear";
const customValue = (key: string) => `firma:${key}`;

/** The slots with the one at `from` placed at `to`: the comparables' values follow, they are kept by factor. */
export function moveSlot(slots: FactorSlotConfig[], from: number, to: number) {
  if (from === to || to < 0 || to >= slots.length) return slots;
  const next = [...slots];
  const [slot] = next.splice(from, 1);
  next.splice(to, 0, slot);
  return next;
}

/**
 * The factors of the homologation, in multiplication order: dragged (or moved
 * with Alt + arrows) to reorder them, removed, or added from the list, which
 * offers the catalog's factors and those the firm created; "Crear factor…"
 * adds a new one to the firm's list and to this homologation.
 */
export function MarketFactorSlots(props: {
  slots: FactorSlotConfig[];
  customFactors: CustomFactor[];
  readOnly: boolean;
  saving: boolean;
  onChange: (slots: FactorSlotConfig[]) => void;
  onCreate: (label: string) => Promise<CustomFactor | null>;
}) {
  const { slots, readOnly } = props;
  const [dragged, setDragged] = useState<number | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = slots.length >= MAX_FACTOR_SLOTS;
  const used = new Set(slots.map(factorKey));
  const available = FACTOR_TYPES.filter((type) => !used.has(type));
  const firmFactors = props.customFactors.filter((factor) => !used.has(factor.key));

  const add = (value: string) => {
    if (value === CREATE) {
      setCreating("");
      return;
    }
    const own = props.customFactors.find((factor) => customValue(factor.key) === value);
    if (own) props.onChange([...slots, { type: "OTRO", key: own.key, label: own.label }]);
    else if (value) props.onChange([...slots, { type: value as FactorType, label: FACTOR_TYPE_LABELS[value as FactorType] }]);
  };
  const create = async () => {
    if (!creating?.trim()) return;
    setBusy(true);
    const factor = await props.onCreate(creating);
    setBusy(false);
    if (!factor) return;
    setCreating(null);
    if (!used.has(factor.key)) props.onChange([...slots, { type: "OTRO", key: factor.key, label: factor.label }]);
  };
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLElement>) => {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    props.onChange(moveSlot(slots, index, index + (event.key === "ArrowLeft" ? -1 : 1)));
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Factores, en orden de multiplicación:</span>
        {slots.map((slot, index) => (
          <span
            key={factorKey(slot)}
            tabIndex={readOnly ? undefined : 0}
            draggable={!readOnly}
            title={readOnly ? undefined : "Arrastra para cambiar el orden (o Alt + flechas)"}
            onKeyDown={onKeyDown(index)}
            onDragStart={() => setDragged(index)}
            onDragEnd={() => setDragged(null)}
            onDragOver={(event) => { if (dragged !== null) event.preventDefault(); }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged !== null) props.onChange(moveSlot(slots, dragged, index));
              setDragged(null);
            }}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              slot.type === "SUPERFICIE" ? "bg-secondary" : "bg-background",
              !readOnly && "cursor-grab",
              dragged === index && "opacity-50",
            )}
          >
            {!readOnly ? <GripVertical className="size-3 text-muted-foreground" aria-hidden /> : null}
            {slot.label}
            {slot.type !== "SUPERFICIE" && !readOnly ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Quitar el factor ${slot.label}`}
                onClick={() => props.onChange(slots.filter((item) => factorKey(item) !== factorKey(slot)))}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
        {!readOnly && !full && creating === null ? (
          <NativeSelect size="sm" aria-label="Agregar factor" value="" onChange={(event) => add(event.target.value)}>
            <NativeSelectOption value="">Agregar factor…</NativeSelectOption>
            {available.map((type) => <NativeSelectOption key={type} value={type}>{FACTOR_TYPE_LABELS[type]}</NativeSelectOption>)}
            {firmFactors.map((factor) => <NativeSelectOption key={factor.key} value={customValue(factor.key)}>{factor.label} (del despacho)</NativeSelectOption>)}
            <NativeSelectOption value={CREATE}>Crear factor…</NativeSelectOption>
          </NativeSelect>
        ) : null}
        {full && !readOnly ? (
          <span className="text-muted-foreground">Hasta {MAX_FACTOR_SLOTS} factores (sin contar el FRe): quita uno para agregar otro.</span>
        ) : null}
        {props.saving ? <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="Guardando" /> : null}
      </div>
      {creating !== null ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => { event.preventDefault(); void create(); }}
        >
          <Input
            autoFocus
            aria-label="Nombre del factor nuevo"
            className="h-8 w-56"
            maxLength={40}
            placeholder="Nombre del factor, p. ej. Vista"
            value={creating}
            onChange={(event) => setCreating(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={busy || !creating.trim()}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Crear y agregar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(null)}>Cancelar</Button>
          <span className="text-xs text-muted-foreground">Queda en la lista del despacho para usarlo en otros avalúos.</span>
        </form>
      ) : null}
    </div>
  );
}
