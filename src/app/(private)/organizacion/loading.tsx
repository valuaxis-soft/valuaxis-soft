import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton, PageSkeleton } from "@/features/dashboard/components/page-skeletons";

export default function OrganizationLoading() {
  return (
    <PageSkeleton label="Cargando…" width="narrow">
      <Skeleton className="mb-6 h-10 w-80 max-w-full rounded-lg" />
      <PageHeaderSkeleton />
      <div className="grid gap-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </PageSkeleton>
  );
}
