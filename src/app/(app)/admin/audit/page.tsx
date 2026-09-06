import { PageHeader } from "@/components/layout/page-header";
import { RequireAdmin } from "@/components/admin/require-admin";
import { PreviewNotice } from "@/components/shared/preview-notice";
import { ErrorState } from "@/components/states/error-state";
import { EmptyState } from "@/components/states/empty-state";
import { History } from "lucide-react";
import { getCurrentProfile, isActiveAdmin } from "@/lib/auth/dal";
import { useFixtures } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { AuditList, type AuditEventRow } from "@/app/(app)/admin/audit/audit-list";

async function RealAuditLog() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_events")
    .select("id, occurred_at, actor_role, action, entity_table, entity_id, reason, actor:profiles(full_name)")
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (error) {
    return <ErrorState description="We couldn't load the audit trail just now." />;
  }

  const rows: AuditEventRow[] = (data ?? []).map((e) => ({
    id: e.id,
    occurredAt: e.occurred_at,
    actorName: (e.actor as { full_name: string } | null)?.full_name ?? null,
    actorRole: e.actor_role,
    action: e.action,
    entityTable: e.entity_table,
    entityId: e.entity_id,
    reason: e.reason,
  }));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Reservation decisions and administrative changes will appear here as they happen."
      />
    );
  }

  return <AuditList events={rows} />;
}

export default async function AdminAuditPage() {
  if (useFixtures) {
    return (
      <RequireAdmin>
        <PageHeader title="Audit" description="Reservation and administrative history." />
        <PreviewNotice>
          Fixture preview — set NEXT_PUBLIC_USE_FIXTURES=false to see the
          real audit trail.
        </PreviewNotice>
        <EmptyState icon={History} title="No activity in this preview" description="" />
      </RequireAdmin>
    );
  }

  const profile = await getCurrentProfile();
  const admin = isActiveAdmin(profile);

  return (
    <RequireAdmin isAdmin={admin}>
      <AutoRefresh />
      <PageHeader
        title="Audit"
        description="Every reservation decision and administrative change, most recent first."
      />
      <RealAuditLog />
    </RequireAdmin>
  );
}
