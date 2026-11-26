/**
 * Brings back to the firm's base the comparables that were taken out of a
 * market before they were kept there (V8.8: C-00144 to C-00147, created with
 * «Buscar con IA» and removed from the valuation, did not appear in
 * Comparables). For each comparable set aside in the version a valuation
 * shows today, whose number nothing else of the base holds, a copy of its card
 * is kept in the base without a valuation, with the same number, photos and
 * screenshot (`keepInFirmBase`, what «Eliminar» does now). Idempotent: a
 * number already back is not copied twice. Numbers are never given again.
 *
 *   pnpm comparables:keep-removed            (dry run: says what it would bring back)
 *   pnpm comparables:keep-removed --apply    (writes)
 *
 * Inside the production container:
 *   node --import tsx scripts/comparables-keep-removed.ts [--apply]
 */
import { prisma } from "../src/infrastructure/database/prisma-client";
import { keepInFirmBase, SET_ASIDE_REASONS } from "../src/features/valuations/calculation/market.service";

async function main() {
  const apply = process.argv.includes("--apply");
  const aside = await prisma.comparableAvaluo.findMany({
    where: {
      BIncluido: false,
      SMotivoExclusion: { in: SET_ASIDE_REASONS },
      avaluo: { BActivo: true, DFechaEliminacion: null },
    },
    select: {
      IdComparableAvaluo: true,
      IdVersionAvaluo: true,
      IdUsuarioSeleccion: true,
      propiedad: { select: { IFolioComparable: true } },
      avaluo: { select: { IdOrganizacion: true, IdVersionTrabajo: true, IdVersionFinal: true, SFolio: true } },
    },
    orderBy: { IdComparableAvaluo: "asc" },
  });
  // Only what the valuation shows today: an old version keeps its own.
  const current = aside.filter((row) => row.avaluo && row.IdVersionAvaluo === (row.avaluo.IdVersionTrabajo ?? row.avaluo.IdVersionFinal));
  let kept = 0;
  for (const row of current) {
    const user = { id: row.IdUsuarioSeleccion, organizationId: row.avaluo?.IdOrganizacion ?? 0 };
    // A transaction per comparable that is rolled back on a dry run: it says exactly what --apply writes.
    const added = await prisma.$transaction(async (tx) => {
      const count = await keepInFirmBase(tx, user, [row.IdComparableAvaluo]);
      if (!apply) throw Object.assign(new Error("dry run"), { count });
      return count;
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === "dry run") return (error as Error & { count: number }).count;
      throw error;
    });
    if (added) {
      kept += added;
      console.log(`${apply ? "Devuelto" : "Se devolvería"} a la base: C-${String(row.propiedad.IFolioComparable ?? "").padStart(5, "0")} (avalúo ${row.avaluo?.SFolio ?? "?"})`);
    }
  }
  console.log(`${current.length} comparables quitados de su mercado; ${kept} ${apply ? "devueltos" : "por devolver"} a la base del despacho.${apply ? "" : " Corre con --apply para escribir."}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
