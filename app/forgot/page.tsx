"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { requestReset } from "@/lib/actions";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPage() {
  const [sent, action, pending] = useActionState(requestReset, undefined);
  return (
    <AuthShell title="Forgot your password?" subtitle="We'll email you a link to choose a new one.">
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@tfgsolutions.com" />
        </div>
        {sent && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm" role="status">{sent}</p>}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Sending…" : "Send reset link"}
        </Button>
        <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">Back to sign in</Link>
      </form>
    </AuthShell>
  );
}
