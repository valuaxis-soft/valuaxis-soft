import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { getValuationCreationCatalogs } from "../../src/features/valuations/services/valuation-catalogs.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

async function member(organizationId: number, data: { name: string; paternal?: string; maternal?: string; active?: boolean; deleted?: boolean; memberActive?: boolean }) {
  const [state, role] = await Promise.all([
    prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "ACTIVO" } }),
    prisma.rol.findUniqueOrThrow({ where: { SClave: "VALUADOR" } }),
  ]);
  const usuario = await prisma.usuario.create({
    data: {
      IdEstadoUsuario: state.IdEstadoUsuario,
      SNombre: data.name,
      SApellidoPaterno: data.paternal ?? null,
      SApellidoMaterno: data.maternal ?? null,
      SCorreo: `${data.name.toLowerCase().replace(/\W/g, "")}-${randomUUID().slice(0, 8)}@example.test`,
      BActivo: data.active ?? true,
      DFechaEliminacion: data.deleted ? new Date() : null,
      DFechaModificacion: new Date(),
    },
  });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: organizationId, IdUsuario: usuario.IdUsuario, IdRol: role.IdRol, BActivo: data.memberActive ?? true, DFechaModificacion: new Date() },
  });
  return usuario.IdUsuario;
}

test("templates are the system's and the organization's own, never another firm's or inactive ones", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  const type = await prisma.tipoAvaluo.findFirstOrThrow({ where: { BActivo: true } });
  const suffix = randomUUID().slice(0, 8);
  const create = (name: string, organizationId: number | null, active = true) =>
    prisma.plantillaAvaluo.create({ data: { IdOrganizacion: organizationId, IdTipoAvaluo: type.IdTipoAvaluo, SNombre: `${name} ${suffix}`, BActivo: active } });
  const own = await create("Propia", fixture.organizationId);
  const foreign = await create("Ajena", other.organizationId);
  const inactive = await create("Inactiva", fixture.organizationId, false);

  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  const templateIds = catalogs.templates.map((template) => template.id);
  assert.ok(templateIds.includes(own.IdPlantillaAvaluo));
  assert.ok(!templateIds.includes(foreign.IdPlantillaAvaluo), "another firm's template is private");
  assert.ok(!templateIds.includes(inactive.IdPlantillaAvaluo));
  const systemTemplates = await prisma.plantillaAvaluo.findMany({ where: { IdOrganizacion: null, BActivo: true } });
  for (const template of systemTemplates) assert.ok(templateIds.includes(template.IdPlantillaAvaluo), "system templates are offered to everyone");
  assert.deepEqual(catalogs.templates.find((template) => template.id === own.IdPlantillaAvaluo), {
    id: own.IdPlantillaAvaluo,
    label: `Propia ${suffix}`,
    appraisalTypeId: type.IdTipoAvaluo,
  });

  const otherCatalogs = await getValuationCreationCatalogs(other.organizationId);
  assert.ok(!otherCatalogs.templates.some((template) => template.id === own.IdPlantillaAvaluo));
});

test("the responsible appraisers are the organization's active members, by name, with their full name", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  const zoe = await member(fixture.organizationId, { name: "Zoe", paternal: "Núñez", maternal: "Ruiz" });
  const ana = await member(fixture.organizationId, { name: "Ana" });
  await member(fixture.organizationId, { name: "Inactivo", active: false });
  await member(fixture.organizationId, { name: "Eliminado", deleted: true });
  await member(fixture.organizationId, { name: "Exmiembro", memberActive: false });
  await member(other.organizationId, { name: "Ajeno" });

  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  assert.deepEqual(catalogs.responsibleUsers, [
    { id: ana, label: "Ana" },
    { id: zoe, label: "Zoe Núñez Ruiz" },
  ]);
});

test("the type catalogs list only active entries in display order, with their keys", async () => {
  const fixture = await createValuationFixture();
  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  const [appraisal, property, operation] = await Promise.all([
    prisma.tipoAvaluo.findMany({ where: { BActivo: true }, orderBy: [{ IOrden: "asc" }, { SNombre: "asc" }] }),
    prisma.tipoInmueble.findMany({ where: { BActivo: true }, orderBy: [{ IOrden: "asc" }, { SNombre: "asc" }] }),
    prisma.tipoOperacion.findMany({ where: { BActivo: true }, orderBy: [{ IOrden: "asc" }, { SNombre: "asc" }] }),
  ]);
  assert.ok(appraisal.length > 0 && property.length > 0 && operation.length > 0, "the seed has catalogs");
  assert.deepEqual(catalogs.appraisalTypes, appraisal.map((row) => ({ id: row.IdTipoAvaluo, label: row.SNombre, key: row.SClave })));
  assert.deepEqual(catalogs.propertyTypes, property.map((row) => ({ id: row.IdTipoInmueble, label: row.SNombre, key: row.SClave })));
  assert.deepEqual(catalogs.operationTypes, operation.map((row) => ({ id: row.IdTipoOperacion, label: row.SNombre, key: row.SClave })));
});
