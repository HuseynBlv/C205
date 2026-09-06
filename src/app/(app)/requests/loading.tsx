import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/states/loading-state";

export default function RequestsLoading() {
  return (
    <div>
      <PageHeader title="My Requests" description="Loading your requests…" />
      <LoadingState />
    </div>
  );
}
