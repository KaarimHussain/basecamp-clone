import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createChannel, openDm } from "@/lib/chat";
import { PresenceDot } from "../realtime";
import ActiveLink from "./active-link";

export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const me = await requireMember();
  const [channels, members] = await Promise.all([
    prisma.channel.findMany({
      where: { workspaceId: me.workspaceId, OR: [{ kind: "PUBLIC" }, { members: { some: { userId: me.userId } } }] },
      include: {
        members: { include: { user: { select: { name: true } } } },
        category: { select: { position: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.member.findMany({
      where: { workspaceId: me.workspaceId, userId: { not: me.userId } },
      include: { user: { select: { name: true } } },
    }),
  ]);

  // Unread = top-level messages from others since I last read the channel.
  // ponytail: one count query per channel; fine for tens of channels, switch to a grouped SQL query past that.
  const unread = new Map(
    await Promise.all(
      channels.map(async (c) => {
        const lastReadAt = c.members.find((m) => m.userId === me.userId)?.lastReadAt;
        const n = await prisma.message.count({
          where: { channelId: c.id, parentId: null, authorId: { not: me.userId }, ...(lastReadAt && { createdAt: { gt: lastReadAt } }) },
        });
        return [c.id, n] as const;
      }),
    ),
  );

  const publicChannels = channels
    .filter((c) => c.kind === "PUBLIC")
    .sort((a, b) => (a.categoryId ? 1 : 0) - (b.categoryId ? 1 : 0) || (a.category?.position ?? 0) - (b.category?.position ?? 0));
  const dmByUser = new Map(
    channels.filter((c) => c.kind === "DM").map((c) => [c.members.find((m) => m.userId !== me.userId)?.userId, c] as const),
  );

  const Badge = ({ n }: { n: number }) =>
    n > 0 ? <span className="ml-auto rounded-full bg-red-600 px-1.5 text-xs text-white" aria-label={`${n} unread`}>{n}</span> : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
      <aside className="border-b p-4 text-sm md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <h2 className="mb-2 font-semibold text-zinc-500">Channels</h2>
        <ul className="mb-3 space-y-0.5">
          {publicChannels.map((c) => (
            <li key={c.id}>
              <ActiveLink href={`/chat/${c.id}`}>
                <span># {c.name}</span>
                <Badge n={unread.get(c.id) ?? 0} />
              </ActiveLink>
            </li>
          ))}
        </ul>
        <details className="mb-6">
          <summary className="cursor-pointer text-zinc-500">+ New channel</summary>
          <form action={createChannel} className="mt-2 flex gap-1">
            <input name="name" required maxLength={40} placeholder="name" aria-label="Channel name" className="w-full rounded border px-2 py-1" />
            <button className="underline">Add</button>
          </form>
        </details>

        <h2 className="mb-2 font-semibold text-zinc-500">Direct messages</h2>
        <ul className="space-y-0.5">
          {members.map((m) => {
            const dm = dmByUser.get(m.userId);
            const label = (
              <>
                <PresenceDot userId={m.userId} />
                <span>{m.user.name}</span>
                {dm && <Badge n={unread.get(dm.id) ?? 0} />}
              </>
            );
            return (
              <li key={m.userId}>
                {dm ? (
                  <ActiveLink href={`/chat/${dm.id}`}>{label}</ActiveLink>
                ) : (
                  <form action={openDm}>
                    <input type="hidden" name="userId" value={m.userId} />
                    <button className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900">{label}</button>
                  </form>
                )}
              </li>
            );
          })}
          {members.length === 0 && <li className="text-zinc-500">No one else yet. <Link href="/members" className="underline">Invite</Link></li>}
        </ul>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
