"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { login, requestMagicLink } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginForm({ linkError }: { linkError: boolean }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [error, loginAction, loggingIn] = useActionState(login, undefined);
  const [sent, linkAction, sending] = useActionState(requestMagicLink, undefined);

  if (mode === "link") {
    return (
      <form action={linkAction} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">We&apos;ll email you a one-time link that signs you in. No password needed.</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="link-email">Email</Label>
          <Input id="link-email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@tfgsolutions.com" />
        </div>
        {sent && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm" role="status">{sent}</p>}
        <Button type="submit" size="lg" disabled={sending}>
          {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
          {sending ? "Sending…" : "Email me a sign-in link"}
        </Button>
        <button type="button" onClick={() => setMode("password")} className="text-sm text-muted-foreground hover:text-foreground">
          Use my password instead
        </button>
      </form>
    );
  }

  return (
    <form action={loginAction} className="flex flex-col gap-4">
      {linkError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          That sign-in link was invalid, expired or already used. Request a new one below.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@tfgsolutions.com" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot" className="text-xs text-muted-foreground hover:text-foreground">Forgot password?</Link>
        </div>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" size="lg" disabled={loggingIn} className="mt-1">
        {loggingIn && <Loader2 className="animate-spin" aria-hidden />}
        {loggingIn ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" onClick={() => setMode("link")}>
        <Mail aria-hidden /> Email me a sign-in link
      </Button>
    </form>
  );
}
