import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this page. Please try again in a moment.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-[#eccbc7] bg-[#f8ebe9] px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-[#f0d6d3]">
        <AlertTriangle className="size-5 text-[#8a3c37]" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-[#6e2f2b]">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-[#8a3c37]">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-1 border-[#eccbc7] bg-white" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
