import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/states/loading-state";

export default function AdminAvailabilityLoading() {
  return (
    <div>
      <PageHeader title="Availability" description="Loading availability…" />
      <LoadingState />
    </div>
  );
}
