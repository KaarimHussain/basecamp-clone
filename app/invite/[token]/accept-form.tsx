"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { acceptInvite } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AcceptForm({ token }: { token: string }) {
  const [error, action, pending] = useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required autoComplete="name" autoFocus placeholder="First and last name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Choose a password</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Joining…" : "Create my account"}
      </Button>
    </form>
  );
}
