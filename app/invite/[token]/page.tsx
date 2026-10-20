import { prisma } from "@/lib/db";
import AcceptForm from "./accept-form";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({ where: { token }, include: { workspace: true } });
  const valid = invite && !invite.acceptedAt && invite.expiresAt > new Date();

  return (
    <main className="mx-auto mt-24 w-full max-w-sm px-4">
      {valid ? (
        <>
          <h1 className="mb-2 text-2xl font-semibold">Join {invite.workspace.name}</h1>
          <p className="mb-6 text-sm text-zinc-500">{invite.email}</p>
          <AcceptForm token={token} />
        </>
      ) : (
        <h1 className="text-xl font-semibold">This invite is invalid or expired.</h1>
      )}
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
