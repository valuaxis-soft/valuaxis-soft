-- Archivar avalúos (2 nov 2026): un avalúo archivado sale de la lista principal sin borrarse.
ALTER TABLE "devpware_avaluos" ADD COLUMN "DFechaArchivo" TIMESTAMPTZ(3);
