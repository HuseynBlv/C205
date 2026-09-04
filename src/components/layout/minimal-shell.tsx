import { BrandMark } from "@/components/layout/brand-mark";

export function MinimalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border px-4 py-4 md:px-8">
        <BrandMark />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
