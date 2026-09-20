-- Migracion correctiva 022c
-- Retira estadísticas extendidas duplicadas agregadas por 022b.
-- Se conservan las estadísticas originales creadas por 022.

DROP STATISTICS IF EXISTS public.devpware_stat_avaluos_org_estado_activo;

DROP STATISTICS IF EXISTS public.devpware_stat_publicaciones_fuente_operacion_estado;

DROP STATISTICS IF EXISTS public.devpware_stat_trabajos_cola_estado_disponible;