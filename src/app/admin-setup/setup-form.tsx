"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapFirstAdminAction } from "@/app/admin-setup/actions";

const initialState = { ok: false as const, error: "" };

export function AdminSetupForm() {
  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    const result = await bootstrapFirstAdminAction(formData);
    return result.ok ? initialState : result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="space-y-1.5">
        <Label htmlFor="setupCode">Setup code</Label>
        <Input id="setupCode" name="setupCode" type="password" autoComplete="off" required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Verifying…" : "Become the first administrator"}
      </Button>
    </form>
  );
}
