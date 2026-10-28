/**
 * The linear program of the goal programming, solved by HiGHS (MIT licence,
 * University of Edinburgh) compiled to WebAssembly by the `highs` package
 * (MIT). Server only: the module loads its 3.5 MB of WebAssembly once and
 * keeps it; next.config lists it in `serverExternalPackages` so Node loads it
 * from node_modules with its .wasm beside it.
 *
 * The model is written in CPLEX LP format in the order LINGO reads the
 * appraiser's model (objective p1 + n1 + p2 + n2…, then one row per
 * comparable), which gives LINGO's vertex when the optimum is not unique.
 */
import loadHighs from "highs";

import type { GoalProgramProblem, GoalProgramSolution } from "../engine/goal-programming";

type Highs = Awaited<ReturnType<typeof loadHighs>>;

let loading: Promise<Highs> | null = null;

/** HiGHS, loaded once per process. A failed load is retried on the next call. */
function highs(): Promise<Highs> {
  loading ??= loadHighs().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** A number as the LP format reads it: no thousands, exponent when tiny or huge. */
const lpNumber = (value: number) => String(Math.abs(value));

/** "min Σ (pᵢ + nᵢ) s.a. Σⱼ xᵢⱼ·bⱼ + pᵢ − nᵢ = yᵢ", every variable ≥ 0 (the LP format's default bound). */
export function goalProgramLp({ x, y }: GoalProgramProblem): string {
  const objective = y.map((_, i) => `p${i} + n${i}`).join(" + ");
  const rows = x.map((row, i) => {
    const terms = row
      .map((value, j) => (value === 0 ? "" : ` ${value < 0 ? "-" : "+"} ${lpNumber(value)} b${j}`))
      .join("");
    return ` c${i}:${terms} + p${i} - n${i} = ${y[i]}`;
  });
  return `Minimize\n obj: ${objective}\nSubject To\n${rows.join("\n")}\nEnd\n`;
}

/** Solves the goal program; a failure comes back as a reason, never as an exception. */
export async function solveGoalProgram(problem: GoalProgramProblem): Promise<GoalProgramSolution> {
  try {
    const solver = await highs();
    const result = solver.solve(goalProgramLp(problem), { output_flag: false });
    if (result.Status !== "Optimal") {
      return { status: "FAILED", message: `El modelo de programación por metas no tiene óptimo (${result.Status}). Revisa los datos.` };
    }
    const column = (name: string) => result.Columns[name]?.Primal ?? 0;
    const k = problem.x[0]?.length ?? 0;
    return {
      status: "OPTIMAL",
      objective: result.ObjectiveValue,
      coefficients: Array.from({ length: k }, (_, j) => column(`b${j}`)),
      positive: problem.y.map((_, i) => column(`p${i}`)),
      negative: problem.y.map((_, i) => column(`n${i}`)),
    };
  } catch (error) {
    return { status: "FAILED", message: `No se pudo resolver la programación por metas: ${error instanceof Error ? error.message : String(error)}` };
  }
}
