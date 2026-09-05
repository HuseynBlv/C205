import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * ADA University USG's own crest, supplied by the user. It renders as a
 * white shield card on any background (navy header/sidebar or light app
 * chrome) since the shield fill is opaque white with navy line art, so no
 * separate light/dark artwork variant is needed — only the adjacent text
 * needs a `tone` switch.
 */
export function BrandMark({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/usg-crest.png"
        alt="ADA University USG crest"
        width={986}
        height={1027}
        className="h-8 w-auto shrink-0"
        priority
      />
      <div className="leading-tight">
        <p className={cn("text-sm font-semibold", isDark ? "text-[#f2f5f5]" : "text-foreground")}>
          C205
        </p>
        <p className={cn("text-[11px]", isDark ? "text-[#a9bcc1]" : "text-muted-foreground")}>
          Part of usg.az
        </p>
      </div>
    </div>
  );
}
