"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { EditorConfigPanel } from "@/features/valuations/components/editor/editor-config-panel";
import { type AppSection, type Block, type PhotoGridSettings } from "@/features/valuations/model";
import { fichasInOrder, isComparableFichasBlock, movedTo, photoGridOf, withFichasOrder } from "@/features/valuations/services/photo-layout";
import { cn } from "@/lib/utils";

/** The sizes of a ficha in its cell the panel offers. */
const FICHA_SIZES = [
  { value: 100, title: "Completa" },
  { value: 85, title: "Mediana" },
  { value: 70, title: "Chica" },
] as const;

/**
 * Video 8.14 (27 nov 2026), «Croquis y fotografías de comparables»: «de
 * dónde están estas fotos, qué orden darles, si más grandes, si tres, si
 * dos, no puedo hacer nada». For each market's fichas: their order (drag
 * them, or ↑ ↓), 2 or 3 a row and their size. Every change is a step of
 * the editor's history: Ctrl+Z, or «Deshacer» on its notice, undoes it.
 */
export function ComparableFichasPanel({
  section,
  readOnly,
  onChangeBlock,
  onUndo,
}: {
  section: AppSection;
  readOnly: boolean;
  onChangeBlock: (blockId: string, update: (block: Block) => Block) => void;
  onUndo: () => void;
}) {
  const blocks = section.blocks.filter(isComparableFichasBlock);
  if (!blocks.length) return null;
  return (
    <EditorConfigPanel
      title="Fichas de comparables"
      description="Cada comparable sale como ficha: su foto principal (se elige en su ficha del cálculo, «Foto principal») con su ubicación, precio, superficie y observaciones. Arrastra las fichas para ordenarlas y elige cuántas van por renglón y su tamaño."
    >
      <div className="grid gap-4">
        {blocks.map((block) => (
          <FichasOfBlock key={block.id} block={block} readOnly={readOnly} onChange={(update, message) => {
            onChangeBlock(block.id, update);
            toast.success(message, { action: { label: "Deshacer", onClick: onUndo }, duration: 8_000 });
          }} />
        ))}
      </div>
    </EditorConfigPanel>
  );
}

function FichasOfBlock({ block, readOnly, onChange }: { block: Block; readOnly: boolean; onChange: (update: (block: Block) => Block, message: string) => void }) {
  const fichas = fichasInOrder(block);
  const grid = photoGridOf(block);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= fichas.length) return;
    const ids = movedTo(fichas.map((image) => image.id), from, to);
    onChange((current) => withFichasOrder(current, ids), "Orden de las fichas cambiado");
  };
  const setGrid = (patch: Partial<PhotoGridSettings>, message: string) =>
    onChange((current) => ({ ...current, photoGrid: { ...photoGridOf(current), ...patch } as PhotoGridSettings }), message);
  return (
    <div className="grid gap-2" data-comparable-fichas={block.id}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[13px] font-medium">{block.title}</span>
        <span className="inline-flex items-center gap-1.5">
          <Label htmlFor={`${block.id}-per-row`} className="text-xs text-muted-foreground">
            Por renglón
          </Label>
          <NativeSelect
            id={`${block.id}-per-row`}
            size="sm"
            value={String(grid.perRow)}
            disabled={readOnly}
            onChange={(event) => setGrid({ perRow: event.target.value === "3" ? 3 : 2 }, `Fichas: ${event.target.value} por renglón`)}
          >
            <NativeSelectOption value="2">2 fichas</NativeSelectOption>
            <NativeSelectOption value="3">3 fichas</NativeSelectOption>
          </NativeSelect>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Label htmlFor={`${block.id}-size`} className="text-xs text-muted-foreground">
            Tamaño
          </Label>
          <NativeSelect
            id={`${block.id}-size`}
            size="sm"
            value={String(FICHA_SIZES.find((size) => size.value === grid.size)?.value ?? grid.size)}
            disabled={readOnly}
            onChange={(event) => setGrid({ size: Number(event.target.value) }, "Tamaño de las fichas cambiado")}
          >
            {FICHA_SIZES.map((size) => (
              <NativeSelectOption key={size.value} value={String(size.value)}>
                {size.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </span>
      </div>
      {/* Small cards in the columns of the print (2 or 3), so the order reads as it will print. */}
      <ol
        className={cn("grid max-w-3xl gap-2", grid.perRow === 3 ? "grid-cols-3" : "grid-cols-2 sm:max-w-xl")}
        aria-label={`Orden de las fichas: ${block.title}`}
      >
        {fichas.map((image, index) => {
          const top = image.captions?.find((caption) => caption.position === "top")?.text ?? image.title;
          return (
            <li
              key={image.id}
              draggable={!readOnly}
              onDragStart={(event) => {
                setDragging(index);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                setOver(index);
              }}
              onDragLeave={() => setOver((current) => (current === index ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) move(dragging, index);
                setDragging(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              className={cn(
                "grid gap-1 rounded-md border bg-background p-1.5 text-xs",
                !readOnly && "cursor-grab active:cursor-grabbing",
                over === index && dragging !== index && "border-primary ring-2 ring-primary/40",
                dragging === index && "opacity-60",
              )}
              data-ficha={image.id}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt={image.title} className="aspect-[4/3] w-full rounded-sm object-cover" />
              <div className="flex items-start gap-1">
                <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 line-clamp-2">
                  <span className="font-medium tabular-nums">{index + 1}.</span> {top}
                </span>
                <span className="inline-flex shrink-0 gap-0.5">
                  <Button type="button" size="icon-xs" variant="ghost" disabled={readOnly || index === 0} aria-label={`Subir la ficha ${index + 1}`} onClick={() => move(index, index - 1)}>
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    disabled={readOnly || index === fichas.length - 1}
                    aria-label={`Bajar la ficha ${index + 1}`}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown />
                  </Button>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
