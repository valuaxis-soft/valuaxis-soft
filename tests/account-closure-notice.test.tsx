/**
 * Closing or disabling an account (the lawyer's commercial policies,
 * 25 Nov 2026): «Mi cuenta» says the balance stays, without expiry and
 * without refunds, and nothing in the app zeroes a balance.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountClosureSection } from "../src/features/account/components/account-closure-section";
import { ACCOUNT_CLOSURE_BALANCE_NOTICE, CREDIT_MOVEMENT_TYPES } from "../src/features/billing/credit-rules";

test("the balance notice reads exactly as agreed", () => {
  assert.equal(
    ACCOUNT_CLOSURE_BALANCE_NOTICE,
    "El saldo pagado o no usado se conserva sin vencimiento en tu cuenta conforme a las políticas comerciales (sección 3.2). No hay devoluciones; podrás usarlo si reactivas tu cuenta.",
  );
});

test("«Mi cuenta» shows it in «Baja de la cuenta»", () => {
  const html = renderToStaticMarkup(<AccountClosureSection />);
  assert.match(html, /Baja de la cuenta/);
  assert.ok(html.includes(ACCOUNT_CLOSURE_BALANCE_NOTICE));
  assert.match(readFileSync("src/app/(private)/cuenta/page.tsx", "utf8"), /<AccountClosureSection \/>/);
});

test("the balance is an append-only ledger: no code deletes or rewrites its movements", () => {
  assert.deepEqual(Object.values(CREDIT_MOVEMENT_TYPES), ["COMPRA", "CONSUMO", "AJUSTE"]);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk("src");
  for (const path of files) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /movimientoCreditos\.(delete|deleteMany|update|updateMany)\(/, path);
  }
});
