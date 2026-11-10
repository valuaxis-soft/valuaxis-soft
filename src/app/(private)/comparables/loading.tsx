import { ListSkeleton, PageHeaderSkeleton, PageSkeleton } from "@/features/dashboard/components/page-skeletons";

export default function ComparablesLoading() {
  return (
    <PageSkeleton label="Cargando comparables…" width="wide">
      <PageHeaderSkeleton withAction />
      <ListSkeleton rows={10} />
    </PageSkeleton>
  );
}
