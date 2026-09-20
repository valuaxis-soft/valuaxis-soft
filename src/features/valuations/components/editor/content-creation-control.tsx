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

export function ContentCreationControl({
  capabilities,
  conceptControl,
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
  onAddImage?: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddTable?: () => void;
  onAddHomologationTable?: () => void;
  readOnly: boolean;
}) {
  const canAddConcept = Boolean(capabilities.concepts && conceptControl);
  const canAddImage = Boolean(capabilities.images && onAddImage);
  const canAddTable = Boolean(capabilities.tables && onAddTable);

  if (!canAddConcept && !canAddImage && !canAddTable) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="sm" variant="outline" disabled={readOnly}>
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
              label="Imagen"
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

export function ActionStrip({
  capabilities,
  conceptControl,
  onAddImage,
  onAddApartado,
  onAddTable,
  onAddHomologationTable,
  readOnly,
  subBlockLabel,
}: {
  capabilities: Pick<EditorCapabilities, "apartados" | "concepts" | "images" | "tables">;
  conceptControl: ReactNode;
  onAddImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddApartado: () => void;
  onAddTable: () => void;
  onAddHomologationTable?: () => void;
  readOnly: boolean;
  subBlockLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ContentCreationControl
        capabilities={capabilities}
        conceptControl={conceptControl}
        readOnly={readOnly}
        onAddImage={onAddImage}
        onAddTable={onAddTable}
        onAddHomologationTable={onAddHomologationTable}
      />
      {capabilities.apartados ? (
        <Button type="button" size="sm" variant="outline" disabled={readOnly} onClick={onAddApartado}>
          <Rows3 />
          {subBlockLabel}
        </Button>
      ) : null}
    </div>
  );
}