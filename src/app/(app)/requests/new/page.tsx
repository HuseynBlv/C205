import { PageHeader } from "@/components/layout/page-header";
import { RequestForm } from "@/components/requests/request-form";
import { ROOM_NAME } from "@/lib/config";

export default function NewRequestPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={`Request ${ROOM_NAME}`}
        description="Fill in the date, time, purpose, and participant count."
      />
      <RequestForm />
    </div>
  );
}
