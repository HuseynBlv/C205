import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#2354e6] to-[#14203a] text-[11px] font-bold tracking-tight text-white shadow-sm">
        C2
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-foreground">C205</p>
        <p className="text-[11px] text-muted-foreground">Room reservations</p>
      </div>
    </div>
  );
}
