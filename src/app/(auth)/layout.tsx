import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="px-4 py-5 md:px-6">
        <Link href="/">
          <BrandMark />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
