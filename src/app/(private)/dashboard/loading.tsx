import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-h-dvh bg-background" aria-busy="true">
      <span className="sr-only">Cargando panel…</span>
      <div className="border-b">
        <div className="mx-auto flex h-16 max-w-[1760px] items-center justify-between px-4 lg:px-6">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="mx-auto max-w-[1760px] px-4 py-8 lg:px-6">
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="mb-8 h-4 w-40" />
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    </div>
  );
}
