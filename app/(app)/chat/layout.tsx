import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createChannel, openDm } from "@/lib/chat";
import { Hash, Plus } from "lucide-react";
import { PresenceDot } from "../realtime";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ActiveLink from "./active-link";

export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const me = await requireMember();
  const [channels, members] = await Promise.all([
    prisma.channel.findMany({
      where: {
        workspaceId: me.workspaceId,
        OR: [{ kind: "PUBLIC" }, { members: { some: { userId: me.userId } } }],
        NOT: { category: { archivedAt: { not: null } } }, // archived category: hide its channel
      },
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
    n > 0 ? <span className="ml-auto rounded-full bg-highlight px-1.5 text-[11px] font-bold leading-5 text-black" aria-label={`${n} unread`}>{n}</span> : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 md:flex-row">
      <aside className="rounded-2xl border bg-card p-3 text-sm shadow-paper md:sticky md:top-18 md:h-[calc(100dvh-5.5rem)] md:w-64 md:shrink-0 md:overflow-y-auto">
        <h2 className="mb-1 px-2 pt-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">Channels</h2>
        <ul className="mb-3 space-y-0.5">
          {publicChannels.map((c) => (
            <li key={c.id}>
              <ActiveLink href={`/chat/${c.id}`}>
                <Hash className="size-4 text-muted-foreground" aria-hidden />
                <span className="truncate">{c.name}</span>
                <Badge n={unread.get(c.id) ?? 0} />
              </ActiveLink>
            </li>
          ))}
        </ul>
        <details className="group mb-5 px-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Plus className="size-3.5" aria-hidden /> New channel
          </summary>
          <form action={createChannel} className="mt-2 flex gap-1">
            <Input name="name" required maxLength={40} placeholder="channel-name" aria-label="Channel name" className="h-8" />
            <Button type="submit" size="sm" variant="outline">Add</Button>
          </form>
        </details>

        <h2 className="mb-1 px-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">Direct messages</h2>
        <ul className="space-y-0.5">
          {members.map((m) => {
            const dm = dmByUser.get(m.userId);
            const label = (
              <>
                <span className="relative">
                  <UserAvatar id={m.userId} name={m.user.name} size="sm" />
                  <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-card p-px"><PresenceDot userId={m.userId} /></span>
                </span>
                <span className="truncate">{m.user.name}</span>
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
                    <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary">{label}</button>
                  </form>
                )}
              </li>
            );
          })}
          {members.length === 0 && <li className="px-2 text-muted-foreground">No one else yet. <Link href="/members" className="underline">Invite</Link></li>}
        </ul>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-paper">{children}</section>
    </div>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
