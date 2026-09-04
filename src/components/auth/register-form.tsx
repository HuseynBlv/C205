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

const registerSchema = z
  .object({
    fullName: z.string().min(2, "Enter your full name."),
    email: z.email("Enter a valid university email address."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async () => {
    // Wired to Supabase Auth (with email verification) in a follow-up step.
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
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            Verifying your email doesn&apos;t grant reservation access — an
            administrator authorizes accounts separately.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                autoComplete="name"
                aria-invalid={Boolean(errors.fullName)}
                {...register("fullName")}
              />
              {errors.fullName ? (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              ) : null}
            </div>
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
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirmPassword)}
                {...register("confirmPassword")}
              />
              {errors.confirmPassword ? (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
