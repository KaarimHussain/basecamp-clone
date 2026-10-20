import Link from "next/link";
import { LogIn } from "lucide-react";
import { peekToken } from "@/lib/auth-tokens";
import { magicSignIn } from "@/lib/actions";
import { AuthShell } from "@/components/auth-shell";
import { Button, buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Sign in" };

// The link only signs in after a click: email scanners that pre-fetch links can't burn the token.
export default async function MagicPage({ params }: PageProps<"/magic/[token]">) {
  const { token } = await params;
  const user = await peekToken(token, "MAGIC");
  if (!user) {
    return (
      <AuthShell title="This link has expired" subtitle="Sign-in links work once and expire after 15 minutes.">
        <Link href="/login" className={buttonVariants({ className: "w-full" })}>Back to sign in</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Hi, ${user.name.split(" ")[0]}!`} subtitle={<>Continue as <strong className="text-foreground">{user.email}</strong></>}>
      <form action={magicSignIn}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" size="lg" className="w-full"><LogIn aria-hidden /> Sign in to TFG Workspace</Button>
      </form>
    </AuthShell>
  );
}

// Per-request token check; nothing to prerender.
export const instant = false;
