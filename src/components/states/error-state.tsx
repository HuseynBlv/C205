"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Distinct from EmptyState: this is for a real fetch failure, so we never
 * want it to read as "there's nothing here" — production screens must
 * surface the error, not quietly render an empty list.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RotateCw className={cn("size-3.5", isPending && "animate-spin")} />
        {isPending ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
