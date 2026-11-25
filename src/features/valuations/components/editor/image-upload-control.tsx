"use client";

import type { ChangeEvent } from "react";

import { FieldLabel } from "@/components/ui/field";
import { buttonVariants } from "@/components/ui/button";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { remindImageRights } from "../legal-notice";

export function UploadButton({
  accept = "image/*",
  className,
  disabled = false,
  label,
  multiple = false,
  onChange,
  variant = "outline",
}: {
  accept?: string;
  className?: string;
  disabled?: boolean;
  label: string;
  /** Several files can be chosen at once. */
  multiple?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  variant?: "ghost" | "outline";
}) {
  return (
    <FieldLabel
      className={cn(
        buttonVariants({ size: "sm", variant }),
        disabled ? "pointer-events-none opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <ImagePlus />
      {label}
      <input
        className="sr-only"
        type="file"
        accept={accept}
        disabled={disabled}
        multiple={multiple || undefined}
        onChange={(event) => {
          // Matrix 1.5, «Fotografías y textos»: each upload reminds that the image must be the appraiser's to use.
          if (event.target.files?.length) remindImageRights();
          onChange(event);
        }}
      />
    </FieldLabel>
  );
}