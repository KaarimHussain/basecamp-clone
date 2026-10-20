import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";

// /chat opens General (or the first public channel).
export default async function ChatIndex() {
  const me = await requireMember();
  const channel =
    (await prisma.channel.findFirst({ where: { workspaceId: me.workspaceId, kind: "PUBLIC", name: "General" } })) ??
    (await prisma.channel.findFirst({ where: { workspaceId: me.workspaceId, kind: "PUBLIC" } }));
  if (!channel) return <p className="p-6 text-zinc-500">No channels yet.</p>;
  redirect(`/chat/${channel.id}`);
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
