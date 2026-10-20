import "server-only";
import { prisma } from "@/lib/db";

// Channels this member can see (public, or private/DM they're in), minus archived categories' channels.
export function visibleChannelsWhere(me: { workspaceId: string; userId: string }) {
  return {
    workspaceId: me.workspaceId,
    OR: [{ kind: "PUBLIC" as const }, { members: { some: { userId: me.userId } } }],
    NOT: { category: { archivedAt: { not: null } } },
  };
}

// Unread = top-level messages from others since the member last read each channel.
// ponytail: one count per channel; fine for tens of channels, switch to a grouped SQL query past that.
export async function unreadByChannel(me: { workspaceId: string; userId: string }) {
  const channels = await prisma.channel.findMany({
    where: visibleChannelsWhere(me),
    select: { id: true, members: { where: { userId: me.userId }, select: { lastReadAt: true } } },
  });
  return new Map(
    await Promise.all(
      channels.map(async (c) => {
        const lastReadAt = c.members[0]?.lastReadAt;
        const n = await prisma.message.count({
          where: { channelId: c.id, parentId: null, authorId: { not: me.userId }, ...(lastReadAt && { createdAt: { gt: lastReadAt } }) },
        });
        return [c.id, n] as const;
      }),
    ),
  );
}
