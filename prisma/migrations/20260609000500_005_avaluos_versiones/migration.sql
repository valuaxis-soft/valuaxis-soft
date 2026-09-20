-- Migracion 005_avaluos_versiones
-- Avaluos, versiones, historial, transiciones y etiquetas.

CREATE TABLE "devpware_avaluos" (
    "IdAvaluo" SERIAL NOT NULL,
    "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
    "IdOrganizacion" INTEGER NOT NULL,
    "IdUsuarioCreador" INTEGER NOT NULL,
    "IdUsuarioResponsable" INTEGER,
    "IdAvaluoOrigen" INTEGER,
    "IdEstadoAvaluo" INTEGER NOT NULL,
    "IdTipoAvaluo" INTEGER NOT NULL,
    "IdTipoInmueble" INTEGER NOT NULL,
    "IdTipoOperacion" INTEGER NOT NULL,
    "SFolio" VARCHAR(80) NOT NULL,
    "STitulo" VARCHAR(220) NOT NULL,
    "SNombreCliente" VARCHAR(220),
    "INumeroVersionActual" INTEGER NOT NULL DEFAULT 1,
    "BBloqueado" BOOLEAN NOT NULL DEFAULT false,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "IVersionFila" INTEGER NOT NULL DEFAULT 1,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    "DFechaConclusion" TIMESTAMPTZ(3),
    "DFechaBloqueo" TIMESTAMPTZ(3),
    "DFechaEliminacion" TIMESTAMPTZ(3),
    CONSTRAINT "devpware_avaluos_pkey" PRIMARY KEY ("IdAvaluo"),
    CONSTRAINT "devpware_avaluos_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
    CONSTRAINT "devpware_avaluos_SFolio_check" CHECK (btrim("SFolio") <> ''),
    CONSTRAINT "devpware_avaluos_STitulo_check" CHECK (btrim("STitulo") <> ''),
    CONSTRAINT "devpware_avaluos_INumeroVersionActual_check" CHECK ("INumeroVersionActual" >= 1),
    CONSTRAINT "devpware_avaluos_IVersionFila_check" CHECK ("IVersionFila" >= 1),
    CONSTRAINT "devpware_avaluos_bloqueo_check" CHECK (("BBloqueado" = false) OR ("DFechaBloqueo" IS NOT NULL)),
    CONSTRAINT "devpware_avaluos_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_avaluos_IdUsuarioCreador_fkey" FOREIGN KEY ("IdUsuarioCreador") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_avaluos_IdUsuarioResponsable_fkey" FOREIGN KEY ("IdUsuarioResponsable") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_avaluos_IdAvaluoOrigen_fkey" FOREIGN KEY ("IdAvaluoOrigen") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "devpware_avaluos_IdEstadoAvaluo_fkey" FOREIGN KEY ("IdEstadoAvaluo") REFERENCES "devpware_estados_avaluos" ("IdEstadoAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_avaluos_IdTipoAvaluo_fkey" FOREIGN KEY ("IdTipoAvaluo") REFERENCES "devpware_tipos_avaluos" ("IdTipoAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_avaluos_IdTipoInmueble_fkey" FOREIGN KEY ("IdTipoInmueble") REFERENCES "devpware_tipos_inmuebles" ("IdTipoInmueble") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_avaluos_IdTipoOperacion_fkey" FOREIGN KEY ("IdTipoOperacion") REFERENCES "devpware_tipos_operaciones" ("IdTipoOperacion") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "devpware_avaluos_IdOrganizacion_SFolio_key" ON "devpware_avaluos" ("IdOrganizacion", "SFolio") WHERE "DFechaEliminacion" IS NULL;
CREATE INDEX "devpware_avaluos_IdOrganizacion_idx" ON "devpware_avaluos" ("IdOrganizacion");
CREATE INDEX "devpware_avaluos_IdUsuarioCreador_idx" ON "devpware_avaluos" ("IdUsuarioCreador");
CREATE INDEX "devpware_avaluos_IdUsuarioResponsable_idx" ON "devpware_avaluos" ("IdUsuarioResponsable");
CREATE INDEX "devpware_avaluos_IdEstadoAvaluo_idx" ON "devpware_avaluos" ("IdEstadoAvaluo");
CREATE INDEX "devpware_avaluos_IdTipoAvaluo_idx" ON "devpware_avaluos" ("IdTipoAvaluo");
CREATE INDEX "devpware_avaluos_IdTipoInmueble_idx" ON "devpware_avaluos" ("IdTipoInmueble");
CREATE INDEX "devpware_avaluos_IdTipoOperacion_idx" ON "devpware_avaluos" ("IdTipoOperacion");
CREATE INDEX "devpware_avaluos_IdAvaluoOrigen_idx" ON "devpware_avaluos" ("IdAvaluoOrigen");
CREATE INDEX "devpware_avaluos_BActivo_idx" ON "devpware_avaluos" ("BActivo");
CREATE INDEX "devpware_avaluos_BBloqueado_idx" ON "devpware_avaluos" ("BBloqueado");
CREATE INDEX "devpware_avaluos_DFechaEliminacion_idx" ON "devpware_avaluos" ("DFechaEliminacion");

CREATE TABLE "devpware_usuarios_avaluos" (
    "IdUsuarioAvaluo" SERIAL NOT NULL,
    "IdAvaluo" INTEGER NOT NULL,
    "IdUsuario" INTEGER NOT NULL,
    "IdRol" INTEGER NOT NULL,
    "BPuedeConsultar" BOOLEAN NOT NULL DEFAULT true,
    "BPuedeEditar" BOOLEAN NOT NULL DEFAULT false,
    "BPuedeRevisar" BOOLEAN NOT NULL DEFAULT false,
    "BPuedeConcluir" BOOLEAN NOT NULL DEFAULT false,
    "BPuedeReabrir" BOOLEAN NOT NULL DEFAULT false,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaAsignacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_usuarios_avaluos_pkey" PRIMARY KEY ("IdUsuarioAvaluo"),
    CONSTRAINT "devpware_usuarios_avaluos_IdAvaluo_IdUsuario_key" UNIQUE ("IdAvaluo", "IdUsuario"),
    CONSTRAINT "devpware_usuarios_avaluos_IdAvaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_usuarios_avaluos_IdUsuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_usuarios_avaluos_IdRol_fkey" FOREIGN KEY ("IdRol") REFERENCES "devpware_roles" ("IdRol") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_usuarios_avaluos_IdAvaluo_idx" ON "devpware_usuarios_avaluos" ("IdAvaluo");
CREATE INDEX "devpware_usuarios_avaluos_IdUsuario_idx" ON "devpware_usuarios_avaluos" ("IdUsuario");
CREATE INDEX "devpware_usuarios_avaluos_IdRol_idx" ON "devpware_usuarios_avaluos" ("IdRol");
CREATE INDEX "devpware_usuarios_avaluos_BActivo_idx" ON "devpware_usuarios_avaluos" ("BActivo");

CREATE TABLE "devpware_versiones_avaluos" (
    "IdVersionAvaluo" SERIAL NOT NULL,
    "IdAvaluo" INTEGER NOT NULL,
    "IdVersionOrigen" INTEGER,
    "IdUsuarioCreador" INTEGER NOT NULL,
    "IdUsuarioFinalizador" INTEGER,
    "IdEstadoVersionAvaluo" INTEGER NOT NULL,
    "INumeroVersion" INTEGER NOT NULL,
    "SMotivoReapertura" VARCHAR(1000),
    "STextoAceptacion" TEXT,
    "BTerminosAceptados" BOOLEAN NOT NULL DEFAULT false,
    "SHashContenido" VARCHAR(128),
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    "DFechaFinalizacion" TIMESTAMPTZ(3),
    "DFechaReapertura" TIMESTAMPTZ(3),
    "DFechaAceptacionTerminos" TIMESTAMPTZ(3),
    CONSTRAINT "devpware_versiones_avaluos_pkey" PRIMARY KEY ("IdVersionAvaluo"),
    CONSTRAINT "devpware_versiones_avaluos_IdAvaluo_INumeroVersion_key" UNIQUE ("IdAvaluo", "INumeroVersion"),
    CONSTRAINT "devpware_versiones_avaluos_INumeroVersion_check" CHECK ("INumeroVersion" >= 1),
    CONSTRAINT "devpware_versiones_avaluos_terminos_check" CHECK (("BTerminosAceptados" = false) OR ("DFechaAceptacionTerminos" IS NOT NULL)),
    CONSTRAINT "devpware_versiones_avaluos_IdAvaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_versiones_avaluos_IdVersionOrigen_fkey" FOREIGN KEY ("IdVersionOrigen") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "devpware_versiones_avaluos_IdUsuarioCreador_fkey" FOREIGN KEY ("IdUsuarioCreador") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_versiones_avaluos_IdUsuarioFinalizador_fkey" FOREIGN KEY ("IdUsuarioFinalizador") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "devpware_versiones_avaluos_IdEstadoVersionAvaluo_fkey" FOREIGN KEY ("IdEstadoVersionAvaluo") REFERENCES "devpware_estados_versiones_avaluos" ("IdEstadoVersionAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_versiones_avaluos_IdAvaluo_idx" ON "devpware_versiones_avaluos" ("IdAvaluo");
CREATE INDEX "devpware_versiones_avaluos_IdVersionOrigen_idx" ON "devpware_versiones_avaluos" ("IdVersionOrigen");
CREATE INDEX "devpware_versiones_avaluos_IdUsuarioCreador_idx" ON "devpware_versiones_avaluos" ("IdUsuarioCreador");
CREATE INDEX "devpware_versiones_avaluos_IdUsuarioFinalizador_idx" ON "devpware_versiones_avaluos" ("IdUsuarioFinalizador");
CREATE INDEX "devpware_versiones_avaluos_IdEstadoVersionAvaluo_idx" ON "devpware_versiones_avaluos" ("IdEstadoVersionAvaluo");
CREATE INDEX "devpware_versiones_avaluos_DFechaFinalizacion_idx" ON "devpware_versiones_avaluos" ("DFechaFinalizacion");

CREATE TABLE "devpware_estados_avaluos_historiales" (
    "IdEstadoAvaluoHistorial" BIGSERIAL NOT NULL,
    "IdAvaluo" INTEGER NOT NULL,
    "IdVersionAvaluo" INTEGER,
    "IdUsuario" INTEGER NOT NULL,
    "IdEstadoAnterior" INTEGER,
    "IdEstadoNuevo" INTEGER NOT NULL,
    "SMotivo" VARCHAR(1000),
    "DFechaCambio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devpware_estados_avaluos_historiales_pkey" PRIMARY KEY ("IdEstadoAvaluoHistorial"),
    CONSTRAINT "devpware_estados_avaluos_historiales_IdAvaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_estados_avaluos_historiales_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "devpware_estados_avaluos_historiales_IdUsuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_estados_avaluos_historiales_IdEstadoAnterior_fkey" FOREIGN KEY ("IdEstadoAnterior") REFERENCES "devpware_estados_avaluos" ("IdEstadoAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "devpware_estados_avaluos_historiales_IdEstadoNuevo_fkey" FOREIGN KEY ("IdEstadoNuevo") REFERENCES "devpware_estados_avaluos" ("IdEstadoAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_estados_avaluos_historiales_IdAvaluo_idx" ON "devpware_estados_avaluos_historiales" ("IdAvaluo");
CREATE INDEX "devpware_estados_avaluos_historiales_IdVersionAvaluo_idx" ON "devpware_estados_avaluos_historiales" ("IdVersionAvaluo");
CREATE INDEX "devpware_estados_avaluos_historiales_IdUsuario_idx" ON "devpware_estados_avaluos_historiales" ("IdUsuario");
CREATE INDEX "devpware_estados_avaluos_historiales_IdEstadoAnterior_idx" ON "devpware_estados_avaluos_historiales" ("IdEstadoAnterior");
CREATE INDEX "devpware_estados_avaluos_historiales_IdEstadoNuevo_idx" ON "devpware_estados_avaluos_historiales" ("IdEstadoNuevo");
CREATE INDEX "devpware_estados_avaluos_historiales_DFechaCambio_idx" ON "devpware_estados_avaluos_historiales" ("DFechaCambio");

CREATE TABLE "devpware_transiciones_estados_avaluos" (
    "IdTransicionEstadoAvaluo" SERIAL NOT NULL,
    "IdEstadoOrigen" INTEGER NOT NULL,
    "IdEstadoDestino" INTEGER NOT NULL,
    "IdPermisoRequerido" INTEGER,
    "BRequiereMotivo" BOOLEAN NOT NULL DEFAULT false,
    "BRequiereConfirmacion" BOOLEAN NOT NULL DEFAULT false,
    "BGeneraVersion" BOOLEAN NOT NULL DEFAULT false,
    "BBloqueaAvaluo" BOOLEAN NOT NULL DEFAULT false,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_transiciones_estados_avaluos_pkey" PRIMARY KEY ("IdTransicionEstadoAvaluo"),
    CONSTRAINT "devpware_transiciones_estados_avaluos_IdEstadoOrigen_IdEstadoDestino_key" UNIQUE ("IdEstadoOrigen", "IdEstadoDestino"),
    CONSTRAINT "devpware_transiciones_estados_avaluos_estados_check" CHECK ("IdEstadoOrigen" <> "IdEstadoDestino"),
    CONSTRAINT "devpware_transiciones_estados_avaluos_IdEstadoOrigen_fkey" FOREIGN KEY ("IdEstadoOrigen") REFERENCES "devpware_estados_avaluos" ("IdEstadoAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_transiciones_estados_avaluos_IdEstadoDestino_fkey" FOREIGN KEY ("IdEstadoDestino") REFERENCES "devpware_estados_avaluos" ("IdEstadoAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_transiciones_estados_avaluos_IdPermisoRequerido_fkey" FOREIGN KEY ("IdPermisoRequerido") REFERENCES "devpware_permisos" ("IdPermiso") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "devpware_transiciones_estados_avaluos_IdEstadoOrigen_idx" ON "devpware_transiciones_estados_avaluos" ("IdEstadoOrigen");
CREATE INDEX "devpware_transiciones_estados_avaluos_IdEstadoDestino_idx" ON "devpware_transiciones_estados_avaluos" ("IdEstadoDestino");
CREATE INDEX "devpware_transiciones_estados_avaluos_IdPermisoRequerido_idx" ON "devpware_transiciones_estados_avaluos" ("IdPermisoRequerido");
CREATE INDEX "devpware_transiciones_estados_avaluos_BActivo_idx" ON "devpware_transiciones_estados_avaluos" ("BActivo");

CREATE TABLE "devpware_etiquetas" (
    "IdEtiqueta" SERIAL NOT NULL,
    "IdOrganizacion" INTEGER NOT NULL,
    "SNombre" VARCHAR(120) NOT NULL,
    "SDescripcion" VARCHAR(500),
    "SColor" VARCHAR(20),
    "BEsSistema" BOOLEAN NOT NULL DEFAULT false,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_etiquetas_pkey" PRIMARY KEY ("IdEtiqueta"),
    CONSTRAINT "devpware_etiquetas_IdOrganizacion_SNombre_key" UNIQUE ("IdOrganizacion", "SNombre"),
    CONSTRAINT "devpware_etiquetas_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_etiquetas_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "devpware_etiquetas_IdOrganizacion_idx" ON "devpware_etiquetas" ("IdOrganizacion");
CREATE INDEX "devpware_etiquetas_BActivo_idx" ON "devpware_etiquetas" ("BActivo");

CREATE TABLE "devpware_etiquetas_avaluos" (
    "IdEtiquetaAvaluo" SERIAL NOT NULL,
    "IdAvaluo" INTEGER NOT NULL,
    "IdEtiqueta" INTEGER NOT NULL,
    "IdUsuarioAsignacion" INTEGER NOT NULL,
    "DFechaAsignacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devpware_etiquetas_avaluos_pkey" PRIMARY KEY ("IdEtiquetaAvaluo"),
    CONSTRAINT "devpware_etiquetas_avaluos_IdAvaluo_IdEtiqueta_key" UNIQUE ("IdAvaluo", "IdEtiqueta"),
    CONSTRAINT "devpware_etiquetas_avaluos_IdAvaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_etiquetas_avaluos_IdEtiqueta_fkey" FOREIGN KEY ("IdEtiqueta") REFERENCES "devpware_etiquetas" ("IdEtiqueta") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_etiquetas_avaluos_IdUsuarioAsignacion_fkey" FOREIGN KEY ("IdUsuarioAsignacion") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_etiquetas_avaluos_IdAvaluo_idx" ON "devpware_etiquetas_avaluos" ("IdAvaluo");
CREATE INDEX "devpware_etiquetas_avaluos_IdEtiqueta_idx" ON "devpware_etiquetas_avaluos" ("IdEtiqueta");
CREATE INDEX "devpware_etiquetas_avaluos_IdUsuarioAsignacion_idx" ON "devpware_etiquetas_avaluos" ("IdUsuarioAsignacion");

CREATE TABLE "devpware_reaperturas_avaluos" (
    "IdReaperturaAvaluo" BIGSERIAL NOT NULL,
    "IdAvaluo" INTEGER NOT NULL,
    "IdVersionAnterior" INTEGER NOT NULL,
    "IdVersionNueva" INTEGER NOT NULL,
    "IdUsuario" INTEGER NOT NULL,
    "SMotivo" VARCHAR(1000) NOT NULL,
    "STextoAceptado" TEXT NOT NULL,
    "BTerminosAceptados" BOOLEAN NOT NULL DEFAULT false,
    "SDireccionIP" VARCHAR(64),
    "SAgenteUsuario" TEXT,
    "DFechaReapertura" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devpware_reaperturas_avaluos_pkey" PRIMARY KEY ("IdReaperturaAvaluo"),
    CONSTRAINT "devpware_reaperturas_avaluos_IdVersionNueva_key" UNIQUE ("IdVersionNueva"),
    CONSTRAINT "devpware_reaperturas_avaluos_versiones_check" CHECK ("IdVersionAnterior" <> "IdVersionNueva"),
    CONSTRAINT "devpware_reaperturas_avaluos_SMotivo_check" CHECK (btrim("SMotivo") <> ''),
    CONSTRAINT "devpware_reaperturas_avaluos_STextoAceptado_check" CHECK (btrim("STextoAceptado") <> ''),
    CONSTRAINT "devpware_reaperturas_avaluos_terminos_check" CHECK ("BTerminosAceptados" = true),
    CONSTRAINT "devpware_reaperturas_avaluos_IdAvaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_reaperturas_avaluos_IdVersionAnterior_fkey" FOREIGN KEY ("IdVersionAnterior") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_reaperturas_avaluos_IdVersionNueva_fkey" FOREIGN KEY ("IdVersionNueva") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_reaperturas_avaluos_IdUsuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_reaperturas_avaluos_IdAvaluo_idx" ON "devpware_reaperturas_avaluos" ("IdAvaluo");
CREATE INDEX "devpware_reaperturas_avaluos_IdVersionAnterior_idx" ON "devpware_reaperturas_avaluos" ("IdVersionAnterior");
CREATE INDEX "devpware_reaperturas_avaluos_IdVersionNueva_idx" ON "devpware_reaperturas_avaluos" ("IdVersionNueva");
CREATE INDEX "devpware_reaperturas_avaluos_IdUsuario_idx" ON "devpware_reaperturas_avaluos" ("IdUsuario");
CREATE INDEX "devpware_reaperturas_avaluos_DFechaReapertura_idx" ON "devpware_reaperturas_avaluos" ("DFechaReapertura");

WITH transiciones(
    "SClaveEstadoOrigen",
    "SClaveEstadoDestino",
    "SClavePermiso",
    "BRequiereMotivo",
    "BRequiereConfirmacion",
    "BGeneraVersion",
    "BBloqueaAvaluo"
) AS (
    VALUES
        ('NUEVO', 'EN_EDICION', 'AVALUO_EDITAR', false, false, false, false),
        ('EN_EDICION', 'EN_REVISION', 'AVALUO_REVISAR', false, true, false, false),
        ('EN_REVISION', 'EN_EDICION', 'AVALUO_EDITAR', true, false, false, false),
        ('EN_REVISION', 'TERMINADO', 'AVALUO_CONCLUIR', false, true, false, true),
        ('TERMINADO', 'REABIERTO', 'AVALUO_REABRIR', true, true, true, false),
        ('REABIERTO', 'EN_EDICION', 'AVALUO_EDITAR', false, false, false, false),
        ('NUEVO', 'CANCELADO', 'AVALUO_EDITAR', true, true, false, true),
        ('EN_EDICION', 'CANCELADO', 'AVALUO_EDITAR', true, true, false, true)
)
INSERT INTO "devpware_transiciones_estados_avaluos" (
    "IdEstadoOrigen",
    "IdEstadoDestino",
    "IdPermisoRequerido",
    "BRequiereMotivo",
    "BRequiereConfirmacion",
    "BGeneraVersion",
    "BBloqueaAvaluo",
    "BActivo",
    "DFechaCreacion",
    "DFechaModificacion"
)
SELECT
    estado_origen."IdEstadoAvaluo",
    estado_destino."IdEstadoAvaluo",
    permiso."IdPermiso",
    transiciones."BRequiereMotivo",
    transiciones."BRequiereConfirmacion",
    transiciones."BGeneraVersion",
    transiciones."BBloqueaAvaluo",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM transiciones
JOIN "devpware_estados_avaluos" estado_origen ON estado_origen."SClave" = transiciones."SClaveEstadoOrigen"
JOIN "devpware_estados_avaluos" estado_destino ON estado_destino."SClave" = transiciones."SClaveEstadoDestino"
JOIN "devpware_permisos" permiso ON permiso."SClave" = transiciones."SClavePermiso"
ON CONFLICT ("IdEstadoOrigen", "IdEstadoDestino") DO UPDATE SET
    "IdPermisoRequerido" = EXCLUDED."IdPermisoRequerido",
    "BRequiereMotivo" = EXCLUDED."BRequiereMotivo",
    "BRequiereConfirmacion" = EXCLUDED."BRequiereConfirmacion",
    "BGeneraVersion" = EXCLUDED."BGeneraVersion",
    "BBloqueaAvaluo" = EXCLUDED."BBloqueaAvaluo",
    "BActivo" = EXCLUDED."BActivo",
    "DFechaModificacion" = CURRENT_TIMESTAMP;
