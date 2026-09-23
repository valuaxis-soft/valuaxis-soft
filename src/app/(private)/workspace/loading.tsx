import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-muted/40 p-4" aria-busy="true">
      <span className="sr-only">Cargando avalúo…</span>
      <Skeleton className="h-12 w-full" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-28 shrink-0" />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-full min-h-64" />
        <Skeleton className="hidden h-full lg:block" />
      </div>
    </div>
  );
}
