import Link from "next/link";
import { prisma } from "@/lib/db";
import { AuthShell } from "@/components/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import AcceptForm from "./accept-form";

export const metadata = { title: "Join" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({ where: { token }, include: { workspace: true, invitedBy: { select: { name: true } } } });
  const valid = invite && !invite.acceptedAt && invite.expiresAt > new Date();

  if (!valid) {
    return (
      <AuthShell title="This invite has expired" subtitle="Ask whoever invited you to send a fresh link.">
        <Link href="/login" className={buttonVariants({ variant: "outline", className: "w-full" })}>Go to sign in</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={`Join ${invite.workspace.name}`}
      subtitle={<>{invite.invitedBy.name} invited <strong className="text-foreground">{invite.email}</strong>{invite.role === "LEADERSHIP" && " as leadership"}.</>}
    >
      <AcceptForm token={token} />
    </AuthShell>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
