/** A catalog like the one a firm could keep for itself; Valuaxis ships none. */
import type { FactorCatalog, FactorLimits } from "../../src/features/valuations/calculation/factor-catalog";

export const SAMPLE_FACTOR_CATALOG: FactorCatalog & { limits: FactorLimits } = {
  factors: {
    NEGOCIACION: [
      { label: "Precio de cierre", value: 1 },
      { label: "Oferta típica", value: 0.95 },
      { label: "Oferta alta", value: 0.9 },
    ],
    UBICACION: [
      { label: "Interior o medianero", value: 1 },
      { label: "Esquina", value: 1.1 },
      { label: "Dos frentes o cabecera", value: 1.15 },
    ],
    ZONA: [
      { label: "Inferior", value: 0.9 },
      { label: "Ligeramente inferior", value: 0.95 },
      { label: "Similar", value: 1 },
      { label: "Superior", value: 1.05 },
      { label: "Muy superior", value: 1.1 },
    ],
    FRENTE: [
      { label: "Menor al típico", value: 0.95 },
      { label: "Típico", value: 1 },
      { label: "Mayor al típico", value: 1.1 },
      { label: "Mucho mayor al típico", value: 1.15 },
    ],
    USO_SUELO: [
      { label: "Habitacional", value: 1 },
      { label: "Mixto", value: 1.05 },
      { label: "Comercial", value: 1.1 },
    ],
    SERVICIOS: [
      { label: "Completos", value: 1 },
      { label: "Incompletos", value: 0.95 },
      { label: "Sin servicios", value: 0.85 },
    ],
    TOPOGRAFIA: [
      { label: "Plana", value: 1 },
      { label: "Pendiente ligera", value: 0.95 },
      { label: "Lomerío suave", value: 0.85 },
      { label: "Accidentada", value: 0.75 },
    ],
    FORMA: [
      { label: "Regular", value: 1 },
      { label: "Irregular", value: 0.95 },
      { label: "Muy irregular", value: 0.9 },
    ],
    CALIDAD: [
      { label: "Económica", value: 0.9 },
      { label: "Media", value: 1 },
      { label: "Buena", value: 1.05 },
      { label: "Lujo", value: 1.15 },
    ],
    // The MEH workbook's 1–10 conservation table, the only numeric table in the books.
    CONSERVACION: [
      { label: "Nuevo", value: 1 },
      { label: "Excelente", value: 0.99 },
      { label: "Muy bueno", value: 0.975 },
      { label: "Bueno", value: 0.92 },
      { label: "Regular", value: 0.82 },
      { label: "Deficiente", value: 0.66 },
      { label: "Malo", value: 0.47 },
    ],
  },
  limits: { factorMin: 0.8, factorMax: 1.2, resultantMin: 0.65, resultantMax: 1.35 },
};
