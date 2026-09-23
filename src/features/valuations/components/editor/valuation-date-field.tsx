"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChangeEvent, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { es } from "react-day-picker/locale";
import { type DropdownProps } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { ConceptDateFormat } from "@/features/valuations/model";

/* ================================================================== */
/*  Year range for dropdown navigation (visual only, no validation)     */
/* ================================================================== */

const NAV_START_YEAR = 1900;
const NAV_END_YEAR = 2100;

/* ================================================================== */
/*  Custom Dropdown — shadcn Select replacing native <select>           */
/* ================================================================== */

function ValuationDateDropdown(props: DropdownProps) {
  const { options, value, onChange, "aria-label": ariaLabel } = props;

  const handleValueChange = (newValue: string | null) => {
    if (newValue !== null && onChange) {
      onChange({
        target: { value: newValue },
      } as ChangeEvent<HTMLSelectElement>);
    }
  };

  return (
    <Select value={String(value ?? "")} onValueChange={handleValueChange}>
      <SelectTrigger aria-label={ariaLabel} className="h-8 w-auto min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value.toString()}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ================================================================== */
/*  ValuationDateField                                                 */
/* ================================================================== */

export function ValuationDateField({
  allowClear = false,
  className,
  display = "long",
  label,
  onChange,
  placeholder = "Selecciona una fecha",
  readOnly,
  value,
}: {
  allowClear?: boolean;
  className?: string;
  display?: "long" | "short" | ConceptDateFormat;
  label?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly: boolean;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateInput(value);
  const selectedDateLabel = selectedDate?.toLocaleDateString(
    "es-MX",
    display === "short"
      ? { day: "2-digit", month: "2-digit", year: "numeric" }
      : { day: "numeric", month: "long", year: "numeric" },
  );
  // Capitalize month for "normal" format
  const formattedLabel = display === "normal" && selectedDateLabel
    ? selectedDateLabel.charAt(0).toUpperCase() + selectedDateLabel.slice(1)
    : selectedDateLabel;

  return (
    <Field>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal overflow-hidden min-w-0",
                !selectedDate && "text-muted-foreground",
                className,
              )}
              disabled={readOnly}
            />
          }
        >
          <CalendarIcon className="shrink-0" />
          <span className="min-w-0 truncate">
            {selectedDate ? formattedLabel : placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            locale={es}
            startMonth={new Date(NAV_START_YEAR, 0)}
            endMonth={new Date(NAV_END_YEAR, 11)}
            selected={selectedDate}
            onSelect={(date) => {
              onChange(date ? formatDateInput(date) : "");
              setOpen(false);
            }}
            components={{ Dropdown: ValuationDateDropdown }}
          />
          {allowClear && selectedDate ? (
            <div className="border-t p-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Limpiar fecha
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function parseDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Try YYYY-MM-DD first (local time, no timezone shift)
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymdMatch) {
    const date = new Date(Number(ymdMatch[1]), Number(ymdMatch[2]) - 1, Number(ymdMatch[3]));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  // Try full ISO timestamp — extract date parts to avoid timezone shift
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})T/.exec(trimmed);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  return undefined;
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
