import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { channelFor, messageInclude, toChatMessage } from "@/lib/chat-data";
import ChatRoom from "./chat-room";

export default async function ChannelPage({ params, searchParams }: PageProps<"/chat/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const threadId = (await searchParams).thread;
  const channel = await channelFor(id, me).catch(() => null);
  if (!channel) notFound();

  const [latest, members, thread] = await Promise.all([
    prisma.message.findMany({
      where: { channelId: channel.id, parentId: null },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
    typeof threadId === "string"
      ? prisma.message.findFirst({
          where: { id: threadId, channelId: channel.id, parentId: null },
          include: { ...messageInclude, replies: { include: messageInclude, orderBy: { createdAt: "asc" } } },
        })
      : null,
  ]);

  const names = Object.fromEntries(members.map((m) => [m.userId, m.user.name]));
  const title =
    channel.kind === "DM"
      ? (await prisma.channelMember.findFirst({ where: { channelId: channel.id, userId: { not: me.userId } }, include: { user: true } }))?.user.name ?? "Direct message"
      : `# ${channel.name}`;

  return (
    <ChatRoom
      key={channel.id}
      channelId={channel.id}
      title={title}
      meId={me.userId}
      names={names}
      initial={latest.reverse().map(toChatMessage)}
      thread={thread ? { parent: toChatMessage(thread), replies: thread.replies.map(toChatMessage) } : null}
    />
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
