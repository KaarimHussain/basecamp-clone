"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateAccount } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function AccountForm({ name }: { name: string }) {
  const [message, action, pending] = useActionState(updateAccount, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={name} required maxLength={80} />
      </div>
      <Separator />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Change password <span className="font-normal text-muted-foreground">(optional)</span></legend>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current">Current password</Label>
          <Input id="current" name="current" type="password" autoComplete="current-password" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="next">New password</Label>
          <Input id="next" name="next" type="password" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
        </div>
      </fieldset>
      {message && <p role="status" className="rounded-md bg-secondary px-3 py-2 text-sm">{message}</p>}
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
