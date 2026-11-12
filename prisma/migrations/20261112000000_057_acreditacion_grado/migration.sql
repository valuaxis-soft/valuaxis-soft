-- Acreditación por grado (WA-03, 11 nov 2026): la leyenda «DOCUMENTO SIN
-- VALIDEZ OFICIAL» solo se quita con una especialidad, maestría o doctorado en
-- valuación. El revisor registra el nivel y el programa de la constancia al
-- aprobarla (scripts/ops/acreditacion.ts). Columnas nuevas y nulas: NULL en una
-- cuenta ya acreditada quiere decir «nivel pendiente de confirmar» y no cambia
-- nada de lo que hoy imprime. No cambia ninguna columna existente.
ALTER TABLE "devpware_acreditaciones_usuarios"
  ADD COLUMN IF NOT EXISTS "SNivelAcademico" VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS "SProgramaAcademico" VARCHAR(300) NULL,
  ADD COLUMN IF NOT EXISTS "BProgramaValuacion" BOOLEAN NULL;
