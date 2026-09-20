import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { Calendar } from "../src/components/ui/calendar";
import { ValuationDateField } from "../src/features/valuations/components/editor/valuation-date-field";
import { es } from "react-day-picker/locale";

/* ================================================================== */
/*  Test helpers                                                       */
/* ================================================================== */

function renderCalendar(extraProps: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(Calendar, {
      mode: "single",
      locale: es,
      ...extraProps,
    }),
  );
}

function renderDateField(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(ValuationDateField, {
      value: "",
      readOnly: false,
      onChange: () => {},
      ...props,
    }),
  );
}

/* ================================================================== */
/*  GROUP 1 — Existing contract: parseDateInput / formatDateInput       */
/* ================================================================== */

test("parseDateInput: YYYY-MM-DD returns correct Date", () => {
  const html = renderDateField({ value: "2024-02-12", display: "short" });
  assert.ok(html.includes("12"), `Expected day 12 in rendered output: ${html}`);
});

test("formatDateInput: empty value shows placeholder", () => {
  const html = renderDateField({ value: "" });
  assert.ok(
    html.includes("Selecciona una fecha"),
    `Expected placeholder text: ${html}`,
  );
});

/* ================================================================== */
/*  GROUP 2 — Contract: value is string, onChange emits string          */
/* ================================================================== */

test("ValuationDateField accepts value as string", () => {
  const html = renderDateField({ value: "2025-06-15" });
  assert.ok(html.length > 0, "Component should render with string value");
});

test("ValuationDateField with empty string value renders placeholder", () => {
  const html = renderDateField({ value: "" });
  assert.ok(
    html.includes("Selecciona una fecha"),
    "Empty value should show placeholder",
  );
});

/* ================================================================== */
/*  GROUP 3 — Contract: readOnly prevents interaction                   */
/* ================================================================== */

test("ValuationDateField: readOnly disables the trigger button", () => {
  const html = renderDateField({ value: "2024-03-10", readOnly: true });
  assert.ok(
    html.includes("disabled"),
    "readOnly should render a disabled button",
  );
});

/* ================================================================== */
/*  GROUP 4 — Contract: locale is Spanish                               */
/* ================================================================== */

test("Calendar with es locale renders Spanish month names", () => {
  const html = renderCalendar({ defaultMonth: new Date(2024, 0) });
  assert.ok(
    html.includes("enero") || html.includes("Ene"),
    `Expected Spanish month name for January: ${html}`,
  );
});

/* ================================================================== */
/*  GROUP 5 — Contract: display short/long                              */
/* ================================================================== */

test("ValuationDateField: display=short formats date concisely", () => {
  const html = renderDateField({ value: "2024-02-12", display: "short" });
  assert.ok(html.includes("12"), `Short format should show day 12: ${html}`);
});

test("ValuationDateField: display=long formats date verbosely", () => {
  const html = renderDateField({ value: "2024-02-12", display: "long" });
  assert.ok(html.includes("12"), `Long format should show day 12: ${html}`);
});

/* ================================================================== */
/*  GROUP 6 — Custom Dropdown (no native <select>)                      */
/* ================================================================== */

test("Calendar with captionLayout=dropdown renders native <select> by default", () => {
  // Without a custom Dropdown, Calendar uses native <select> — this is expected.
  // Our custom Dropdown replaces it ONLY when passed via components prop.
  const html = renderCalendar({ captionLayout: "dropdown" });
  assert.ok(
    html.includes("<select"),
    "Default Calendar with captionLayout=dropdown should render native <select>",
  );
});

test("Calendar without captionLayout dropdown does NOT render selects", () => {
  const html = renderCalendar();
  assert.ok(
    !html.includes("<select"),
    `Calendar with default captionLayout="label" should NOT render <select>: ${html.substring(0, 500)}`,
  );
});

test("ValuationDateField source: uses custom Dropdown component", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(
    "src/features/valuations/components/editor/valuation-date-field.tsx",
    "utf8",
  );
  assert.ok(
    src.includes('captionLayout="dropdown"'),
    "ValuationDateField must pass captionLayout=\"dropdown\" to Calendar",
  );
  assert.ok(
    src.includes("components={{") && src.includes("Dropdown:"),
    "ValuationDateField must pass a custom Dropdown component via Calendar components prop",
  );
});

test("ValuationDateField source: Dropdown uses shadcn Select (not native <select>)", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(
    "src/features/valuations/components/editor/valuation-date-field.tsx",
    "utf8",
  );
  assert.ok(
    src.includes("SelectTrigger") && src.includes("SelectContent") && src.includes("SelectItem"),
    "Custom Dropdown must use SelectTrigger, SelectContent, SelectItem from shadcn Select",
  );
  assert.ok(
    src.includes("ValuationDateDropdown"),
    "Must define a ValuationDateDropdown component",
  );
});

/* ================================================================== */
/*  GROUP 7 — Text truncation (overflow prevention)                     */
/* ================================================================== */

test("ValuationDateField trigger button has overflow-hidden for truncation", () => {
  const html = renderDateField({ value: "2024-06-15" });
  assert.ok(
    html.includes("overflow-hidden"),
    "Trigger button must have overflow-hidden to prevent text overflow",
  );
});

test("ValuationDateField trigger button has min-w-0 for flex shrinking", () => {
  const html = renderDateField({ value: "2024-06-15" });
  assert.ok(
    html.includes("min-w-0"),
    "Trigger button must have min-w-0 to allow shrinking in flex/grid",
  );
});

test("ValuationDateField trigger text is wrapped in truncation element", () => {
  const html = renderDateField({ value: "2024-06-15" });
  assert.ok(
    html.includes("truncate"),
    "Date text must be inside an element with truncate class",
  );
});

test("ValuationDateField CalendarIcon has shrink-0 to prevent compression", () => {
  const html = renderDateField({ value: "2024-06-15" });
  // CalendarIcon is an SVG rendered by lucide-react
  assert.ok(
    html.includes("shrink-0"),
    "CalendarIcon must have shrink-0 to prevent compression",
  );
});

/* ================================================================== */
/*  GROUP 8 — Year range (startMonth / endMonth)                         */
/* ================================================================== */

test("ValuationDateField source: has startMonth and endMonth for navigation range", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(
    "src/features/valuations/components/editor/valuation-date-field.tsx",
    "utf8",
  );
  assert.ok(
    src.includes("startMonth"),
    "ValuationDateField must set startMonth on Calendar for dropdown navigation",
  );
  assert.ok(
    src.includes("endMonth"),
    "ValuationDateField must set endMonth on Calendar for dropdown navigation",
  );
});

test("ValuationDateField source: year range includes future dates", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(
    "src/features/valuations/components/editor/valuation-date-field.tsx",
    "utf8",
  );
  // endMonth uses NAV_END_YEAR constant — verify it's >= 2050
  assert.ok(
    src.includes("NAV_END_YEAR"),
    "Must define NAV_END_YEAR constant for endMonth",
  );
  const endYearMatch = src.match(/NAV_END_YEAR\s*=\s*(\d{4})/);
  assert.ok(endYearMatch, "NAV_END_YEAR must be a 4-digit year");
  const endYear = Number(endYearMatch[1]);
  assert.ok(
    endYear >= 2050,
    `NAV_END_YEAR must be >= 2050 for future dates, got ${endYear}`,
  );
});

test("ValuationDateField source: year range includes past dates", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(
    "src/features/valuations/components/editor/valuation-date-field.tsx",
    "utf8",
  );
  assert.ok(
    src.includes("NAV_START_YEAR"),
    "Must define NAV_START_YEAR constant for startMonth",
  );
  const startYearMatch = src.match(/NAV_START_YEAR\s*=\s*(\d{4})/);
  assert.ok(startYearMatch, "NAV_START_YEAR must be a 4-digit year");
  const startYear = Number(startYearMatch[1]);
  assert.ok(
    startYear <= 1950,
    `NAV_START_YEAR must be <= 1950 for past dates, got ${startYear}`,
  );
});

test("Calendar with startMonth/endMonth renders with year range", () => {
  const html = renderCalendar({
    captionLayout: "dropdown",
    startMonth: new Date(1900, 0),
    endMonth: new Date(2100, 11),
    defaultMonth: new Date(2024, 5),
  });
  // Should render without error and contain calendar content
  assert.ok(html.length > 100, "Calendar with year range should render content");
  assert.ok(
    html.includes("rdp"),
    "Calendar should render rdp root",
  );
});

/* ================================================================== */
/*  GROUP 9 — Future date navigability                                  */
/* ================================================================== */

test("ValuationDateField: future date value is representable", () => {
  // A date in 2027 should render without error
  const html = renderDateField({ value: "2027-12-25" });
  assert.ok(html.includes("25"), "Future date day should render");
  assert.ok(html.length > 100, "Future date should render fully");
});

test("ValuationDateField: far past date value is representable", () => {
  const html = renderDateField({ value: "1990-01-15" });
  assert.ok(html.includes("15"), "Past date day should render");
});
