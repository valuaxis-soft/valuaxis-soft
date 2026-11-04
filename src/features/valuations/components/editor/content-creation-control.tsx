"use client";

import type { ChangeEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Columns3, Plus, Rows3 } from "lucide-react";

import type { EditorCapabilities } from "./editor-capabilities";
import { UploadButton } from "./image-upload-control";
import { DOCUMENT_IMAGE_ACCEPT } from "@/features/valuations/services/document-image-upload";

export function ContentCreationControl({
  capabilities,
  conceptControl,
  lock,
  onAddImage,
  onAddTable,
  onAddHomologationTable,
  readOnly,
}: {
  capabilities: {
    concepts?: boolean;
    images?: boolean;
    tables?: boolean;
  };
  conceptControl?: ReactNode;
  /** Why nothing can be added here: the button stays, disabled, and says so. */
  lock?: string;
  onAddImage?: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddTable?: () => void;
  onAddHomologationTable?: () => void;
  readOnly: boolean;
}) {
  const canAddConcept = Boolean(capabilities.concepts && conceptControl);
  const canAddImage = Boolean(capabilities.images && onAddImage);
  const canAddTable = Boolean(capabilities.tables && onAddTable);

  if (lock || (!canAddConcept && !canAddImage && !canAddTable)) {
    return (
      <Button type="button" size="sm" variant="outline" disabled title={lock ?? "Aquí no se agrega contenido."} data-structural-action="add">
        <Plus data-icon="inline-start" />
        Agregar
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="sm" variant="outline" disabled={readOnly} data-structural-action="add">
            <Plus data-icon="inline-start" />
            Agregar
          </Button>
        }
      />
      <PopoverContent align="start" className="w-48 p-2">
        <div className="flex flex-col gap-1">
          {canAddConcept ? conceptControl : null}
          {canAddImage && onAddImage ? (
            <UploadButton
              // Several photos at once (an annex of ten): each becomes its own image, in order.
              accept={DOCUMENT_IMAGE_ACCEPT}
              multiple
              label="Imágenes"
              variant="ghost"
              className="w-full justify-start"
              disabled={readOnly}
              onChange={onAddImage}
            />
          ) : null}
          {canAddTable && onAddTable ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                disabled={readOnly}
                onClick={onAddTable}
              >
                <Columns3 data-icon="inline-start" />
                Tabla
              </Button>
              {onAddHomologationTable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="justify-start"
                  disabled={readOnly}
                  onClick={onAddHomologationTable}
                >
                  <Columns3 data-icon="inline-start" />
                  Tabla Homologación
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** "Agregar" and "Subbloque" of a Block, in every Block: where one does not apply it is disabled and says why. */
export function ActionStrip({
  capabilities,
  conceptControl,
  locks = {},
  onAddImage,
  onAddApartado,
  onAddTable,
  onAddHomologationTable,
  readOnly,
  subBlockLabel,
}: {
  capabilities: Pick<EditorCapabilities, "apartados" | "concepts" | "images" | "tables">;
  conceptControl: ReactNode;
  locks?: { add?: string; subblock?: string };
  onAddImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddApartado: () => void;
  onAddTable: () => void;
  onAddHomologationTable?: () => void;
  readOnly: boolean;
  subBlockLabel: string;
}) {
  const subblockLock = locks.subblock ?? (capabilities.apartados ? undefined : "Este bloque no lleva subbloques.");
  return (
    <div className="flex flex-wrap gap-2" data-block-action-strip>
      <ContentCreationControl
        capabilities={capabilities}
        conceptControl={conceptControl}
        lock={locks.add}
        readOnly={readOnly}
        onAddImage={onAddImage}
        onAddTable={onAddTable}
        onAddHomologationTable={onAddHomologationTable}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={readOnly || Boolean(subblockLock)}
        title={subblockLock}
        data-structural-action="subblock"
        onClick={onAddApartado}
      >
        <Rows3 />
        {subBlockLabel}
      </Button>
    </div>
  );
}