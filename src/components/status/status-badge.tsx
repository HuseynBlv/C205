import { cn } from "@/lib/utils";
import type { AccountStatus, ReservationStatus } from "@/lib/types";
import {
  CheckCircle2,
  CircleSlash,
  Clock,
  ShieldAlert,
  ShieldX,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";

const reservationStatusConfig: Record<
  ReservationStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-50 text-amber-800 border-amber-200",
    icon: Clock,
  },
  APPROVED: {
    label: "Approved",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-[#f8ebe9] text-[#8a3c37] border-[#eccbc7]",
    icon: XCircle,
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-[#f3efea] text-[#77706a] border-[#e4ddd2]",
    icon: CircleSlash,
  },
};

const accountStatusConfig: Record<
  AccountStatus,
  { label: string; className: string; icon: React.ElementType }
> = {
  PENDING: {
    label: "Pending authorization",
    className: "bg-amber-50 text-amber-800 border-amber-200",
    icon: Clock,
  },
  ACTIVE: {
    label: "Active",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: UserCheck,
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-[#f8ebe9] text-[#8a3c37] border-[#eccbc7]",
    icon: UserX,
  },
  SUSPENDED: {
    label: "Suspended",
    className: "bg-orange-50 text-orange-800 border-orange-200",
    icon: ShieldAlert,
  },
  REMOVED: {
    label: "Removed",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    icon: ShieldX,
  },
};

function BadgeBase({
  label,
  className,
  icon: Icon,
}: {
  label: string;
  className: string;
  icon: React.ElementType;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const config = reservationStatusConfig[status];
  return <BadgeBase {...config} />;
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const config = accountStatusConfig[status];
  return <BadgeBase {...config} />;
}
