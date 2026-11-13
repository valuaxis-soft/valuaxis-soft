import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu } from "../src/components/ui/dropdown-menu";
import { defaultColumnLayout } from "../src/features/valuations/comparable-base/column-layout";
import { ComparableColumnsMenuItems } from "../src/features/valuations/comparable-base/components/comparable-columns-menu";

test("the «Columnas» menu renders its label inside a group instead of throwing (COM-01)", () => {
  const html = renderToStaticMarkup(
    <DropdownMenu open>
      <ComparableColumnsMenuItems layout={defaultColumnLayout()} onToggle={() => {}} onReset={() => {}} />
    </DropdownMenu>,
  );
  assert.match(html, /role="group"/);
  assert.match(html, /Columnas visibles/);
  assert.equal(html.match(/role="menuitemcheckbox"/g)?.length, defaultColumnLayout().length);
  assert.match(html, /Restablecer columnas/);
});
