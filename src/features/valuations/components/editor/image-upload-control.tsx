"use client";

import type { ChangeEvent } from "react";

import { FieldLabel } from "@/components/ui/field";
import { buttonVariants } from "@/components/ui/button";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

export function UploadButton({
  accept = "image/*",
  className,
  disabled = false,
  label,
  onChange,
  variant = "outline",
}: {
  accept?: string;
  className?: string;
  disabled?: boolean;
  label: string;
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
        onChange={onChange}
      />
    </FieldLabel>
  );
}