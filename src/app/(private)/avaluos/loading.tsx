import { ListSkeleton, PageHeaderSkeleton, PageSkeleton } from "@/features/dashboard/components/page-skeletons";

export default function ValuationsLoading() {
  return (
    <PageSkeleton label="Cargando avalúos…">
      <PageHeaderSkeleton withAction />
      <ListSkeleton />
    </PageSkeleton>
  );
}
