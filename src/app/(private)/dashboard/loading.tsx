import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/features/dashboard/components/page-skeletons";

export default function DashboardLoading() {
  return (
    <PageSkeleton label="Cargando tu panel…">
      <div className="mb-6 rounded-2xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-8">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-3 h-8 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="mb-6 h-36 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid content-start gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <div className="grid content-start gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    </PageSkeleton>
  );
}
