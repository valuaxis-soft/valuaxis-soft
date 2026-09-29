/**
 * Shared setup for integration tests. They run against the local database from
 * compose.dev.yml (pnpm test:integration) and never against production.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage, type WorkUnitStore } from "next/dist/server/app-render/work-unit-async-storage.external";
import type { AuthUser } from "../../src/features/auth/model";
import { hashPassword } from "../../src/features/auth/services/password.service";
import { prisma } from "../../src/infrastructure/database/prisma-client";
import {
  getEmailService,
  type PasswordResetEmailInput,
  type VerificationEmailInput,
} from "../../src/infrastructure/email/email.service";

export { prisma };

export function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("Integration tests only run against a local database (DATABASE_URL must point to localhost).");
  }
}

/** Creates an isolated organization, user and valuation for one test run. */
export async function createValuationFixture() {
  assertLocalDatabase();
  const suffix = randomUUID().slice(0, 8);
  const [userState, orgState, valuationState, appraisalType, propertyType, operationType] = await Promise.all([
    prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "ACTIVO" } }),
    prisma.estadoOrganizacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
    prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: "NUEVO" } }),
    prisma.tipoAvaluo.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoInmueble.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.tipoOperacion.findFirstOrThrow({ where: { BActivo: true } }),
  ]);

  const organization = await prisma.organizacion.create({
    data: {
      IdEstadoOrganizacion: orgState.IdEstadoOrganizacion,
      SNombre: `Prueba ${suffix}`,
      SSlug: `prueba-${suffix}`,
      STipoAmbito: "PERSONAL",
      DFechaModificacion: new Date(),
    },
  });
  const usuario = await prisma.usuario.create({
    data: {
      IdEstadoUsuario: userState.IdEstadoUsuario,
      SNombre: "Perito",
      SCorreo: `perito-${suffix}@example.test`,
      DFechaModificacion: new Date(),
    },
  });
  const valuation = await prisma.avaluo.create({
    data: {
      IdOrganizacion: organization.IdOrganizacion,
      IdUsuarioCreador: usuario.IdUsuario,
      IdEstadoAvaluo: valuationState.IdEstadoAvaluo,
      IdTipoAvaluo: appraisalType.IdTipoAvaluo,
      IdTipoInmueble: propertyType.IdTipoInmueble,
      IdTipoOperacion: operationType.IdTipoOperacion,
      SFolio: `TEST-${suffix}`,
      STitulo: "Avalúo de prueba",
      DFechaModificacion: new Date(),
    },
  });

  const user: AuthUser = {
    id: usuario.IdUsuario,
    name: "Perito",
    email: usuario.SCorreo,
    role: "ADMINISTRADOR",
    permissions: ["AVALUO_VER", "AVALUO_EDITAR"],
    active: true,
    organizationId: organization.IdOrganizacion,
    organizationName: organization.SNombre,
  };

  return { publicId: valuation.UIdentificadorPublico, organizationId: organization.IdOrganizacion, user };
}

type CookieOptions = { maxAge?: number; path?: string; httpOnly?: boolean };

/**
 * Stands in for the cookie store of one browser, so code that calls
 * next/headers cookies() can run outside a Next.js request.
 */
export class TestCookieJar {
  readonly values = new Map<string, { value: string; options: CookieOptions }>();

  get(name: string) {
    const entry = this.values.get(name);
    return entry ? { name, value: entry.value } : undefined;
  }

  getAll() {
    return [...this.values].map(([name, entry]) => ({ name, value: entry.value }));
  }

  has(name: string) {
    return this.values.has(name);
  }

  set(name: string, value: string, options: CookieOptions = {}) {
    this.values.set(name, { value, options });
    return this;
  }

  delete(name: string | { name: string }) {
    this.values.delete(typeof name === "string" ? name : name.name);
    return this;
  }
}

/**
 * Outside the Next.js runtime, Next creates its request storages as stubs that
 * throw on use (globalThis.AsyncLocalStorage is not set when they load). Give
 * the stubs a real AsyncLocalStorage behind them.
 */
function backWithRealAsyncLocalStorage(storage: object) {
  if (storage instanceof AsyncLocalStorage) return;
  const real = new AsyncLocalStorage();
  Object.assign(storage, {
    run: real.run.bind(real),
    getStore: real.getStore.bind(real),
    exit: real.exit.bind(real),
  });
}

/** Runs `fn` with `jar` as the request's cookies (see TestCookieJar). */
export function withCookies<T>(jar: TestCookieJar, fn: () => Promise<T>): Promise<T> {
  backWithRealAsyncLocalStorage(workAsyncStorage);
  backWithRealAsyncLocalStorage(workUnitAsyncStorage);
  const workStore = { route: "/integration-test" } as unknown as WorkStore;
  const unitStore = { type: "private-cache", cookies: jar } as unknown as WorkUnitStore;
  return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unitStore, fn));
}

/** Records the auth emails instead of printing them, for the duration of test `t`. */
export function captureAuthEmails(t: TestContext) {
  const service = getEmailService();
  const verification: VerificationEmailInput[] = [];
  const passwordReset: PasswordResetEmailInput[] = [];
  t.mock.method(service, "sendVerificationEmail", async (input: VerificationEmailInput) => {
    verification.push(input);
  });
  t.mock.method(service, "sendPasswordResetEmail", async (input: PasswordResetEmailInput) => {
    passwordReset.push(input);
  });
  return { verification, passwordReset };
}

/** The raw token carried by an emailed link (?token=...). */
export function tokenFromLink(link: string) {
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error(`No token in ${link}`);
  return token;
}

/**
 * A local-password user with a personal space where they are ADMINISTRADOR.
 * Pass `password: null` for an account without a password.
 */
export async function createAuthUserFixture(options: { password?: string | null; verified?: boolean; label?: string } = {}) {
  assertLocalDatabase();
  const suffix = randomUUID().slice(0, 8);
  const label = options.label ?? "usuario";
  const password = options.password === undefined ? `Clave-segura-${suffix}!` : options.password;
  const [userState, orgState, localProvider, adminRole] = await Promise.all([
    prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "ACTIVO" } }),
    prisma.estadoOrganizacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
    prisma.proveedorIdentidad.findUniqueOrThrow({ where: { SClave: "LOCAL" } }),
    prisma.rol.findUniqueOrThrow({ where: { SClave: "ADMINISTRADOR" } }),
  ]);
  const email = `${label}-${suffix}@example.test`;
  const user = await prisma.usuario.create({
    data: {
      IdEstadoUsuario: userState.IdEstadoUsuario,
      SNombre: label,
      SApellidoPaterno: "Prueba",
      SCorreo: email,
      SContrasenaHash: password ? await hashPassword(password) : null,
      BCorreoVerificado: options.verified ?? true,
      DFechaVerificacionCorreo: options.verified === false ? null : new Date(),
    },
  });
  if (password) {
    await prisma.identidadUsuario.create({
      data: {
        IdUsuario: user.IdUsuario,
        IdProveedorIdentidad: localProvider.IdProveedorIdentidad,
        SIdentificadorProveedor: email,
        SCorreoProveedor: email,
        BPrincipal: true,
      },
    });
  }
  const organization = await prisma.organizacion.create({
    data: {
      IdEstadoOrganizacion: orgState.IdEstadoOrganizacion,
      IdUsuarioPropietario: user.IdUsuario,
      SNombre: `Espacio personal de ${label} ${suffix}`,
      SSlug: `auth-${suffix}`,
      STipoAmbito: "PERSONAL",
    },
  });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: organization.IdOrganizacion, IdUsuario: user.IdUsuario, IdRol: adminRole.IdRol },
  });
  return { userId: user.IdUsuario, email, password, organizationId: organization.IdOrganizacion };
}

/** A distinct client IP per test, so the in-memory login limiter never leaks between tests. */
export function testIp() {
  const bytes = randomUUID().replace(/-/g, "");
  return `10.${parseInt(bytes.slice(0, 2), 16)}.${parseInt(bytes.slice(2, 4), 16)}.${parseInt(bytes.slice(4, 6), 16)}`;
}
