import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function PreviewNotice({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Alert className={cn("mb-5 border-accent bg-accent/60", className)}>
      <Info className="size-4 text-accent-foreground" />
      <AlertTitle className="text-accent-foreground">Preview only</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
