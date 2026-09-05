import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";

/**
 * Fixed, full-width navy header — matching usg.az's own header structure
 * (logo, primary nav, a solid CTA on the right) rather than a floating
 * glass pill.
 */
export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#172e35]">
      <nav
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-8"
        aria-label="Primary"
      >
        <Link href="/" className="shrink-0">
          <BrandMark tone="dark" />
        </Link>
        <div className="flex items-center gap-1.5">
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-[#e6ebec] transition-colors hover:bg-white/10"
          >
            Sign in
          </Link>
          <Button asChild size="sm" variant="secondary" className="bg-[#eef2f3] text-[#172e35] hover:bg-white">
            <Link href="/register">Create account</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
