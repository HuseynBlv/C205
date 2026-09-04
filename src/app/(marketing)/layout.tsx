import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand-mark";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 md:px-6">
          <Link href="/">
            <BrandMark />
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Create account</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p>© {new Date().getFullYear()} University Student Government.</p>
          <p>C205 is located on the 2nd floor. Room hours follow published USG availability.</p>
        </div>
      </footer>
    </div>
  );
}
