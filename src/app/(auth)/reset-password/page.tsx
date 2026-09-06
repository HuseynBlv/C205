import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getVerifiedUser } from "@/lib/auth/dal";
import { useFixtures } from "@/lib/config";

export const metadata: Metadata = { title: "Set new password" };

export default async function ResetPasswordPage() {
  // A real recovery session only exists after /auth/confirm's verifyOtp
  // call succeeds. Anyone who lands here without one (an expired link, a
  // bookmarked URL, fixtures mode) gets sent to request a fresh link
  // instead of a form that would just fail.
  const user = useFixtures ? { id: "fixture" } : await getVerifiedUser();

  if (!user) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <p className="text-sm text-muted-foreground">
            This password reset link is invalid or has expired.
          </p>
          <Button size="sm" asChild>
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <ResetPasswordForm />;
}
