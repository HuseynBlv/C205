"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateUsgNotificationEmailAction } from "@/lib/admin/actions";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function UsgEmailForm({ currentEmail }: { currentEmail: string }) {
  const [value, setValue] = useState(currentEmail);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const clientError = value.length > 0 && !EMAIL_PATTERN.test(value) ? "Enter a valid email address." : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        if (clientError) {
          setError(clientError);
          return;
        }
        startTransition(async () => {
          const result = await updateUsgNotificationEmailAction(value);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSaved(true);
        });
      }}
    >
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="usg-email">USG notification email</Label>
        <Input
          id="usg-email"
          type="email"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          aria-invalid={Boolean(clientError)}
          placeholder="usg@university.edu"
        />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {saved ? (
        <Alert>
          <AlertDescription>Saved. Future submission notifications go here.</AlertDescription>
        </Alert>
      ) : null}
      <Button size="sm" type="submit" disabled={isPending || Boolean(clientError)}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
