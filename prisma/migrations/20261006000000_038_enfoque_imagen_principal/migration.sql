-- Encuadre de la imagen principal de la caratula.
--
-- La imagen principal se recorta a la caja de la portada. El valuador elige
-- que parte queda a la vista: un porcentaje por eje, de 0 a 100 (0 = borde
-- izquierdo o superior, 100 = borde derecho o inferior), en
-- "IEnfoqueImagenX" e "IEnfoqueImagenY". Vacio (NULL) = centrada, como se
-- imprimia hasta ahora.
--
-- Se guarda en la caratula de cada version, asi que la copia al reabrir un
-- avaluo lo conserva.
--
-- Es idempotente.

ALTER TABLE "devpware_caratulas_avaluos" ADD COLUMN IF NOT EXISTS "IEnfoqueImagenX" SMALLINT;
ALTER TABLE "devpware_caratulas_avaluos" ADD COLUMN IF NOT EXISTS "IEnfoqueImagenY" SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devpware_caratulas_avaluos_enfoque_imagen_check') THEN
    ALTER TABLE "devpware_caratulas_avaluos"
      ADD CONSTRAINT "devpware_caratulas_avaluos_enfoque_imagen_check" CHECK (
        ("IEnfoqueImagenX" IS NULL OR "IEnfoqueImagenX" BETWEEN 0 AND 100) AND
        ("IEnfoqueImagenY" IS NULL OR "IEnfoqueImagenY" BETWEEN 0 AND 100)
      );
  END IF;
END $$;
