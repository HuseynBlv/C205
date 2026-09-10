"use client";

import { useState, useTransition } from "react";
import { Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { addUsgNotificationRecipientAction, removeUsgNotificationRecipientAction } from "@/lib/admin/actions";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function RecipientRow({ email, removable }: { email: string; removable: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
        <span className="flex items-center gap-2 text-sm text-foreground">
          <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {email}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={!removable || isPending}
          title={removable ? "Remove this recipient" : "At least one recipient must remain"}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await removeUsgNotificationRecipientAction(email);
              if (!result.ok) setError(result.error);
            });
          }}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * Every submission-alert and account-registration email USG gets goes to
 * every address in this list — add/remove hits
 * add_usg_notification_recipient / remove_usg_notification_recipient
 * directly, one row per recipient, never a single shared field. The
 * database itself refuses to drop the last remaining recipient; the
 * "removable" flag here just avoids a round trip to learn that.
 */
export function NotificationRecipientsForm({ recipients }: { recipients: string[] }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const clientError = value.length > 0 && !EMAIL_PATTERN.test(value) ? "Enter a valid email address." : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {recipients.map((email) => (
          <RecipientRow key={email} email={email} removable={recipients.length > 1} />
        ))}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (clientError) {
            setError(clientError);
            return;
          }
          startTransition(async () => {
            const result = await addUsgNotificationRecipientAction(value);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setValue("");
          });
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-recipient-email">Add a recipient</Label>
          <Input
            id="new-recipient-email"
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={Boolean(clientError)}
            placeholder="usg@university.edu"
          />
        </div>
        <Button size="sm" type="submit" disabled={isPending || value.length === 0 || Boolean(clientError)}>
          {isPending ? "Adding…" : "Add recipient"}
        </Button>
      </form>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
