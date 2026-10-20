import Link from "next/link";
import { peekToken } from "@/lib/auth-tokens";
import { AuthShell } from "@/components/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import ResetForm from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  const user = await peekToken(token, "RESET");
  if (!user) {
    return (
      <AuthShell title="This link has expired" subtitle="Reset links work once and expire after an hour.">
        <Link href="/forgot" className={buttonVariants({ className: "w-full" })}>Send a new link</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" subtitle={<>for <strong className="text-foreground">{user.email}</strong></>}>
      <ResetForm token={token} />
    </AuthShell>
  );
}

// Per-request token check; nothing to prerender.
export const instant = false;
