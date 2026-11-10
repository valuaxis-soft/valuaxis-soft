import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton, PageSkeleton } from "@/features/dashboard/components/page-skeletons";

export default function AccountLoading() {
  return (
    <PageSkeleton label="Cargando tu cuenta…" width="narrow">
      <PageHeaderSkeleton />
      <Skeleton className="h-72 rounded-2xl" />
    </PageSkeleton>
  );
}
