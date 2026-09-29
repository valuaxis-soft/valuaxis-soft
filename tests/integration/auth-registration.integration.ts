import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { EMAIL_TOKEN_TTL_MINUTES } from "../../src/features/auth/constants/auth.constants";
import { authenticateWithPassword } from "../../src/features/auth/services/authentication.service";
import {
  consumeEmailVerificationToken,
  createEmailVerificationToken,
} from "../../src/features/auth/services/email-verification.service";
import { verifyPassword } from "../../src/features/auth/services/password.service";
import { registerLocalUser } from "../../src/features/auth/services/registration.service";
import { parseRegisterInput } from "../../src/features/auth/validations/register.schema";
import { hashToken } from "../../src/security/tokens/token-hashing";
import {
  TestCookieJar,
  assertLocalDatabase,
  captureAuthEmails,
  createAuthUserFixture,
  prisma,
  testIp,
  tokenFromLink,
  withCookies,
} from "./support";

after(() => prisma.$disconnect());
before(() => assertLocalDatabase());

const PASSWORD = "Clave-Segura-2026!";

function newEmail(label = "registro") {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`;
}

/** What the registration form submits, parsed the way the server action parses it. */
function registrationForm(values: Partial<Record<string, string>> = {}) {
  const form = new FormData();
  const fields = {
    name: "Álvaro",
    paternalLastName: "Gutiérrez",
    email: newEmail(),
    password: PASSWORD,
    confirmPassword: values.password ?? PASSWORD,
    acceptedTerms: "on",
    ...values,
  };
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.set(key, value);
  return parseRegisterInput(form);
}

test("registration creates an unverified user, a LOCAL identity and a personal space they administer", async (t) => {
  const mail = captureAuthEmails(t);
  const parsed = registrationForm({ maternalLastName: "Ramos" });
  assert.equal(parsed.ok, true);

  const result = await registerLocalUser(parsed.data);
  assert.equal(result.ok, true);
  assert.ok(result.ok);

  const user = await prisma.usuario.findUniqueOrThrow({
    where: { IdUsuario: result.userId },
    include: {
      identidades: { include: { proveedorIdentidad: true } },
      miembros: { include: { organizacion: true, rol: true } },
    },
  });
  assert.equal(user.SCorreo, parsed.data.email);
  assert.equal(user.SNombre, "Álvaro");
  assert.equal(user.SApellidoPaterno, "Gutiérrez");
  assert.equal(user.SApellidoMaterno, "Ramos");
  assert.equal(user.BCorreoVerificado, false);
  assert.equal(user.BActivo, true);
  // The password is stored hashed, never in clear.
  assert.ok(user.SContrasenaHash);
  assert.notEqual(user.SContrasenaHash, PASSWORD);
  assert.equal(await verifyPassword(PASSWORD, user.SContrasenaHash), true);

  assert.equal(user.identidades.length, 1);
  assert.equal(user.identidades[0].proveedorIdentidad.SClave, "LOCAL");
  assert.equal(user.identidades[0].BPrincipal, true);
  assert.equal(user.identidades[0].SIdentificadorProveedor, parsed.data.email);

  assert.equal(user.miembros.length, 1);
  const [membership] = user.miembros;
  assert.equal(membership.rol.SClave, "ADMINISTRADOR");
  assert.equal(membership.BActivo, true);
  assert.equal(membership.organizacion.SNombre, "Espacio personal de Álvaro");
  assert.equal(membership.organizacion.STipoAmbito, "PERSONAL");
  assert.equal(membership.organizacion.IdUsuarioPropietario, user.IdUsuario);
  assert.match(membership.organizacion.SSlug, /^espacio-personal-de-alvaro-[a-z0-9]+$/);

  // One verification email, whose link carries a token stored only as a hash.
  assert.equal(mail.verification.length, 1);
  assert.equal(mail.verification[0].to, parsed.data.email);
  assert.equal(mail.verification[0].name, "Álvaro");
  const link = new URL(mail.verification[0].verificationUrl);
  assert.equal(link.pathname, "/verificar-correo");
  const token = tokenFromLink(link.toString());
  const records = await prisma.tokenVerificacionCorreo.findMany({ where: { IdUsuario: user.IdUsuario } });
  assert.equal(records.length, 1);
  assert.equal(records[0].STokenHash, hashToken(token));
  assert.notEqual(records[0].STokenHash, token);
  assert.equal(records[0].BUtilizado, false);
  const ttl = records[0].DFechaExpiracion.getTime() - records[0].DFechaCreacion.getTime();
  assert.ok(Math.abs(ttl - EMAIL_TOKEN_TTL_MINUTES * 60 * 1000) < 60_000, `token TTL was ${ttl}ms`);
});

test("registration uses the firm name when the user gives one", async (t) => {
  captureAuthEmails(t);
  const parsed = registrationForm({ organizationName: "Valuadores de los Altos" });
  const result = await registerLocalUser(parsed.data);
  assert.ok(result.ok);
  const membership = await prisma.miembroOrganizacion.findFirstOrThrow({
    where: { IdUsuario: result.userId },
    include: { organizacion: true },
  });
  assert.equal(membership.organizacion.SNombre, "Valuadores de los Altos");
  assert.equal(membership.organizacion.STipoAmbito, "PERSONAL");
});

test("an email that is already registered is rejected, whatever its casing, without creating anything", async (t) => {
  const mail = captureAuthEmails(t);
  const existing = await createAuthUserFixture({ label: "existente" });

  for (const email of [existing.email, existing.email.toUpperCase(), `  ${existing.email.replace("existente", "EXISTENTE")} `]) {
    const parsed = registrationForm({ email });
    assert.equal(parsed.ok, true, email);
    const result = await registerLocalUser(parsed.data);
    assert.deepEqual(result, { ok: false, reason: "EMAIL_ALREADY_REGISTERED" }, email);
  }

  assert.equal(await prisma.usuario.count({ where: { SCorreo: { equals: existing.email, mode: "insensitive" } } }), 1);
  assert.equal(await prisma.miembroOrganizacion.count({ where: { IdUsuario: existing.userId } }), 1);
  assert.equal(mail.verification.length, 0);
});

test("an email that belongs to a Google-only account is told to continue with Google", async (t) => {
  captureAuthEmails(t);
  const existing = await createAuthUserFixture({ label: "google", password: null });
  const google = await prisma.proveedorIdentidad.findUniqueOrThrow({ where: { SClave: "GOOGLE" } });
  await prisma.identidadUsuario.create({
    data: {
      IdUsuario: existing.userId,
      IdProveedorIdentidad: google.IdProveedorIdentidad,
      SIdentificadorProveedor: `google-sub-${randomUUID()}`,
      SCorreoProveedor: existing.email,
      BPrincipal: true,
    },
  });

  const result = await registerLocalUser(registrationForm({ email: existing.email }).data);
  assert.deepEqual(result, { ok: false, reason: "ACCOUNT_USES_GOOGLE" });
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: existing.userId } });
  assert.equal(user.SContrasenaHash, null, "registration must not set a password on the Google account");
});

test("the registration form rejects weak passwords and a mismatched confirmation before reaching the service", () => {
  for (const password of ["corta1!A", "sinmayusculas1!", "SINMINUSCULAS1!", "SinNumeros!!", "SinSimbolos123"]) {
    const parsed = registrationForm({ password });
    assert.equal(parsed.ok, false, password);
    assert.ok(parsed.fieldErrors.password?.length, password);
  }
  const mismatch = registrationForm({ password: PASSWORD, confirmPassword: `${PASSWORD}x` });
  assert.equal(mismatch.ok, false);
  assert.deepEqual(mismatch.fieldErrors.confirmPassword, ["Las contraseñas no coinciden."]);
  const noTerms = registrationForm({ acceptedTerms: "" });
  assert.equal(noTerms.ok, false);
  assert.ok(noTerms.fieldErrors.acceptedTerms);
});

test("registration succeeds even when the verification email cannot be sent", async (t) => {
  const { getEmailService } = await import("../../src/infrastructure/email/email.service");
  t.mock.method(getEmailService(), "sendVerificationEmail", async () => {
    throw new Error("SES is down");
  });
  const parsed = registrationForm();
  const result = await registerLocalUser(parsed.data);
  assert.ok(result.ok);
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: result.userId } });
  assert.equal(user.BCorreoVerificado, false);
  // The user can ask for a new link later; the account is not half-created.
  assert.equal(await prisma.miembroOrganizacion.count({ where: { IdUsuario: result.userId } }), 1);
});

test("an email whose previous account was deleted gets a clear answer instead of a crash", async (t) => {
  captureAuthEmails(t);
  const deleted = await createAuthUserFixture({ label: "borrado" });
  await prisma.usuario.update({ where: { IdUsuario: deleted.userId }, data: { DFechaEliminacion: new Date(), BActivo: false } });
  await assert.doesNotReject(registerLocalUser(registrationForm({ email: deleted.email }).data));
});

test("a registered user must verify their email before logging in, and the link works once", async (t) => {
  const mail = captureAuthEmails(t);
  const parsed = registrationForm();
  const result = await registerLocalUser(parsed.data);
  assert.ok(result.ok);
  const ip = testIp();

  const jar = new TestCookieJar();
  const beforeVerification = await withCookies(jar, () =>
    authenticateWithPassword({ email: parsed.data.email, password: PASSWORD, ip }),
  );
  assert.deepEqual(beforeVerification, { ok: false, reason: "EMAIL_NOT_VERIFIED" });
  assert.equal(await prisma.sesion.count({ where: { IdUsuario: result.userId } }), 0);

  const token = tokenFromLink(mail.verification[0].verificationUrl);
  assert.equal(await consumeEmailVerificationToken(token), true);
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: result.userId } });
  assert.equal(user.BCorreoVerificado, true);
  assert.ok(user.DFechaVerificacionCorreo);
  const record = await prisma.tokenVerificacionCorreo.findUniqueOrThrow({ where: { STokenHash: hashToken(token) } });
  assert.equal(record.BUtilizado, true);
  assert.ok(record.DFechaUtilizacion);
  const audit = await prisma.auditoria.findFirst({ where: { IdUsuario: result.userId, SAccion: "EMAIL_VERIFIED" } });
  assert.equal(audit?.SResultado, "EXITOSO");

  // Single use.
  assert.equal(await consumeEmailVerificationToken(token), false);

  const afterVerification = await withCookies(jar, () =>
    authenticateWithPassword({ email: parsed.data.email, password: PASSWORD, ip }),
  );
  assert.deepEqual(afterVerification, { ok: true });
});

test("unknown, tampered and empty verification tokens are rejected without verifying anyone", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture({ verified: false });
  await createEmailVerificationToken({ userId: fixture.userId, email: fixture.email, name: "usuario" });
  const token = tokenFromLink(mail.verification[0].verificationUrl);

  assert.equal(await consumeEmailVerificationToken(""), false);
  assert.equal(await consumeEmailVerificationToken("no-es-un-token"), false);
  assert.equal(await consumeEmailVerificationToken(`${token}x`), false);
  assert.equal(await consumeEmailVerificationToken(token.slice(0, -1)), false);
  // The stored hash itself is not a valid token.
  assert.equal(await consumeEmailVerificationToken(hashToken(token)), false);

  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(user.BCorreoVerificado, false);
});

test("an expired verification token is rejected", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture({ verified: false });
  await createEmailVerificationToken({ userId: fixture.userId, email: fixture.email, name: "usuario" });
  const token = tokenFromLink(mail.verification[0].verificationUrl);
  await prisma.tokenVerificacionCorreo.update({
    where: { STokenHash: hashToken(token) },
    data: { DFechaCreacion: new Date(Date.now() - 2 * 86_400_000), DFechaExpiracion: new Date(Date.now() - 1000) },
  });

  assert.equal(await consumeEmailVerificationToken(token), false);
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(user.BCorreoVerificado, false);
});

test("asking for a new verification link invalidates the previous one", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture({ verified: false });
  await createEmailVerificationToken({ userId: fixture.userId, email: fixture.email, name: "usuario" });
  await createEmailVerificationToken({ userId: fixture.userId, email: fixture.email, name: "usuario" });
  assert.equal(mail.verification.length, 2);
  const [oldToken, newToken] = mail.verification.map((email) => tokenFromLink(email.verificationUrl));
  assert.notEqual(oldToken, newToken);

  const oldRecord = await prisma.tokenVerificacionCorreo.findUniqueOrThrow({ where: { STokenHash: hashToken(oldToken) } });
  assert.ok(oldRecord.DFechaRevocacion);
  assert.equal(await consumeEmailVerificationToken(oldToken), false);
  assert.equal(await consumeEmailVerificationToken(newToken), true);
});
