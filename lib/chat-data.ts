import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/app/generated/prisma/client";

export const messageInclude = {
  author: { select: { name: true } },
  attachments: { select: { id: true, name: true, mime: true, size: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.MessageInclude;

type Row = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

// Plain, serializable shape shared by server render, actions and socket events.
export type ChatMessage = {
  id: string;
  channelId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  replyCount: number;
  attachments: { id: string; name: string; mime: string; size: number }[];
};

export function toChatMessage(m: Row): ChatMessage {
  return {
    id: m.id,
    channelId: m.channelId,
    parentId: m.parentId,
    authorId: m.authorId,
    authorName: m.author.name,
    text: (m.body as { text?: string }).text ?? "",
    createdAt: m.createdAt.toISOString(),
    replyCount: m._count.replies,
    attachments: m.attachments,
  };
}

// Loads a channel the member may see: any public channel in their workspace, or a DM they're in.
export async function channelFor(id: string, me: { workspaceId: string; userId: string }) {
  const channel = await prisma.channel.findFirst({
    where: {
      id,
      workspaceId: me.workspaceId,
      OR: [{ kind: "PUBLIC" }, { members: { some: { userId: me.userId } } }],
    },
  });
  if (!channel) throw new Error("Channel not found");
  return channel;
}
