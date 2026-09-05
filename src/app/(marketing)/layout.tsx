import { FloatingNav } from "@/components/marketing/floating-nav";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <FloatingNav />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p>© {new Date().getFullYear()} University Student Government.</p>
          <p>C205 is located on the 2nd floor. Room hours follow published USG availability.</p>
        </div>
      </footer>
    </div>
  );
}
