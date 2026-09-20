-- Migracion 030_validacion_integral_saas
-- Vistas y funciones de consulta para autorizacion; validaciones estructurales y de integridad.
BEGIN;

CREATE OR REPLACE VIEW "devpware_vw_suscripciones_organizaciones_actuales" AS
SELECT
  s."IdSuscripcion", s."IdOrganizacion", s."IdPlan", p."SClave" AS "SClavePlan", p."SNombre" AS "SNombrePlan",
  es."SClave" AS "SClaveEstadoSuscripcion", es."BPermiteUsoPagado",
  s."BEsPrueba", s."DFechaFinPrueba", s."DFechaPeriodoActualInicio", s."DFechaPeriodoActualFin", s."DFechaGraciaFin",
  CASE
    WHEN es."BPermiteUsoPagado"=false THEN false
    WHEN s."BEsPrueba"=true AND s."DFechaFinPrueba" IS NOT NULL AND CURRENT_TIMESTAMP>s."DFechaFinPrueba" THEN false
    WHEN s."DFechaPeriodoActualFin" IS NOT NULL AND CURRENT_TIMESTAMP>s."DFechaPeriodoActualFin" AND (s."DFechaGraciaFin" IS NULL OR CURRENT_TIMESTAMP>s."DFechaGraciaFin") THEN false
    ELSE true
  END AS "BVigenteComercialmente"
FROM "devpware_suscripciones" s
JOIN "devpware_planes" p ON p."IdPlan"=s."IdPlan"
JOIN "devpware_estados_suscripciones" es ON es."IdEstadoSuscripcion"=s."IdEstadoSuscripcion"
WHERE s."DFechaFinalizacion" IS NULL;

CREATE OR REPLACE VIEW "devpware_vw_funcionalidades_organizaciones" AS
WITH base AS (
 SELECT s."IdOrganizacion", f."IdFuncionalidad", f."SClave" AS "SClaveFuncionalidad", f."BRequiereSuscripcionActiva",
        fp."BIncluida", fp."BSinLimite", fp."ILimiteIncluido", fp."SPeriodoLimite",
        v."BVigenteComercialmente"
 FROM "devpware_vw_suscripciones_organizaciones_actuales" v
 JOIN "devpware_suscripciones" s ON s."IdSuscripcion"=v."IdSuscripcion"
 JOIN "devpware_funcionalidades_planes" fp ON fp."IdPlan"=s."IdPlan"
 JOIN "devpware_funcionalidades" f ON f."IdFuncionalidad"=fp."IdFuncionalidad" AND f."BActivo"=true
), concesion AS (
 SELECT DISTINCT ON (c."IdOrganizacion",c."IdFuncionalidad")
   c."IdOrganizacion",c."IdFuncionalidad",c."BConcedida",c."BSinLimite",c."ILimitePersonalizado",c."SPeriodoLimite"
 FROM "devpware_concesiones_funcionalidades" c
 WHERE c."BActiva"=true AND c."DFechaInicio"<=CURRENT_TIMESTAMP AND (c."DFechaFin" IS NULL OR c."DFechaFin">CURRENT_TIMESTAMP)
 ORDER BY c."IdOrganizacion",c."IdFuncionalidad",c."DFechaInicio" DESC,c."IdConcesionFuncionalidad" DESC
)
SELECT b."IdOrganizacion",b."IdFuncionalidad",b."SClaveFuncionalidad",
  COALESCE(c."BConcedida",b."BIncluida")
    AND (b."BRequiereSuscripcionActiva"=false OR b."BVigenteComercialmente"=true) AS "BPermitidaComercialmente",
  COALESCE(c."BSinLimite",b."BSinLimite") AS "BSinLimite",
  CASE WHEN COALESCE(c."BSinLimite",b."BSinLimite") THEN NULL ELSE COALESCE(c."ILimitePersonalizado",b."ILimiteIncluido") END AS "ILimiteAplicado",
  COALESCE(c."SPeriodoLimite",b."SPeriodoLimite") AS "SPeriodoLimite"
FROM base b LEFT JOIN concesion c ON c."IdOrganizacion"=b."IdOrganizacion" AND c."IdFuncionalidad"=b."IdFuncionalidad";

CREATE OR REPLACE FUNCTION "devpware_fn_usuario_tiene_permiso"(
  p_id_usuario INTEGER,
  p_id_organizacion INTEGER,
  p_clave_permiso VARCHAR
) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
WITH miembro AS (
 SELECT m."IdMiembroOrganizacion",m."IdRol"
 FROM "devpware_miembros_organizaciones" m
 WHERE m."IdUsuario"=p_id_usuario AND m."IdOrganizacion"=p_id_organizacion AND m."BActivo"=true
), excepcion AS (
 SELECT e."BConcedido"
 FROM miembro m JOIN "devpware_excepciones_permisos_miembros" e ON e."IdMiembroOrganizacion"=m."IdMiembroOrganizacion"
 JOIN "devpware_permisos" p ON p."IdPermiso"=e."IdPermiso" AND p."SClave"=p_clave_permiso
 WHERE e."BActiva"=true AND e."DFechaInicio"<=CURRENT_TIMESTAMP AND (e."DFechaFin" IS NULL OR e."DFechaFin">CURRENT_TIMESTAMP)
 ORDER BY e."DFechaInicio" DESC,e."IdExcepcionPermisoMiembro" DESC LIMIT 1
), rol AS (
 SELECT EXISTS(
  SELECT 1 FROM miembro m JOIN "devpware_permisos_roles" pr ON pr."IdRol"=m."IdRol"
  JOIN "devpware_permisos" p ON p."IdPermiso"=pr."IdPermiso"
  WHERE p."SClave"=p_clave_permiso AND p."BActivo"=true
 ) AS permitido
)
SELECT COALESCE((SELECT "BConcedido" FROM excepcion),(SELECT permitido FROM rol),false);
$$;

CREATE OR REPLACE FUNCTION "devpware_fn_organizacion_tiene_funcionalidad"(
  p_id_organizacion INTEGER,
  p_clave_funcionalidad VARCHAR
) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
SELECT COALESCE((SELECT v."BPermitidaComercialmente" FROM "devpware_vw_funcionalidades_organizaciones" v WHERE v."IdOrganizacion"=p_id_organizacion AND v."SClaveFuncionalidad"=p_clave_funcionalidad),false);
$$;

CREATE OR REPLACE FUNCTION "devpware_fn_puede_ejecutar_opcion"(
  p_id_usuario INTEGER,
  p_id_organizacion INTEGER,
  p_clave_opcion VARCHAR
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_opcion INTEGER;
  v_falla BOOLEAN;
BEGIN
  SELECT "IdOpcionSistema" INTO v_opcion FROM "devpware_opciones_sistema" WHERE "SClave"=p_clave_opcion AND "BActivo"=true;
  IF v_opcion IS NULL THEN RETURN false; END IF;

  SELECT EXISTS(
    SELECT 1 FROM "devpware_permisos_opciones" po JOIN "devpware_permisos" p ON p."IdPermiso"=po."IdPermiso"
    WHERE po."IdOpcionSistema"=v_opcion AND po."BObligatorio"=true
      AND NOT "devpware_fn_usuario_tiene_permiso"(p_id_usuario,p_id_organizacion,p."SClave")
  ) INTO v_falla;
  IF v_falla THEN RETURN false; END IF;

  SELECT EXISTS(
    SELECT 1 FROM "devpware_funcionalidades_opciones" fo JOIN "devpware_funcionalidades" f ON f."IdFuncionalidad"=fo."IdFuncionalidad"
    WHERE fo."IdOpcionSistema"=v_opcion AND fo."BObligatoria"=true
      AND NOT "devpware_fn_organizacion_tiene_funcionalidad"(p_id_organizacion,f."SClave")
  ) INTO v_falla;
  RETURN NOT v_falla;
END;
$$;

DO $$
DECLARE faltantes TEXT;
BEGIN
 SELECT string_agg(x.nombre,', ') INTO faltantes FROM (VALUES
  ('devpware_proveedores_identidad'),('devpware_identidades_usuarios'),('devpware_tokens_recuperaciones_contrasenas'),
  ('devpware_planes'),('devpware_funcionalidades'),('devpware_funcionalidades_planes'),('devpware_suscripciones'),
  ('devpware_facturas'),('devpware_pagos'),('devpware_contadores_consumos'),('devpware_opciones_sistema')
 ) x(nombre) WHERE to_regclass('public.'||x.nombre) IS NULL;
 IF faltantes IS NOT NULL THEN RAISE EXCEPTION 'Faltan tablas SaaS: %',faltantes; END IF;
END $$;

DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM "devpware_usuarios" WHERE "DFechaEliminacion" IS NULL GROUP BY lower(btrim("SCorreo")) HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Existen correos duplicados sin distinguir mayusculas/minusculas';
 END IF;
 IF EXISTS (SELECT 1 FROM "devpware_suscripciones" WHERE "DFechaFinalizacion" IS NULL GROUP BY "IdOrganizacion" HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Existe mas de una suscripcion actual para una organizacion';
 END IF;
 IF EXISTS (SELECT 1 FROM "devpware_contadores_consumos" WHERE "BSinLimite"=false AND "ILimiteAplicado" IS NOT NULL AND "ICantidadConsumida"+"ICantidadReservada">"ILimiteAplicado") THEN
   RAISE EXCEPTION 'Hay contadores de consumo por encima del limite aplicado';
 END IF;
 IF EXISTS (SELECT 1 FROM "devpware_metodos_pago" WHERE "SUltimosCuatro" IS NOT NULL AND "SUltimosCuatro" !~ '^[0-9]{4}$') THEN
   RAISE EXCEPTION 'Hay metodos de pago con ultimos cuatro invalidos';
 END IF;
END $$;

COMMIT;

-- Consultas manuales de comprobacion (no modifican datos):
SELECT 'tablas_saas' AS "SValidacion", count(*) AS "ICantidad"
FROM pg_tables WHERE schemaname='public' AND tablename IN (
 'devpware_proveedores_identidad','devpware_identidades_usuarios','devpware_tokens_verificacion_correos','devpware_tokens_recuperaciones_contrasenas','devpware_solicitudes_oauth',
 'devpware_planes','devpware_funcionalidades','devpware_funcionalidades_planes','devpware_precios_planes',
 'devpware_suscripciones','devpware_periodos_suscripciones','devpware_cambios_suscripciones','devpware_concesiones_funcionalidades',
 'devpware_proveedores_pago','devpware_clientes_pago','devpware_metodos_pago','devpware_facturas','devpware_conceptos_facturas','devpware_pagos','devpware_intentos_pagos','devpware_eventos_webhooks_pagos',
 'devpware_periodos_consumos','devpware_contadores_consumos','devpware_reservas_consumos','devpware_movimientos_consumos',
 'devpware_opciones_sistema','devpware_permisos_opciones','devpware_funcionalidades_opciones','devpware_excepciones_permisos_miembros'
);

SELECT p."SClave" AS "SPlan",f."SClave" AS "SFuncionalidad",fp."BIncluida",fp."BSinLimite",fp."ILimiteIncluido",fp."SPeriodoLimite"
FROM "devpware_funcionalidades_planes" fp JOIN "devpware_planes" p ON p."IdPlan"=fp."IdPlan" JOIN "devpware_funcionalidades" f ON f."IdFuncionalidad"=fp."IdFuncionalidad"
ORDER BY p."IOrden",f."IOrden";
