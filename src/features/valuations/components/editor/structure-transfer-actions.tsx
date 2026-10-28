"use client";

import { useState } from "react";
import { ClipboardPaste, Copy, CopyPlus, Ellipsis, FolderInput, MoveRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Apartado, AppSection, Block } from "@/features/valuations/model";
import {
  apartadoDestinations,
  blockDestinationSections,
  conceptDestinations,
  structureLockReason,
  type ContainerAddress,
  type TransferDestination,
} from "@/features/valuations/services/structure-transfer";
import { sectionDisplayName } from "../workspace/model/section-numbering";
import { useStructureTransfer } from "../workspace/structure-transfer-context";

type PickerOption = { key: string; group: string; label: string; detail?: string; onPick: () => void };

const destinationKey = (address: ContainerAddress) => `${address.sectionId}/${address.blockId}/${address.apartadoId ?? ""}`;

/** A list of places to choose one from, grouped by section, with a filter for long documents. */
function DestinationPicker({
  open,
  onOpenChange,
  title,
  description,
  options,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  options: PickerOption[];
}) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const shown = needle ? options.filter((option) => `${option.group} ${option.label} ${option.detail ?? ""}`.toLowerCase().includes(needle)) : options;
  const groups = [...new Set(shown.map((option) => option.group))];
  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setFilter(""); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {options.length > 8 ? (
          <Input aria-label="Buscar destino" placeholder="Buscar sección, bloque o apartado" value={filter} onChange={(event) => setFilter(event.target.value)} />
        ) : null}
        <div className="grid max-h-[50vh] gap-3 overflow-y-auto" data-destination-picker>
          {groups.length ? groups.map((group) => (
            <div key={group} className="grid gap-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">{group}</p>
              {shown.filter((option) => option.group === group).map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                  onClick={() => { option.onPick(); onOpenChange(false); setFilter(""); }}
                >
                  <span className="flex flex-col items-start">
                    <span>{option.label}</span>
                    {option.detail ? <span className="text-xs text-muted-foreground">{option.detail}</span> : null}
                  </span>
                </Button>
              ))}
            </div>
          )) : <p className="text-sm text-muted-foreground">No hay otro lugar donde ponerlo.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const containerOptions = (destinations: TransferDestination[], onPick: (address: ContainerAddress) => void): PickerOption[] =>
  destinations.map((destination) => ({
    key: destinationKey(destination.address),
    group: destination.sectionTitle,
    label: destination.apartadoTitle ? `${destination.blockTitle} › ${destination.apartadoTitle}` : destination.blockTitle,
    detail: destination.apartadoTitle ? "Apartado" : "Bloque",
    onPick: () => onPick(destination.address),
  }));

/** "Mover a…" of the concepts chosen in a Block or Apartado. */
export function MoveConceptsButton({ source, conceptIds, onMoved }: { source: ContainerAddress; conceptIds: string[]; onMoved: () => void }) {
  const transfer = useStructureTransfer();
  const [open, setOpen] = useState(false);
  if (!transfer) return null;
  const options = open
    ? containerOptions(conceptDestinations(transfer.sections, source), (destination) => {
        if (transfer.moveConcepts(source, conceptIds, destination)) onMoved();
      })
    : [];
  return (
    <>
      <Button type="button" size="xs" variant="outline" disabled={transfer.readOnly || !conceptIds.length} onClick={() => setOpen(true)}>
        <MoveRight data-icon="inline-start" />
        Mover a…
      </Button>
      <DestinationPicker
        open={open}
        onOpenChange={setOpen}
        title={conceptIds.length === 1 ? "Mover el concepto" : `Mover ${conceptIds.length} conceptos`}
        description="Van al final del bloque o apartado que elijas, en el mismo orden y con los que comparten renglón juntos."
        options={options}
      />
    </>
  );
}

function TransferMenu({ label, lock, onCopy, onDuplicate, onMove, moveLabel }: {
  label: string;
  lock: string | null;
  onCopy: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  moveLabel: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size="icon-sm" variant="outline" aria-label={`Copiar o mover ${label}`} title={lock ?? `Copiar, duplicar o mover ${label}`}>
            <Ellipsis />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem disabled={Boolean(lock)} onClick={onCopy}>
          <Copy />
          Copiar
        </DropdownMenuItem>
        <DropdownMenuItem disabled={Boolean(lock)} onClick={onDuplicate}>
          <CopyPlus />
          Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem disabled={Boolean(lock)} onClick={onMove}>
          <FolderInput />
          {moveLabel}
        </DropdownMenuItem>
        {lock ? <p className="px-1.5 py-1 text-xs text-muted-foreground">{lock}</p> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Copiar, Duplicar and "Mover a otra sección…" of a Block. */
export function BlockTransferMenu({ section, block, label }: { section: AppSection; block: Block; label: string }) {
  const transfer = useStructureTransfer();
  const [moving, setMoving] = useState(false);
  if (!transfer || transfer.readOnly) return null;
  const options: PickerOption[] = moving
    ? blockDestinationSections(transfer.sections, section.id).map((destination) => ({
        key: destination.id,
        group: "Secciones",
        label: sectionDisplayName(destination),
        onPick: () => transfer.moveBlock(section.id, block.id, destination.id),
      }))
    : [];
  return (
    <>
      <TransferMenu
        label={label}
        lock={structureLockReason(section, block.id)}
        onCopy={() => transfer.copyBlock(block)}
        onDuplicate={() => transfer.duplicateBlock(section.id, block.id)}
        onMove={() => setMoving(true)}
        moveLabel="Mover a otra sección…"
      />
      <DestinationPicker
        open={moving}
        onOpenChange={setMoving}
        title={`Mover ${label} a otra sección`}
        description="Va al final de la sección que elijas, con todo lo que tiene."
        options={options}
      />
    </>
  );
}

/** Copiar, Duplicar and "Mover a…" of an Apartado. */
export function ApartadoTransferMenu({ section, block, apartado, label }: { section: AppSection; block: Block; apartado: Apartado; label: string }) {
  const transfer = useStructureTransfer();
  const [moving, setMoving] = useState(false);
  if (!transfer || transfer.readOnly) return null;
  const source = { sectionId: section.id, blockId: block.id, apartadoId: apartado.id };
  const options = moving
    ? containerOptions(apartadoDestinations(transfer.sections, source), (destination) => transfer.moveApartado(source, destination))
    : [];
  return (
    <>
      <TransferMenu
        label={label}
        lock={structureLockReason(section, block.id)}
        onCopy={() => transfer.copyApartado(apartado)}
        onDuplicate={() => transfer.duplicateApartado(section.id, block.id, apartado.id)}
        onMove={() => setMoving(true)}
        moveLabel="Mover a…"
      />
      <DestinationPicker
        open={moving}
        onOpenChange={setMoving}
        title={`Mover ${label}`}
        description="Va al final del bloque que elijas, en esta sección o en otra."
        options={options}
      />
    </>
  );
}

/** "Pegar bloque" in a section's list of Blocks, once one was copied. */
export function PasteBlockButton({ section }: { section: AppSection }) {
  const transfer = useStructureTransfer();
  if (!transfer || transfer.readOnly || transfer.clipboard?.kind !== "block" || section.id === "caratula") return null;
  return (
    <Button type="button" size="sm" variant="outline" title={`Pegar una copia de ${transfer.clipboard.label}`} onClick={() => transfer.pasteBlock(section.id)}>
      <ClipboardPaste data-icon="inline-start" />
      Pegar bloque
    </Button>
  );
}

/** "Pegar subbloque" inside a Block, once one was copied. */
export function PasteApartadoButton({ section, block }: { section: AppSection; block: Block }) {
  const transfer = useStructureTransfer();
  if (!transfer || transfer.readOnly || transfer.clipboard?.kind !== "apartado" || structureLockReason(section, block.id)) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      title={`Pegar una copia de ${transfer.clipboard.label}`}
      onClick={() => transfer.pasteApartado({ sectionId: section.id, blockId: block.id })}
    >
      <ClipboardPaste data-icon="inline-start" />
      Pegar subbloque
    </Button>
  );
}
