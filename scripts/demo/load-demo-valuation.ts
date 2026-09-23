/**
 * Loads a complete valuation from a JSON spec into the LOCAL database, for
 * demos and prototypes of the dictamen. Creates an organization, an
 * administrator with a session and the valuation, then uploads the images and
 * saves the document through the app's own API, exactly as the editor does.
 *
 *   pnpm exec tsx --env-file=.env scripts/demo/load-demo-valuation.ts <spec.json> [baseUrl]
 *
 * The app must be running at baseUrl (default http://localhost:3000). Prints
 * the session cookie and the dictamen URL. Specs hold client data and live
 * outside the repository (docs/fase0/dump/ is gitignored).
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import type { DatosImageResponse, DocumentHeaderImageResponse, UploadResponse } from "../../src/lib/api-client";
import {
  mergeDocumentHeaderImage,
  initialSectionsFor,
} from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload, valuationMetaPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { resequenceSections } from "../../src/features/valuations/components/workspace/model/section-numbering";
import { ensureBlockContentIntegrity } from "../../src/features/valuations/components/workspace/model/section-content";
import type { AppSection, Apartado, Block, CaratulaFormData, Concept, ImageContent, TableContent } from "../../src/features/valuations/model";
import { defineSection } from "../../src/features/valuations/section-builders";
import { updateCompanyHeaderFields } from "../../src/features/valuations/services/caratula-company-header";
import { formatMexicanPhone } from "../../src/features/valuations/services/caratula-validation";
import { resolveContentLayout } from "../../src/features/valuations/services/content-layout";
import type { ValuationMeta } from "../../src/features/valuations/services/valuation-constants";
import { prisma } from "../../src/infrastructure/database/prisma-client";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";

type SpecImage = { file: string; title: string };
type SpecBlock = {
  id: string;
  title: string;
  concepts?: [string, string][];
  images?: SpecImage[];
};
type SpecSection = {
  id: string;
  enabled?: boolean;
  replaceBlocks?: boolean;
  /** Concept label → value, anywhere in the section. */
  fill?: Record<string, string>;
  /** Block id → value of its "Observaciones" concept. */
  fillObservations?: Record<string, string>;
  /** Block or apartado id → concepts to add. */
  append?: Record<string, [string, string][]>;
  /** Part of a table id → rows. */
  tables?: Record<string, string[][]>;
  blocks?: SpecBlock[];
  datosImages?: (SpecImage & { blockId: string })[];
};
type Spec = {
  organizationName: string;
  userName: string;
  valuation: ValuationMeta & {
    title: string;
    propertyTypeKey: string;
    appraisalTypeKey: string;
    operationTypeKey: string;
  };
  caratula: CaratulaFormData;
  headerImage?: string;
  coverImage?: string;
  sections: SpecSection[];
};

const MIME_BY_EXTENSION: Record<string, string> = { ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function assertLocalDatabase() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Solo se cargan demos en una base local (DATABASE_URL debe apuntar a localhost).");
  }
}

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

async function createAccount(spec: Spec) {
  const suffix = randomUUID().slice(0, 8);
  const [userState, orgState, valuationState, appraisalType, propertyType, operationType, role] = await Promise.all([
    prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "ACTIVO" } }),
    prisma.estadoOrganizacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
    prisma.estadoAvaluo.findUniqueOrThrow({ where: { SClave: "NUEVO" } }),
    prisma.tipoAvaluo.findFirstOrThrow({ where: { SClave: spec.valuation.appraisalTypeKey } }),
    prisma.tipoInmueble.findFirstOrThrow({ where: { SClave: spec.valuation.propertyTypeKey } }),
    prisma.tipoOperacion.findFirstOrThrow({ where: { SClave: spec.valuation.operationTypeKey } }),
    prisma.rol.findUniqueOrThrow({ where: { SClave: "ADMINISTRADOR" } }),
  ]);
  const now = new Date();
  const organization = await prisma.organizacion.create({
    data: {
      IdEstadoOrganizacion: orgState.IdEstadoOrganizacion,
      SNombre: spec.organizationName,
      SSlug: `demo-${suffix}`,
      STipoAmbito: "PERSONAL",
      DFechaModificacion: now,
    },
  });
  const user = await prisma.usuario.create({
    data: {
      IdEstadoUsuario: userState.IdEstadoUsuario,
      SNombre: spec.userName,
      SCorreo: `demo-${suffix}@example.test`,
      BCorreoVerificado: true,
      DFechaVerificacionCorreo: now,
      DFechaModificacion: now,
    },
  });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: organization.IdOrganizacion, IdUsuario: user.IdUsuario, IdRol: role.IdRol, DFechaModificacion: now },
  });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: user.IdUsuario,
      IdOrganizacion: organization.IdOrganizacion,
      STokenHash: hashToken(token),
      DFechaExpiracion: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      DFechaUltimaActividad: now,
    },
  });
  const valuation = await prisma.avaluo.create({
    data: {
      IdOrganizacion: organization.IdOrganizacion,
      IdUsuarioCreador: user.IdUsuario,
      IdEstadoAvaluo: valuationState.IdEstadoAvaluo,
      IdTipoAvaluo: appraisalType.IdTipoAvaluo,
      IdTipoInmueble: propertyType.IdTipoInmueble,
      IdTipoOperacion: operationType.IdTipoOperacion,
      SFolio: spec.valuation.folio,
      STitulo: spec.valuation.title,
      SNombreCliente: spec.valuation.client,
      DFechaModificacion: now,
    },
  });
  return { publicId: valuation.UIdentificadorPublico, token };
}

function apiClient(baseUrl: string, token: string, specDir: string) {
  const headers = { cookie: `${AUTH_SESSION_COOKIE}=${token}`, origin: baseUrl };

  async function send<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}/api${url}`, { ...init, headers: { ...headers, ...init.headers } });
    const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
    if (!response.ok) throw new Error(`${init.method ?? "GET"} ${url}: ${response.status} ${body.error ?? ""}`);
    return body.data as T;
  }

  async function upload<T>(url: string, file: string, fields: Record<string, string> = {}) {
    const bytes = await readFile(path.resolve(specDir, file));
    const form = new FormData();
    const type = MIME_BY_EXTENSION[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    form.append("file", new Blob([bytes], { type }), path.basename(file));
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return send<T>(url, { method: "POST", body: form });
  }

  const putJson = <T>(url: string, body: unknown) =>
    send<T>(url, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

  return { upload, putJson };
}

function containers(section: AppSection): (Block | Apartado)[] {
  return section.blocks.flatMap((block) => [block, ...block.apartados]);
}

async function applySection(
  section: AppSection,
  spec: SpecSection,
  api: ReturnType<typeof apiClient>,
  publicId: string,
  warnings: string[],
): Promise<AppSection> {
  const touched = new Set<string>();
  let result: AppSection = structuredClone(section);
  if (spec.enabled !== undefined) result.enabled = spec.enabled;
  if (spec.replaceBlocks) result.blocks = [];

  for (const [label, value] of Object.entries(spec.fill ?? {})) {
    const concept = containers(result).flatMap((container) => container.concepts).find((item) => normalize(item.label) === normalize(label));
    if (concept) concept.value = value;
    else warnings.push(`${result.id}: no existe el concepto "${label}"`);
  }

  for (const [blockId, value] of Object.entries(spec.fillObservations ?? {})) {
    const concept = result.blocks.find((block) => block.id === blockId)?.concepts.find((item) => normalize(item.label) === "observaciones");
    if (concept) concept.value = value;
    else warnings.push(`${result.id}: el bloque ${blockId} no tiene Observaciones`);
  }

  for (const [containerId, concepts] of Object.entries(spec.append ?? {})) {
    const container = containers(result).find((item) => item.id === containerId);
    if (!container) {
      warnings.push(`${result.id}: no existe el contenedor ${containerId}`);
      continue;
    }
    container.concepts.push(...concepts.map(([label, value], index): Concept => ({ id: `${containerId}-demo-${index + 1}`, label, value, enabled: true })));
    touched.add(containerId);
  }

  for (const [key, rows] of Object.entries(spec.tables ?? {})) {
    const table = containers(result).flatMap((container) => container.tables).find((item) => item.id.includes(key)) as (TableContent & { rows?: string[][] }) | undefined;
    if (table) table.rows = rows;
    else warnings.push(`${result.id}: no existe la tabla ${key}`);
  }

  for (const image of spec.datosImages ?? []) {
    const block = result.blocks.find((item) => item.id === image.blockId);
    if (!block) {
      warnings.push(`${result.id}: no existe el bloque ${image.blockId}`);
      continue;
    }
    const uploaded = await api.upload<DatosImageResponse>(`/avaluos/${publicId}/datos/imagenes`, image.file, { blockId: image.blockId });
    block.images.push({ id: uploaded.id, title: image.title, src: uploaded.url ?? "", enabled: true });
    touched.add(block.id);
  }

  for (const specBlock of spec.blocks ?? []) {
    const images: ImageContent[] = [];
    for (const image of specBlock.images ?? []) {
      const uploaded = await api.upload<UploadResponse>("/uploads", image.file);
      images.push({ id: `img-${uploaded.id}`, title: image.title, src: uploaded.url ?? "", enabled: true });
    }
    const [block] = defineSection({
      id: result.id,
      title: result.title,
      sourceFile: "",
      blocks: [{ id: specBlock.id, title: specBlock.title, concepts: specBlock.concepts }],
    }).blocks;
    result.blocks.push({ ...block, images });
    touched.add(block.id);
  }

  // Same reconciliation the editor runs after adding content, so new items
  // show up in the block layout.
  result = {
    ...result,
    blocks: result.blocks.map((block) => {
      const apartados = block.apartados.map((apartado) =>
        touched.has(apartado.id) ? { ...apartado, contentLayout: resolveContentLayout(apartado) } : apartado,
      );
      const changed = touched.has(block.id) || apartados.some((apartado) => touched.has(apartado.id));
      return changed ? ensureBlockContentIntegrity({ ...block, apartados }) : block;
    }),
  };
  return result;
}

async function loadDemoValuation() {
  const [specPath, baseUrl = "http://localhost:3000"] = process.argv.slice(2);
  if (!specPath) throw new Error("Uso: load-demo-valuation.ts <spec.json> [baseUrl]");
  assertLocalDatabase();

  const specDir = path.dirname(path.resolve(specPath));
  const spec = JSON.parse(await readFile(specPath, "utf8")) as Spec;
  const { publicId, token } = await createAccount(spec);
  const api = apiClient(baseUrl, token, specDir);
  const warnings: string[] = [];

  let sections = initialSectionsFor(null);
  for (const sectionSpec of spec.sections) {
    const index = sections.findIndex((section) => section.id === sectionSpec.id);
    if (index === -1) {
      warnings.push(`no existe la sección ${sectionSpec.id}`);
      continue;
    }
    sections[index] = await applySection(sections[index], sectionSpec, api, publicId, warnings);
  }

  if (spec.headerImage) {
    const image = await api.upload<DocumentHeaderImageResponse>(`/avaluos/${publicId}/caratula/imagen-encabezado`, spec.headerImage);
    sections = mergeDocumentHeaderImage(sections, image);
  }
  if (spec.coverImage) await api.upload<unknown>(`/avaluos/${publicId}/caratula/imagen-principal`, spec.coverImage);

  const caratula = { ...spec.caratula, telefonoEmpresa: formatMexicanPhone(spec.caratula.telefonoEmpresa) };
  sections = resequenceSections(
    updateCompanyHeaderFields(sections, {
      tituloInmueble: caratula.tituloInmueble,
      direccionEmpresa: caratula.direccionEmpresa,
      telefonoEmpresa: caratula.telefonoEmpresa,
      correoEmpresa: caratula.correoEmpresa,
    }),
  );

  await api.putJson(`/avaluos/${publicId}/full`, {
    ...valuationMetaPayload(spec.valuation),
    sections: buildSectionsPayload(sections),
    caratula,
  });

  for (const warning of warnings) console.warn(`Aviso: ${warning}`);
  console.log(JSON.stringify({
    publicId,
    cookie: `${AUTH_SESSION_COOKIE}=${token}`,
    dictamen: `${baseUrl}/avaluos/${publicId}/dictamen`,
  }, null, 2));
}

loadDemoValuation()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
