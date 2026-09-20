import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser } from "../src/features/auth/model";
import {
  requireEditableValuationPolicy,
  requirePermissionPolicy,
} from "../src/features/valuations/policies/valuation-access.policy";

const user: AuthUser = {
  id: 1,
  active: true,
  email: "valuador@example.com",
  name: "Valuador",
  organizationId: 1,
  organizationName: "Org",
  role: "VALUADOR",
};

test("permission policy allows granted role permissions", () => {
  assert.deepEqual(requirePermissionPolicy(user, "projects.edit"), { ok: true });
});

test("permission policy rejects missing role permissions", () => {
  const result = requirePermissionPolicy(user, "users.manage");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
});

test("editable policy rejects finalized valuations", () => {
  const result = requireEditableValuationPolicy({ status: "terminado" } as Parameters<typeof requireEditableValuationPolicy>[0]);
  assert.equal(result.ok, false);
});
