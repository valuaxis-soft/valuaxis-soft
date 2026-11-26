/**
 * What protects the closure, suspension and retention flows (docs/CUENTAS.md):
 * the emails' wording, the routes that cannot create or conclude while
 * suspended, the flags off by default, and the append-only logs.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountClosureSection } from "../src/features/account/components/account-closure-section";
import { ACCOUNT_CLOSURE_EFFECTS, supportEmail } from "../src/features/account/standing/closure-effects";
import { isAccountInactivityEnabled } from "../src/features/account/standing/inactivity.service";
import { ACCOUNT_CLOSURE_BALANCE_NOTICE } from "../src/features/billing/credit-rules";
import { ACCOUNT_NOTICE_KINDS, ACCOUNT_NOTICE_VERSION, buildAccountNotice, type AccountNoticeInput } from "../src/features/notifications/templates/account-notice";
import { isValuationRetentionEnabled } from "../src/features/valuations/retention/retention.service";

const common = { recipientName: "Perito Inventado", email: "perito@example.test", supportEmail: "contacto@example.test", appUrl: "https://app.example.test" };
const day = new Date("2026-11-25T18:00:00Z");
const samples: Record<(typeof ACCOUNT_NOTICE_KINDS)[number], AccountNoticeInput> = {
  BAJA: { ...common, kind: "BAJA", requestedAt: day },
  INACTIVIDAD: { ...common, kind: "INACTIVIDAD", disableFrom: day },
  INHABILITACION: { ...common, kind: "INHABILITACION", noticedAt: day, disabledAt: day },
  SUSPENSION_AVISO: { ...common, kind: "SUSPENSION_AVISO", cause: "CONTRACARGO", detail: null, deadline: day, blocksAccess: false },
  SUSPENSION: { ...common, kind: "SUSPENSION", cause: "USO_ILICITO", detail: "Detalle", startedAt: day, urgent: false, noticedAt: day, deadline: day, blocksAccess: false },
  REACTIVACION: { ...common, kind: "REACTIVACION", reactivatedAt: day },
};

test("every notice is worded, dated in Mexico City and keeps the balance in view", () => {
  assert.match(ACCOUNT_NOTICE_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  for (const kind of ACCOUNT_NOTICE_KINDS) {
    const content = buildAccountNotice(samples[kind]);
    assert.match(content.subject, /· Valuaxis Soft$/, kind);
    assert.match(content.text, /^Hola Perito Inventado,/, kind);
    assert.ok(content.html.includes("<p>Hola Perito Inventado,</p>"), kind);
  }
  for (const kind of ["BAJA", "INHABILITACION", "SUSPENSION_AVISO", "SUSPENSION", "REACTIVACION"] as const) {
    assert.match(buildAccountNotice(samples[kind]).text, /saldo/, kind);
  }
  assert.match(buildAccountNotice(samples.INACTIVIDAD).text, /25 de noviembre de 2026/);
  assert.match(buildAccountNotice(samples.SUSPENSION_AVISO).text, /Cancelación o contracargo de un pago ya cobrado\./);
  assert.match(buildAccountNotice(samples.SUSPENSION).text, /nunca|no suprime ningún dato/);
});

test("a person's text in a notice is escaped in the HTML", () => {
  const content = buildAccountNotice({ ...(samples.SUSPENSION as Extract<AccountNoticeInput, { kind: "SUSPENSION" }>), detail: "<script>alert(1)</script>" });
  assert.ok(!content.html.includes("<script>"));
  assert.ok(content.html.includes("&lt;script&gt;"));
});

test("«Baja de la cuenta» offers the button and the email route, with the effects of the documents", () => {
  const html = renderToStaticMarkup(<AccountClosureSection supportEmail="contacto@example.test" />);
  assert.ok(html.includes(ACCOUNT_CLOSURE_BALANCE_NOTICE));
  assert.match(html, /Dar de baja mi cuenta/);
  assert.match(html, /mailto:contacto@example\.test\?subject=Baja%20de%20mi%20cuenta/);
  assert.deepEqual(ACCOUNT_CLOSURE_EFFECTS.map((effect) => effect.title), ["Saldo", "Licencia", "Datos personales", "Reactivación"]);
  assert.match(ACCOUNT_CLOSURE_EFFECTS[1].text, /sección 17\.10/);
  assert.match(ACCOUNT_CLOSURE_EFFECTS[2].text, /secciones 7\.3 y 8\.3/);
  assert.equal(supportEmail({ EMAIL_REPLY_TO: " soporte@example.test " }), "soporte@example.test");
});

test("creating, duplicating and concluding answer 403 while the account is suspended", () => {
  for (const path of ["src/app/api/avaluos/route.ts", "src/app/api/avaluos/[id]/duplicar/route.ts", "src/app/api/avaluos/[id]/conclude/route.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /const suspended = await accountSuspendedResponse\(auth\.user\.id\);\n\s+if \(suspended\) return suspended;/, path);
  }
});

test("everything automatic is off unless its flag says «true»", () => {
  assert.equal(isAccountInactivityEnabled({}), false);
  assert.equal(isValuationRetentionEnabled({}), false);
  assert.equal(isAccountInactivityEnabled({ ACCOUNT_INACTIVITY_ENABLED: "false" }), false);
  assert.equal(isValuationRetentionEnabled({ VALUATION_RETENTION_ENABLED: "1" }), false);
  assert.equal(isAccountInactivityEnabled({ ACCOUNT_INACTIVITY_ENABLED: "true" }), true);
  assert.equal(isValuationRetentionEnabled({ VALUATION_RETENTION_ENABLED: " TRUE " }), true);
  const example = readFileSync(".env.example", "utf8");
  assert.match(example, /^ACCOUNT_INACTIVITY_ENABLED="false"$/m);
  assert.match(example, /^VALUATION_RETENTION_ENABLED="false"$/m);
});

test("the email log and the restrictions are never deleted, and nothing here touches the credit ledger", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk("src");
  walk("scripts");
  for (const path of files) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /avisoCorreo\.(delete|deleteMany|update|updateMany|upsert)\(/, path);
    assert.doesNotMatch(source, /suspensionCuenta\.(delete|deleteMany)\(/, path);
  }
  for (const path of files.filter((file) => /features\/(account\/standing|valuations\/retention)\//.test(file))) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /movimientoCreditos/, path);
  }
});

test("the retention never deletes a concluded valuation: it only removes the stored copies of its exports (26 Nov 2026)", () => {
  const retention = readFileSync("src/features/valuations/retention/retention.service.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(retention, /avaluo\.(delete|deleteMany|update|updateMany)\(|versionAvaluo\.|comparableAvaluo\.|seccionDocumento\./);
  assert.match(retention, /exportacionAvaluo\.updateMany\(/);
  assert.match(retention, /data: \{ IdArchivo: null, DFechaExpiracion: now \}/, "the export row stays, as history");
});
