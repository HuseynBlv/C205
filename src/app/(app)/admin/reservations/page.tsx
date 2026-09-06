import { AdminReservationsClient } from "@/app/(app)/admin/reservations/reservations-client";
import { getCurrentProfile, isActiveAdmin } from "@/lib/auth/dal";
import { useFixtures } from "@/lib/config";

export default async function AdminReservationsPage() {
  if (useFixtures) {
    return <AdminReservationsClient />;
  }
  const profile = await getCurrentProfile();
  return <AdminReservationsClient isAdmin={isActiveAdmin(profile)} />;
}
