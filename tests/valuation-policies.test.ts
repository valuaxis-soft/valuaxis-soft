import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_PERMISSIONS, type AuthUser } from "../src/features/auth/model";
import { canEditProject, canViewProjects, hasPermission } from "../src/features/auth/permissions";
import { authorizeApiUser } from "../src/security/guards/api-guard";
import { requireEditableValuationPolicy } from "../src/features/valuations/policies/valuation-access.policy";

// Mirrors the role grants seeded by migrations 004 and 028.
const valuador: AuthUser = {
  id: 1,
  active: true,
  email: "valuador@example.com",
  name: "Valuador",
  organizationId: 1,
  organizationName: "Org",
  role: "VALUADOR",
  permissions: ["AVALUO_VER", "AVALUO_CREAR", "AVALUO_EDITAR", "AVALUO_CONCLUIR", "AVALUO_REABRIR", "AVALUO_EXPORTAR"],
};

const consulta: AuthUser = {
  ...valuador,
  role: "CONSULTA",
  permissions: ["AVALUO_VER", "AVALUO_EXPORTAR"],
};

test("hasPermission reads the permissions granted by the database", () => {
  assert.equal(hasPermission(valuador, AUTH_PERMISSIONS.editValuations), true);
  assert.equal(hasPermission(valuador, AUTH_PERMISSIONS.manageUsers), false);
});

test("a read-only role can view but cannot edit", () => {
  assert.equal(canViewProjects(consulta), true);
  assert.equal(canEditProject(consulta), false);
});

test("an inactive user has no permissions", () => {
  assert.equal(hasPermission({ ...valuador, active: false }, AUTH_PERMISSIONS.viewValuations), false);
});

test("a role unknown to the code does not crash and grants only its database permissions", () => {
  const custom: AuthUser = { ...valuador, role: "PERITO_EXTERNO", permissions: ["AVALUO_VER"] };
  assert.equal(hasPermission(custom, AUTH_PERMISSIONS.viewValuations), true);
  assert.equal(hasPermission(custom, AUTH_PERMISSIONS.editValuations), false);
});

test("API guard returns 401 without a session", async () => {
  const result = authorizeApiUser(null, AUTH_PERMISSIONS.viewValuations);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 401);
});

test("API guard returns 403 when the permission is missing", async () => {
  const result = authorizeApiUser(consulta, AUTH_PERMISSIONS.editValuations);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 403);
    assert.deepEqual(await result.response.json(), { error: "Permiso insuficiente" });
  }
});

test("API guard lets the user through when the permission is granted", () => {
  const result = authorizeApiUser(valuador, AUTH_PERMISSIONS.editValuations);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.user, valuador);
});

test("API guard without a permission only requires a session", () => {
  assert.equal(authorizeApiUser(consulta).ok, true);
});

test("editable policy rejects finalized valuations", () => {
  const result = requireEditableValuationPolicy({ status: "terminado" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
});
