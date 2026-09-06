import { PageHeader } from "@/components/layout/page-header";
import { CalendarLoadingState } from "@/components/states/loading-state";

export default function CalendarLoading() {
  return (
    <div>
      <PageHeader title="Calendar" description="Loading published availability…" />
      <CalendarLoadingState />
    </div>
  );
}
