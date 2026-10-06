/**
 * /api/archivos/imagen: a stored image only for a member of the organization
 * that owns it, as a redirect that can be asked for again at any time.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { GET } from "../../src/app/api/archivos/imagen/route";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { storedImageUrl } from "../../src/features/files/services/stored-image-url";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

async function signIn(fixture: Fixture) {
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: "CONSULTA" } });
  await prisma.usuario.update({ where: { IdUsuario: fixture.user.id }, data: { BCorreoVerificado: true, DFechaVerificacionCorreo: new Date() } });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: fixture.organizationId, IdUsuario: fixture.user.id, IdRol: role.IdRol, DFechaModificacion: new Date() },
  });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: fixture.user.id, IdOrganizacion: fixture.organizationId, STokenHash: hashToken(token),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000), DFechaUltimaActividad: new Date(),
    },
  });
  const jar = new TestCookieJar();
  jar.set(AUTH_SESSION_COOKIE, token);
  return jar;
}

async function registerFile(fixture: Fixture, key: string) {
  const type = await prisma.tipoArchivo.findFirstOrThrow({ where: { SClave: "OTRO" } });
  await prisma.archivo.create({
    data: {
      UIdentificadorPublico: randomUUID(), IdOrganizacion: fixture.organizationId, IdUsuarioCarga: fixture.user.id,
      IdTipoArchivo: type.IdTipoArchivo, SBucket: "local", SClaveObjeto: key, SNombreOriginal: "foto.jpg", SNombreAlmacenado: "foto.jpg",
      STipoMime: "image/jpeg", SExtension: ".jpg", ITamanoBytes: BigInt(10), SChecksum: "x", BPrivado: true,
    },
  });
}

const get = (jar: TestCookieJar | null, key: string) => {
  const request = new Request(`http://localhost${storedImageUrl(key)}`);
  return jar ? withCookies(jar, () => GET(request)) : withCookies(new TestCookieJar(), () => GET(request));
};

test("a member gets a redirect to the image of their organization, every time they ask", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const key = `uploads/2026-10/${randomUUID()}.jpg`;
  await registerFile(fixture, key);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await get(jar, key);
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get("location")!).pathname, `/${key}`);
    assert.match(response.headers.get("cache-control") ?? "", /private/);
  }
});

test("without a session there is no image", async () => {
  const fixture = await createValuationFixture();
  const key = `uploads/2026-10/${randomUUID()}.jpg`;
  await registerFile(fixture, key);
  assert.equal((await get(null, key)).status, 401);
});

test("another organization's image is not found, registered or under its folder", async () => {
  const owner = await createValuationFixture();
  const other = await createValuationFixture();
  const jar = await signIn(other);
  const registered = `uploads/2026-10/${randomUUID()}.jpg`;
  await registerFile(owner, registered);
  assert.equal((await get(jar, registered)).status, 404);

  const ownerOrganization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: owner.organizationId } });
  assert.equal((await get(jar, `organizaciones/${ownerOrganization.UIdentificadorPublico}/avaluos/x/foto.jpg`)).status, 404);
  const otherOrganization = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: other.organizationId } });
  assert.equal((await get(jar, `organizaciones/${otherOrganization.UIdentificadorPublico}/avaluos/x/foto.jpg`)).status, 302, "su propia carpeta sí");
});

test("an image from before the file registry still loads; a malformed key does not", async () => {
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  assert.equal((await get(jar, `uploads/2026-04/${randomUUID()}.jpg`)).status, 302);
  for (const bad of ["", "foto.jpg", "../etc/passwd", "uploads/../secretos/x.jpg", "uploads//x.jpg", "https://evil.test/x.jpg", "otra-carpeta/x.jpg", "uploads/a b.jpg"]) {
    assert.equal((await get(jar, bad)).status, 404, bad);
  }
});
