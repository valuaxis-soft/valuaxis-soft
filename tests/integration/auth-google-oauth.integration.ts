import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from "jose";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { GoogleOAuthProviderError, type GoogleOAuthProfile } from "../../src/features/auth/providers/google-oauth.provider";
import { authenticateWithPassword } from "../../src/features/auth/services/authentication.service";
import {
  OAuthFlowError,
  completeGoogleOAuth,
  startGoogleOAuth,
  type OAuthErrorCode,
} from "../../src/features/auth/services/google-oauth.service";
import {
  createGoogleUserWithOnboarding,
  ensureUserOrganizationMembership,
} from "../../src/features/auth/services/oauth-onboarding.service";
import { getCurrentSession } from "../../src/features/auth/services/session.service";
import { hashToken } from "../../src/security/tokens/token-hashing";
import {
  TestCookieJar,
  assertLocalDatabase,
  createAuthUserFixture,
  prisma,
  testIp,
  withCookies,
} from "./support";

// ------------------------------------------------------------ fake Google

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const BINDING_COOKIE = "valuaxis_oauth";

type Claims = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  nonce?: string;
  aud?: string;
};

/**
 * Plays Google's token and JWKS endpoints. Like Google, it only issues an
 * id_token for a code it handed out, and only when the PKCE verifier matches
 * the challenge from the authorization request.
 */
const google = {
  keys: null as null | { privateKey: CryptoKey; jwk: JWK },
  grants: new Map<string, { claims: Claims; codeChallenge: string; nonce: string }>(),
  tokenEndpointDown: false,
  exchangedVerifiers: [] as string[],
};

async function fakeGoogleFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://www.googleapis.com/oauth2/v3/certs") {
    return Response.json({ keys: [google.keys!.jwk] });
  }
  if (url === "https://oauth2.googleapis.com/token") {
    if (google.tokenEndpointDown) return new Response("unavailable", { status: 503 });
    const body = new URLSearchParams(String(init?.body));
    const grant = google.grants.get(body.get("code") ?? "");
    const verifier = body.get("code_verifier") ?? "";
    google.exchangedVerifiers.push(verifier);
    if (!grant || hashToken(verifier) !== grant.codeChallenge || body.get("client_id") !== CLIENT_ID) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    google.grants.delete(body.get("code")!);
    const { sub, aud, nonce, ...claims } = grant.claims;
    const idToken = await new SignJWT({ ...claims, nonce: nonce ?? grant.nonce })
      .setProtectedHeader({ alg: "RS256", kid: google.keys!.jwk.kid })
      .setIssuer("https://accounts.google.com")
      .setAudience(aud ?? CLIENT_ID)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(google.keys!.privateKey);
    return Response.json({ access_token: "unused", id_token: idToken, token_type: "Bearer" });
  }
  throw new Error(`Unexpected network call in test: ${url}`);
}

const savedEnv = { ...process.env };

before(async () => {
  assertLocalDatabase();
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  google.keys = { privateKey, jwk: { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" } };
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_REDIRECT_URI = new URL("/api/auth/google/callback", process.env.APP_URL).toString();
  mock.method(globalThis, "fetch", fakeGoogleFetch);
});

after(async () => {
  mock.restoreAll();
  process.env = savedEnv;
  await prisma.$disconnect();
});

// ------------------------------------------------------------ flow helpers

function googleAccount(overrides: Partial<Claims> = {}): Claims {
  const suffix = randomUUID().slice(0, 8);
  return {
    sub: `google-${randomUUID()}`,
    email: `google-${suffix}@example.test`,
    email_verified: true,
    name: "Ana López",
    given_name: "Ana",
    family_name: "López",
    picture: "https://lh3.googleusercontent.com/a/foto",
    ...overrides,
  };
}

function browserRequest(ip: string, path = "/api/auth/google/start") {
  return new Request(`http://localhost:3000${path}`, { headers: { "x-forwarded-for": ip, "user-agent": "Chrome/129" } });
}

/** The browser clicks "Continue with Google"; returns what Google sees. */
async function start(browser: TestCookieJar, returnTo?: string | null, ip = testIp()) {
  const url = await withCookies(browser, () => startGoogleOAuth({ request: browserRequest(ip), returnTo }));
  return {
    ip,
    url,
    state: url.searchParams.get("state")!,
    nonce: url.searchParams.get("nonce")!,
    codeChallenge: url.searchParams.get("code_challenge")!,
  };
}

/** The user picks `claims` at Google, which redirects back with a code. */
function consent(started: Awaited<ReturnType<typeof start>>, claims: Claims) {
  const code = `code-${randomUUID()}`;
  google.grants.set(code, { claims, codeChallenge: started.codeChallenge, nonce: started.nonce });
  return code;
}

function callback(browser: TestCookieJar, input: { code?: string | null; state?: string | null; providerError?: string | null; ip?: string }) {
  return withCookies(browser, () =>
    completeGoogleOAuth({ request: browserRequest(input.ip ?? testIp(), "/api/auth/google/callback"), ...input }),
  );
}

async function signInWithGoogle(claims: Claims, returnTo?: string) {
  const browser = new TestCookieJar();
  const started = await start(browser, returnTo);
  const result = await callback(browser, { code: consent(started, claims), state: started.state, ip: started.ip });
  return { browser, started, result };
}

async function rejectsWith(promise: Promise<unknown>, code: OAuthErrorCode) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof OAuthFlowError, `expected OAuthFlowError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

const usersWithEmail = (email: string) => prisma.usuario.count({ where: { SCorreo: { equals: email, mode: "insensitive" } } });

async function addGoogleIdentity(userId: number, sub: string, email: string) {
  const provider = await prisma.proveedorIdentidad.findUniqueOrThrow({ where: { SClave: "GOOGLE" } });
  return prisma.identidadUsuario.create({
    data: { IdUsuario: userId, IdProveedorIdentidad: provider.IdProveedorIdentidad, SIdentificadorProveedor: sub, SCorreoProveedor: email },
  });
}

// ------------------------------------------------------------ start

test("starting sign-in stores only hashes, binds the browser and sends Google a PKCE S256 challenge", async () => {
  const browser = new TestCookieJar();
  const started = await start(browser, "/avaluos/abc");

  assert.equal(started.url.origin, "https://accounts.google.com");
  assert.equal(started.url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(started.url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(started.state.length >= 43 && started.nonce.length >= 43);

  const binding = browser.values.get(BINDING_COOKIE);
  assert.ok(binding);
  assert.equal(binding.options.httpOnly, true);
  assert.equal(binding.options.path, "/api/auth/google");
  const [cookieState, verifier] = binding.value.split(".");
  assert.equal(cookieState, started.state);
  assert.equal(hashToken(verifier), started.codeChallenge);
  // The verifier itself never leaves the browser cookie.
  assert.equal(started.url.toString().includes(verifier), false);

  const record = await prisma.solicitudOAuth.findUniqueOrThrow({ where: { SStateHash: hashToken(started.state) } });
  assert.equal(record.SNonceHash, hashToken(started.nonce));
  assert.equal(record.SCodeVerifierHash, started.codeChallenge);
  assert.equal(record.SURLRetorno, "/avaluos/abc");
  assert.equal(record.BCompletada, false);
  assert.equal(record.SDireccionIP, started.ip);
  const ttl = record.DFechaExpiracion.getTime() - Date.now();
  assert.ok(ttl > 9 * 60_000 && ttl <= 10 * 60_000, `ttl ${ttl}`);
});

test("only internal return paths survive the round trip; anything else lands on the dashboard", async () => {
  for (const returnTo of ["https://evil.example/phish", "//evil.example", "/\\evil.example", "/api/auth/logout", "javascript:alert(1)", null]) {
    const started = await start(new TestCookieJar(), returnTo);
    const record = await prisma.solicitudOAuth.findUniqueOrThrow({ where: { SStateHash: hashToken(started.state) } });
    assert.equal(record.SURLRetorno, "/dashboard", String(returnTo));
  }
});

test("sign-in cannot start when Google is not configured", async () => {
  const saved = process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CLIENT_SECRET;
  try {
    await assert.rejects(start(new TestCookieJar()), GoogleOAuthProviderError);
  } finally {
    process.env.GOOGLE_CLIENT_SECRET = saved;
  }
});

// ------------------------------------------------------------ callback: accounts

test("a new Google user gets a verified account without password, a personal space and a session", async () => {
  const claims = googleAccount();
  const { browser, started, result } = await signInWithGoogle(claims, "/avaluos/nuevo");
  assert.deepEqual(result, { redirectTo: "/avaluos/nuevo" });

  const user = await prisma.usuario.findUniqueOrThrow({
    where: { SCorreo: claims.email },
    include: { identidades: { include: { proveedorIdentidad: true } }, miembros: { include: { organizacion: true, rol: true } } },
  });
  assert.equal(user.SNombre, "Ana");
  assert.equal(user.SApellidoPaterno, "López");
  assert.equal(user.SImagenPerfil, claims.picture);
  assert.equal(user.BCorreoVerificado, true);
  assert.equal(user.SContrasenaHash, null);
  assert.equal(user.identidades.length, 1);
  assert.equal(user.identidades[0].proveedorIdentidad.SClave, "GOOGLE");
  assert.equal(user.identidades[0].SIdentificadorProveedor, claims.sub);
  assert.equal(user.identidades[0].BPrincipal, true);
  assert.equal(user.miembros.length, 1);
  assert.equal(user.miembros[0].rol.SClave, "ADMINISTRADOR");
  assert.equal(user.miembros[0].organizacion.SNombre, "Espacio personal de Ana");
  assert.equal(user.miembros[0].organizacion.IdUsuarioPropietario, user.IdUsuario);

  // Logged in, and the one-time binding cookie is gone.
  assert.equal(browser.has(BINDING_COOKIE), false);
  const current = await withCookies(browser, () => getCurrentSession());
  assert.equal(current?.user.id, user.IdUsuario);
  const session = await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: current!.sessionId } });
  assert.equal(session.IdIdentidadUsuario, user.identidades[0].IdIdentidadUsuario);

  const request = await prisma.solicitudOAuth.findUniqueOrThrow({ where: { SStateHash: hashToken(started.state) } });
  assert.equal(request.BCompletada, true);
  assert.equal(request.IdUsuario, user.IdUsuario);
  const audit = await prisma.auditoria.findFirstOrThrow({ where: { IdUsuario: user.IdUsuario, SAccion: "OAUTH_GOOGLE_SUCCESS" } });
  assert.deepEqual(audit.JMetadatos, { provider: "google", mode: "created_user" });

  // A Google-only account cannot be entered with a password.
  const byPassword = await withCookies(new TestCookieJar(), () =>
    authenticateWithPassword({ email: claims.email, password: "Cualquier-Clave-1", ip: testIp() }),
  );
  assert.deepEqual(byPassword, { ok: false, reason: "ACCOUNT_USES_GOOGLE" });
});

test("a returning Google user is recognised by Google's subject, even after changing their Gmail address", async () => {
  const claims = googleAccount();
  await signInWithGoogle(claims);
  const user = await prisma.usuario.findUniqueOrThrow({ where: { SCorreo: claims.email } });

  const renamed = { ...claims, email: `renombrada-${randomUUID().slice(0, 8)}@example.test`, name: "Ana L. Pérez", picture: "https://lh3.googleusercontent.com/a/nueva" };
  const { browser } = await signInWithGoogle(renamed);
  assert.equal((await withCookies(browser, () => getCurrentSession()))?.user.id, user.IdUsuario);
  assert.equal(await usersWithEmail(renamed.email), 0, "no second account is created");

  const identity = await prisma.identidadUsuario.findFirstOrThrow({ where: { IdUsuario: user.IdUsuario } });
  assert.equal(identity.SCorreoProveedor, renamed.email);
  assert.equal(identity.SNombreProveedor, "Ana L. Pérez");
  assert.equal(identity.SImagenProveedor, renamed.picture);
  assert.ok(identity.DFechaUltimoAcceso);
  const audit = await prisma.auditoria.findFirstOrThrow({
    where: { IdUsuario: user.IdUsuario, SAccion: "OAUTH_GOOGLE_SUCCESS" },
    orderBy: { IdAuditoria: "desc" },
  });
  assert.deepEqual(audit.JMetadatos, { provider: "google", mode: "existing_identity" });
});

test("Google sign-in with the email of a local account links to it instead of creating another", async () => {
  const local = await createAuthUserFixture({ label: "local" });
  // Google reports addresses in any casing; the account is still found.
  const claims = googleAccount({ email: local.email.toUpperCase() });
  const { browser } = await signInWithGoogle(claims);

  assert.equal(await usersWithEmail(local.email), 1);
  assert.equal((await withCookies(browser, () => getCurrentSession()))?.user.id, local.userId);
  const identities = await prisma.identidadUsuario.findMany({
    where: { IdUsuario: local.userId },
    include: { proveedorIdentidad: true },
    orderBy: { IdIdentidadUsuario: "asc" },
  });
  assert.deepEqual(identities.map((identity) => [identity.proveedorIdentidad.SClave, identity.BPrincipal]), [
    ["LOCAL", true],
    ["GOOGLE", false],
  ]);
  // No extra organization, and the local password keeps working.
  assert.equal(await prisma.miembroOrganizacion.count({ where: { IdUsuario: local.userId } }), 1);
  const byPassword = await withCookies(new TestCookieJar(), () =>
    authenticateWithPassword({ email: local.email, password: local.password!, ip: testIp() }),
  );
  assert.deepEqual(byPassword, { ok: true });
});

test("linking by email verifies an unverified local account and gives a space to a user without one", async () => {
  const local = await createAuthUserFixture({ verified: false });
  await prisma.miembroOrganizacion.deleteMany({ where: { IdUsuario: local.userId } });
  const { browser } = await signInWithGoogle(googleAccount({ email: local.email }));

  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: local.userId }, include: { miembros: { include: { rol: true, organizacion: true } } } });
  assert.equal(user.BCorreoVerificado, true);
  assert.equal(user.miembros.length, 1);
  assert.equal(user.miembros[0].rol.SClave, "ADMINISTRADOR");
  assert.equal(user.miembros[0].organizacion.STipoAmbito, "PERSONAL");
  assert.equal((await withCookies(browser, () => getCurrentSession()))?.organizationId, user.miembros[0].IdOrganizacion);
});

test("linking Google to an unverified local account drops the unverified password (pre-account takeover)", async () => {
  const squatter = await createAuthUserFixture({ label: "victima", verified: false });
  await signInWithGoogle(googleAccount({ email: squatter.email }));
  const byPassword = await withCookies(new TestCookieJar(), () =>
    authenticateWithPassword({ email: squatter.email, password: squatter.password!, ip: testIp() }),
  );
  assert.notDeepEqual(byPassword, { ok: true });
});

test("a Google account whose email is not verified by Google is refused and nothing is created", async () => {
  const claims = googleAccount({ email_verified: false });
  const browser = new TestCookieJar();
  const started = await start(browser);
  await rejectsWith(callback(browser, { code: consent(started, claims), state: started.state }), "oauth_email_unverified");
  assert.equal(await usersWithEmail(claims.email), 0);
  assert.equal(browser.has(AUTH_SESSION_COOKIE), false);

  // Nor can it hijack an existing account with that address.
  const local = await createAuthUserFixture();
  const other = new TestCookieJar();
  const again = await start(other);
  await rejectsWith(
    callback(other, { code: consent(again, googleAccount({ email: local.email, email_verified: false })), state: again.state }),
    "oauth_email_unverified",
  );
  assert.equal(await prisma.identidadUsuario.count({ where: { IdUsuario: local.userId } }), 1);
});

test("inactive, suspended or temporarily locked users cannot sign in with Google", async () => {
  const suspendedState = await prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "SUSPENDIDO" } });
  const disablers: Array<(userId: number) => Promise<unknown>> = [
    (userId) => prisma.usuario.update({ where: { IdUsuario: userId }, data: { BActivo: false } }),
    (userId) => prisma.usuario.update({ where: { IdUsuario: userId }, data: { IdEstadoUsuario: suspendedState.IdEstadoUsuario } }),
    (userId) => prisma.usuario.update({ where: { IdUsuario: userId }, data: { DFechaBloqueoTemporal: new Date(Date.now() + 60_000) } }),
  ];
  for (const disable of disablers) {
    // Through an existing Google identity…
    const claims = googleAccount();
    await signInWithGoogle(claims);
    const googleUser = await prisma.usuario.findUniqueOrThrow({ where: { SCorreo: claims.email } });
    await disable(googleUser.IdUsuario);
    const browser = new TestCookieJar();
    const started = await start(browser);
    await rejectsWith(callback(browser, { code: consent(started, claims), state: started.state }), "oauth_account_blocked");
    assert.equal(browser.has(AUTH_SESSION_COOKIE), false);

    // …and by email, without linking anything.
    const local = await createAuthUserFixture();
    await disable(local.userId);
    const other = new TestCookieJar();
    const again = await start(other);
    await rejectsWith(callback(other, { code: consent(again, googleAccount({ email: local.email })), state: again.state }), "oauth_account_blocked");
    assert.equal(await prisma.identidadUsuario.count({ where: { IdUsuario: local.userId } }), 1);
  }
});

test("an account already tied to another Google account is not re-linked by email", async () => {
  const local = await createAuthUserFixture();
  await addGoogleIdentity(local.userId, `google-${randomUUID()}`, local.email);
  const browser = new TestCookieJar();
  const started = await start(browser);
  await rejectsWith(
    callback(browser, { code: consent(started, googleAccount({ email: local.email })), state: started.state }),
    "oauth_account_conflict",
  );
  assert.equal(await prisma.identidadUsuario.count({ where: { IdUsuario: local.userId } }), 2);
});

test("a returning Google user without any active organization gets no session", async () => {
  const claims = googleAccount();
  await signInWithGoogle(claims);
  const user = await prisma.usuario.findUniqueOrThrow({ where: { SCorreo: claims.email } });
  await prisma.miembroOrganizacion.updateMany({ where: { IdUsuario: user.IdUsuario }, data: { BActivo: false } });

  const browser = new TestCookieJar();
  const started = await start(browser);
  await rejectsWith(callback(browser, { code: consent(started, claims), state: started.state }), "oauth_session_error");
  assert.equal(browser.has(AUTH_SESSION_COOKIE), false);
});

// ------------------------------------------------------------ callback: protocol

test("a cancelled consent or a callback without code or state is refused", async () => {
  const browser = new TestCookieJar();
  const started = await start(browser);
  await rejectsWith(callback(browser, { providerError: "access_denied", state: started.state }), "oauth_cancelled");
  await rejectsWith(callback(browser, { code: null, state: started.state }), "oauth_provider_error");
  await rejectsWith(callback(browser, { code: "x", state: null }), "oauth_invalid_state");
});

test("a callback URL replayed in another browser does not log that browser in (login CSRF)", async () => {
  const victim = new TestCookieJar();
  const attacker = new TestCookieJar();
  const started = await start(attacker);
  const code = consent(started, googleAccount());

  // The attacker makes the victim's browser open their callback URL.
  await rejectsWith(callback(victim, { code, state: started.state }), "oauth_invalid_state");
  assert.equal(victim.has(AUTH_SESSION_COOKIE), false);

  // The victim's own sign-in in progress is not confused by a foreign state either.
  const own = await start(victim);
  await rejectsWith(callback(victim, { code, state: started.state }), "oauth_invalid_state");
  // …and that attempt spent the victim's one-time binding, so they must start again.
  await rejectsWith(callback(victim, { code: consent(own, googleAccount()), state: own.state }), "oauth_invalid_state");
});

test("a state can be used only once", async () => {
  const claims = googleAccount();
  const { browser, started } = await signInWithGoogle(claims);
  // Same callback again: the binding cookie was consumed…
  await rejectsWith(callback(browser, { code: "another-code", state: started.state }), "oauth_invalid_state");

  // …and even with the cookie put back, the stored request is already completed.
  const restored = new TestCookieJar().set(BINDING_COOKIE, `${started.state}.${"v".repeat(64)}`);
  await rejectsWith(callback(restored, { code: consent(started, claims), state: started.state }), "oauth_invalid_state");
});

test("a state that expired before the callback is refused and closed", async () => {
  const browser = new TestCookieJar();
  const started = await start(browser);
  await prisma.solicitudOAuth.update({
    where: { SStateHash: hashToken(started.state) },
    data: { DFechaCreacion: new Date(Date.now() - 20 * 60_000), DFechaExpiracion: new Date(Date.now() - 1000) },
  });
  await rejectsWith(callback(browser, { code: consent(started, googleAccount()), state: started.state }), "oauth_expired");
  const record = await prisma.solicitudOAuth.findUniqueOrThrow({ where: { SStateHash: hashToken(started.state) } });
  assert.equal(record.BCompletada, true);
});

test("a PKCE verifier that does not match the request is refused before talking to Google", async () => {
  const browser = new TestCookieJar();
  const started = await start(browser);
  browser.set(BINDING_COOKIE, `${started.state}.${"x".repeat(64)}`);
  const exchangesBefore = google.exchangedVerifiers.length;
  await rejectsWith(callback(browser, { code: consent(started, googleAccount()), state: started.state }), "oauth_invalid_state");
  assert.equal(google.exchangedVerifiers.length, exchangesBefore);
});

test("an id_token for another nonce or another client, or a failed token exchange, is refused", async () => {
  const cases: Array<[string, Partial<Claims>]> = [
    ["nonce from another sign-in", { nonce: "nonce-de-otra-solicitud" }],
    ["token issued to another app", { aud: "otra-app.apps.googleusercontent.com" }],
  ];
  for (const [label, overrides] of cases) {
    const claims = googleAccount(overrides);
    const browser = new TestCookieJar();
    const started = await start(browser);
    await rejectsWith(callback(browser, { code: consent(started, claims), state: started.state }), "oauth_provider_error");
    assert.equal(await usersWithEmail(claims.email), 0, label);
  }

  // A code Google never issued.
  const browser = new TestCookieJar();
  const started = await start(browser);
  await rejectsWith(callback(browser, { code: "codigo-inventado", state: started.state }), "oauth_provider_error");

  google.tokenEndpointDown = true;
  try {
    const down = new TestCookieJar();
    const again = await start(down);
    await rejectsWith(callback(down, { code: consent(again, googleAccount()), state: again.state }), "oauth_provider_error");
  } finally {
    google.tokenEndpointDown = false;
  }
});

// ------------------------------------------------------------ onboarding pieces

test("onboarding a Google profile falls back to sensible names", async () => {
  const provider = await prisma.proveedorIdentidad.findUniqueOrThrow({ where: { SClave: "GOOGLE" } });
  const email = `solo-correo-${randomUUID().slice(0, 8)}@example.test`;
  const profile: GoogleOAuthProfile = { provider: "google", providerUserId: `google-${randomUUID()}`, email, emailVerified: true };

  const created = await prisma.$transaction((tx) => createGoogleUserWithOnboarding(tx, profile, provider.IdProveedorIdentidad));
  assert.equal(created.user.SNombre, email.split("@")[0]);
  assert.equal(created.user.SApellidoPaterno, null);
  assert.equal(created.user.SImagenPerfil, null);
  assert.equal(created.identity.SNombreProveedor, email.split("@")[0]);
  const organization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: created.createdOrganizationId } });
  assert.equal(organization.SNombre, `Espacio personal de ${email.split("@")[0]}`);
  assert.equal(organization.SCorreo, email);
});

test("ensuring a membership reuses the first active one and never duplicates the personal space", async () => {
  const fixture = await createAuthUserFixture();
  const existing = await prisma.$transaction((tx) =>
    ensureUserOrganizationMembership(tx, { userId: fixture.userId, name: "usuario", email: fixture.email }),
  );
  assert.equal(existing.IdOrganizacion, fixture.organizationId);
  assert.equal(await prisma.miembroOrganizacion.count({ where: { IdUsuario: fixture.userId } }), 1);

  // With the only membership disabled, a new personal space is created and owned by the user.
  await prisma.miembroOrganizacion.updateMany({ where: { IdUsuario: fixture.userId }, data: { BActivo: false } });
  const fresh = await prisma.$transaction((tx) =>
    ensureUserOrganizationMembership(tx, { userId: fixture.userId, name: "usuario", email: fixture.email }),
  );
  assert.notEqual(fresh.IdOrganizacion, fixture.organizationId);
  assert.equal(fresh.IdUsuarioPropietario, fixture.userId);
  assert.equal(fresh.STipoAmbito, "PERSONAL");
  const again = await prisma.$transaction((tx) =>
    ensureUserOrganizationMembership(tx, { userId: fixture.userId, name: "usuario", email: fixture.email }),
  );
  assert.equal(again.IdOrganizacion, fresh.IdOrganizacion);
});
