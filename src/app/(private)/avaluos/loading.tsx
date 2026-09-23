import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ValuationsLoading() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando avalúos…</span>
      <div className="h-16 border-b" />
      <main className="mx-auto max-w-[1760px] px-4 py-8 lg:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="grid gap-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <Card className="rounded-2xl border-0 shadow-md shadow-primary/[0.03]">
          <CardContent className="grid gap-4 p-4 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Skeleton className="h-9 w-full sm:max-w-sm" />
              <Skeleton className="h-9 w-full sm:w-48" />
              <Skeleton className="h-9 w-20" />
            </div>
            <div className="grid gap-3">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
