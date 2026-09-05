import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";
import { BrandMark } from "@/components/layout/brand-mark";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1 pt-16">{children}</main>
      <footer className="border-t border-white/10 bg-[#172e35] text-[#c7d2d5]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between md:px-8">
          <BrandMark tone="dark" />
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Link href="/calendar" className="hover:text-white">
              Calendar
            </Link>
            <Link href="/requests/new" className="hover:text-white">
              Request C205
            </Link>
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-[#93a5ab] md:px-8">
          © {new Date().getFullYear()} University Student Government. C205 is
          located on the 2nd floor; room hours follow published USG
          availability.
        </div>
      </footer>
    </div>
  );
}
