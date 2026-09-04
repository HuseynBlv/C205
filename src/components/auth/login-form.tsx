"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PreviewNotice } from "@/components/shared/preview-notice";

const loginSchema = z.object({
  email: z.email("Enter a valid university email address."),
  password: z.string().min(1, "Enter your password."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async () => {
    // Wired to Supabase Auth in a follow-up step.
    await new Promise((r) => setTimeout(r, 400));
  });

  return (
    <div>
      <PreviewNotice>
        Authentication isn&apos;t connected yet. This screen shows the intended
        experience; a follow-up step wires it to Supabase Auth.
      </PreviewNotice>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your authorized university account.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@student.edu"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Need an account?{" "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Register
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
