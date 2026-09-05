import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";

/**
 * Minimal floating navigation for the marketing site. It stays as a small
 * dark glass pill regardless of what scrolls beneath it, so it reads
 * correctly over both the dark hero and the light sections that follow.
 */
export function FloatingNav() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4 md:top-6">
      <nav
        className="pointer-events-auto flex w-full max-w-3xl items-center justify-between gap-4 rounded-full border border-white/10 bg-[#0a0d14]/70 px-4 py-2.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md"
        aria-label="Primary"
      >
        <Link href="/" className="shrink-0">
          <BrandMark tone="dark" />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/login"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-[#e8e6df] transition-colors hover:bg-white/10"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-[#0a0d14] transition-colors hover:bg-white/90"
          >
            Create account
          </Link>
        </div>
      </nav>
    </div>
  );
}
