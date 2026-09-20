"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PasswordField({
  id,
  name,
  placeholder,
  disabled,
  autoComplete,
  invalid,
  onValueChange,
  value,
}: {
  id: string;
  name: string;
  placeholder: string;
  disabled?: boolean;
  autoComplete?: string;
  invalid?: boolean;
  onValueChange?: (value: string) => void;
  value?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={invalid}
        className="pl-10 pr-10"
        onChange={(event) => onValueChange?.(event.target.value)}
        value={value}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Ocultar contrasena" : "Mostrar contrasena"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}
