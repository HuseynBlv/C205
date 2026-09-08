"use client";

import { useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * A `Button` that navigates via `router.push`, disabling itself for the
 * duration so a rapid double click/tap can't fire the navigation twice —
 * used for the primary "start a request" actions (Request C205, Continue
 * to request), which a plain `<Link>` doesn't guard against.
 */
export function NavButton({
  href,
  children,
  ...props
}: { href: string; children: React.ReactNode } & Omit<ComponentProps<typeof Button>, "asChild" | "onClick">) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      {...props}
      disabled={isPending || props.disabled}
      onClick={() => {
        if (isPending) return;
        startTransition(() => router.push(href));
      }}
    >
      {children}
    </Button>
  );
}
