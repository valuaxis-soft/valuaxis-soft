/**
 * The terms of closing, suspending and keeping (the lawyer's documents of
 * 15 Nov 2026; docs/CUENTAS.md), without a database.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accountStanding,
  addMonths,
  businessDaysDeadline,
  causeMayBlockAccess,
  inactivityDisableDue,
  inactivityDue,
  isMexicanHoliday,
  lastActivity,
  retentionExpiry,
  retentionSuppressionDue,
  retentionWarningDue,
  suspendedMessage,
  type AccountRestriction,
} from "../src/features/account/standing/account-standing-rules";

const at = (iso: string) => new Date(iso);

test("months keep the day when it exists", () => {
  assert.equal(addMonths(at("2026-01-31T12:00:00Z"), 1).toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(addMonths(at("2026-11-25T12:00:00Z"), 12).toISOString(), "2027-11-25T12:00:00.000Z");
  assert.equal(addMonths(at("2026-11-25T12:00:00Z"), -3).toISOString(), "2026-08-25T12:00:00.000Z");
});

test("the days of rest of LFT article 74", () => {
  for (const day of ["2027-01-01", "2027-02-01", "2027-03-15", "2027-05-01", "2027-09-16", "2027-11-15", "2027-12-25", "2030-10-01"]) {
    assert.equal(isMexicanHoliday(at(`${day}T00:00:00Z`)), true, day);
  }
  for (const day of ["2027-02-08", "2027-11-20", "2027-10-01", "2026-12-12"]) {
    assert.equal(isMexicanHoliday(at(`${day}T00:00:00Z`)), false, day);
  }
});

test("five business days: the notice's day does not count, weekends and days of rest are skipped", () => {
  // Monday 9 Nov 2026, 10:00 in Mexico City; Monday 16 is the third Monday of November.
  assert.equal(businessDaysDeadline(at("2026-11-09T16:00:00Z"), 5).toISOString(), "2026-11-18T05:59:59.999Z");
  // Friday 11 Dec 2026, 23:30 in Mexico City (already Saturday in UTC) still counts from Friday.
  assert.equal(businessDaysDeadline(at("2026-12-12T05:30:00Z"), 5).toISOString(), "2026-12-19T05:59:59.999Z");
  // Across Christmas and New Year: 24, 28, 29, 30, 31 Dec.
  assert.equal(businessDaysDeadline(at("2026-12-23T18:00:00Z"), 5).toISOString(), "2027-01-01T05:59:59.999Z");
});

test("a closure closes the door; a suspension only stops producing", () => {
  const now = at("2026-11-25T12:00:00Z");
  const row = (kind: AccountRestriction["kind"], extra: Partial<AccountRestriction> = {}): AccountRestriction => ({
    kind, startedAt: at("2026-11-01T00:00:00Z"), endedAt: null, blocksAccess: false, ...extra,
  });
  assert.deepEqual(accountStanding([], now), { access: true, canProduce: true, restriction: null });
  assert.deepEqual(accountStanding([row("BAJA")], now), { access: false, canProduce: false, restriction: "BAJA" });
  assert.deepEqual(accountStanding([row("INACTIVIDAD")], now), { access: true, canProduce: false, restriction: "INACTIVIDAD" });
  assert.deepEqual(accountStanding([row("INACTIVIDAD"), row("OTRA")], now), { access: true, canProduce: false, restriction: "OTRA" });
  assert.deepEqual(accountStanding([row("OTRA", { blocksAccess: true })], now), { access: false, canProduce: false, restriction: "OTRA" });
  // A notice not in effect yet, or a restriction that ended, changes nothing.
  assert.deepEqual(accountStanding([row("OTRA", { startedAt: null }), row("BAJA", { endedAt: now })], now), { access: true, canProduce: true, restriction: null });
  assert.deepEqual(accountStanding([row("OTRA", { startedAt: at("2026-12-01T00:00:00Z") })], now).canProduce, true);
});

test("only an identity check may block the access", () => {
  assert.equal(causeMayBlockAccess("SUPLANTACION"), true);
  for (const cause of ["PRESTAMO", "USO_ILICITO", "CONTRACARGO"] as const) assert.equal(causeMayBlockAccess(cause), false);
});

test("the suspension message always says the person still consults and keeps the balance", () => {
  for (const kind of ["INACTIVIDAD", "OTRA"] as const) {
    assert.match(suspendedMessage(kind), /consultar y descargar tus avalúos concluidos/);
    assert.match(suspendedMessage(kind), /saldo se conserva/);
  }
});

test("inactivity: three months from the last valuation, sign-up or reactivation; disabled fifteen days after the email", () => {
  const activity = lastActivity({
    accountCreatedAt: at("2026-01-10T00:00:00Z"),
    lastValuationCreatedAt: at("2026-07-01T00:00:00Z"),
    lastReactivatedAt: at("2026-06-01T00:00:00Z"),
  });
  assert.equal(activity.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(inactivityDue(activity, at("2026-09-30T23:59:59Z")), false);
  assert.equal(inactivityDue(activity, at("2026-10-01T00:00:00Z")), true);
  assert.equal(lastActivity({ accountCreatedAt: at("2026-01-10T00:00:00Z"), lastValuationCreatedAt: null, lastReactivatedAt: null }).toISOString(), "2026-01-10T00:00:00.000Z");
  assert.equal(inactivityDisableDue(at("2026-10-01T00:00:00Z"), at("2026-10-15T23:00:00Z")), false);
  assert.equal(inactivityDisableDue(at("2026-10-01T00:00:00Z"), at("2026-10-16T00:00:00Z")), true);
});

test("retention: the validity, never more than twelve months from the conclusion", () => {
  const concludedAt = at("2026-01-15T18:00:00Z");
  assert.equal(retentionExpiry({ concludedAt, validUntil: null }).toISOString(), "2027-01-15T18:00:00.000Z");
  assert.equal(retentionExpiry({ concludedAt, validUntil: at("2026-07-15T06:00:00Z") }).toISOString(), "2026-07-15T06:00:00.000Z");
  // A validity beyond twelve months, or before the conclusion, is not used.
  assert.equal(retentionExpiry({ concludedAt, validUntil: at("2027-06-01T00:00:00Z") }).toISOString(), "2027-01-15T18:00:00.000Z");
  assert.equal(retentionExpiry({ concludedAt, validUntil: at("2026-01-01T00:00:00Z") }).toISOString(), "2027-01-15T18:00:00.000Z");
});

test("retention: the email thirty days before, the suppression at the expiry and never less than thirty days after the email", () => {
  const expiry = at("2027-01-15T18:00:00Z");
  assert.equal(retentionWarningDue(expiry, at("2026-12-16T17:59:59Z")), false);
  assert.equal(retentionWarningDue(expiry, at("2026-12-16T18:00:00Z")), true);
  assert.equal(retentionSuppressionDue(expiry, null, at("2028-01-01T00:00:00Z")), false, "never without the email");
  assert.equal(retentionSuppressionDue(expiry, at("2026-12-16T18:00:00Z"), at("2027-01-15T17:59:59Z")), false);
  assert.equal(retentionSuppressionDue(expiry, at("2026-12-16T18:00:00Z"), at("2027-01-15T18:00:00Z")), true);
  // The daily task turned on late: the email goes out after the expiry, the thirty days still run.
  assert.equal(retentionSuppressionDue(expiry, at("2027-03-01T00:00:00Z"), at("2027-03-30T00:00:00Z")), false);
  assert.equal(retentionSuppressionDue(expiry, at("2027-03-01T00:00:00Z"), at("2027-03-31T00:00:00Z")), true);
});
