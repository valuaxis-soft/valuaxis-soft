import { defineSection } from "../../section-builders";

/**
 * "Métodos alternativos para estimación de valor" (video 7.3, V7.3-19): the
 * regression and the goal programming of every market, in a section of their
 * own instead of a tab of each market. It starts empty: the calculation
 * writes a block per market whose methods print (`motor-estadistico-<tipo>`).
 */
export const metodosAlternativosSection = defineSection({
  id: "metodosAlternativos",
  title: "MÉTODOS ALTERNATIVOS",
  sourceFile: "METODOS ALTERNATIVOS.pdf",
  blocks: [],
});
