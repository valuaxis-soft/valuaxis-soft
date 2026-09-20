-- Migracion complementaria 022b
-- Estadisticas extendidas para mejorar estimaciones del planificador.

CREATE STATISTICS IF NOT EXISTS devpware_stat_avaluos_org_estado_activo
    (dependencies)
ON "IdOrganizacion", "IdEstadoAvaluo", "BActivo"
FROM public.devpware_avaluos;

CREATE STATISTICS IF NOT EXISTS devpware_stat_publicaciones_fuente_operacion_estado
    (dependencies)
ON "IdFuenteInmobiliaria", "IdTipoOperacion", "IdEstadoPublicacion", "BActivo"
FROM public.devpware_publicaciones_propiedades;

CREATE STATISTICS IF NOT EXISTS devpware_stat_trabajos_cola_estado_disponible
    (dependencies)
ON "SCola", "IdEstadoTrabajo", "DFechaDisponible"
FROM public.devpware_trabajos;