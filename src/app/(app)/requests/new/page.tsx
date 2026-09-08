import { PageHeader } from "@/components/layout/page-header";
import { RequestForm } from "@/components/requests/request-form";
import { ROOM_NAME } from "@/lib/config";
import { useFixtures } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; start?: string; end?: string }>;
}) {
  let roomId: string | null = null;
  if (!useFixtures) {
    const supabase = await createClient();
    const { data } = await supabase.from("rooms").select("id").eq("code", "C205").single();
    roomId = data?.id ?? null;
  }

  // Advisory prefill only (e.g. from selecting a time on /calendar) — not
  // trusted as-is. Loosely shape-checked here just so a malformed query
  // string can't feed a garbage value into the date/time pickers; the
  // form's own day-availability fetch and the real submit_request call
  // both re-validate the actual interval against live data regardless.
  const params = await searchParams;
  const initialSelection = {
    date: params.date && DATE_RE.test(params.date) ? params.date : undefined,
    startTime: params.start && TIME_RE.test(params.start) ? params.start : undefined,
    endTime: params.end && TIME_RE.test(params.end) ? params.end : undefined,
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={`Request ${ROOM_NAME}`}
        description="Fill in the date, time, purpose, and participant count."
      />
      <RequestForm roomId={roomId} initialSelection={initialSelection} />
    </div>
  );
}
