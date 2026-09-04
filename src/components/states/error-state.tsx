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
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-rose-100">
        <AlertTriangle className="size-5 text-rose-700" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-rose-900">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-rose-700">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-1 border-rose-300 bg-white" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
