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

/** Month names for the caption dropdown: react-day-picker's label can fall back to the month index (0–11). */
const MONTH_NAMES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthName = (index: number) => MONTH_NAMES_ES[index] ?? String(index + 1);

const NAV_START_YEAR = 1900;
const NAV_END_YEAR = 2100;

/* ================================================================== */
/*  Custom Dropdown — shadcn Select replacing native <select>           */
/* ================================================================== */

function ValuationDateDropdown(props: DropdownProps) {
  const { options, value, onChange, "aria-label": ariaLabel } = props;
  // The month dropdown's options are the indexes 0–11; the year dropdown's are years.
  const isMonthDropdown = (options ?? []).every((option) => Number(option.value) >= 0 && Number(option.value) <= 11);
  const optionLabel = (option: { value: string | number; label: string }) =>
    isMonthDropdown && /^\d+$/.test(String(option.label)) ? monthName(Number(option.value)) : option.label;
  const current = (options ?? []).find((option) => String(option.value) === String(value ?? ""));

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
        {/* The trigger shows the option's label, never the raw value (a month index). */}
        <SelectValue>{current ? optionLabel(current) : String(value ?? "")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options?.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value.toString()}
            disabled={option.disabled}
          >
            {optionLabel(option)}
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
            fixedWeeks
            formatters={{ formatMonthDropdown: (date) => monthName(date.getMonth()) }}
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
