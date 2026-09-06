import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/states/loading-state";

export default function AdminReservationsLoading() {
  return (
    <div>
      <PageHeader title="Reservations" description="Loading reservation activity…" />
      <LoadingState />
    </div>
  );
}
