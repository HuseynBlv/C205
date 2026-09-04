import { LogOut, Mail, ShieldAlert, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountStatus } from "@/lib/types";

type RestrictedStatus = Extract<AccountStatus, "SUSPENDED" | "REJECTED" | "REMOVED">;

const copy: Record<
  RestrictedStatus,
  { title: string; description: string; icon: React.ElementType; tone: string }
> = {
  SUSPENDED: {
    title: "Your reservation access is suspended",
    description:
      "An administrator has temporarily suspended your ability to request C205. Existing approved reservations are unaffected. Contact USG if you believe this is a mistake.",
    icon: ShieldAlert,
    tone: "bg-orange-50 text-orange-600",
  },
  REJECTED: {
    title: "Your access request was not approved",
    description:
      "An administrator reviewed your account and did not authorize reservation access. Contact USG for details.",
    icon: ShieldX,
    tone: "bg-rose-50 text-rose-600",
  },
  REMOVED: {
    title: "Your account access has been removed",
    description:
      "This account no longer has reservation access. Contact USG if you believe this is a mistake.",
    icon: ShieldX,
    tone: "bg-slate-100 text-slate-600",
  },
};

export function SuspendedAccountState({
  status,
  onSignOut,
}: {
  status: RestrictedStatus;
  onSignOut?: () => void;
}) {
  const { title, description, icon: Icon, tone } = copy[status];
  return (
    <div className="flex min-h-[70vh] flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className={`mx-auto flex size-14 items-center justify-center rounded-full ${tone}`}>
          <Icon className="size-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" size="sm" asChild>
            <a href="mailto:usg@university.edu">
              <Mail className="size-4" />
              Contact USG
            </a>
          </Button>
          {onSignOut ? (
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
