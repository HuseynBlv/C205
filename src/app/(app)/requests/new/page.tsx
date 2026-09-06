import { PageHeader } from "@/components/layout/page-header";
import { RequestForm } from "@/components/requests/request-form";
import { ROOM_NAME } from "@/lib/config";
import { useFixtures } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export default async function NewRequestPage() {
  let roomId: string | null = null;
  if (!useFixtures) {
    const supabase = await createClient();
    const { data } = await supabase.from("rooms").select("id").eq("code", "C205").single();
    roomId = data?.id ?? null;
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={`Request ${ROOM_NAME}`}
        description="Fill in the date, time, purpose, and participant count."
      />
      <RequestForm roomId={roomId} />
    </div>
  );
}
