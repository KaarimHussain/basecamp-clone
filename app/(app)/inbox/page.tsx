import { BellRing, CheckCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { markAllRead, openNotification } from "@/lib/inbox";
import { NOTIFY_TEXT } from "@/lib/notify";
import { relative } from "@/lib/format";
import { UserAvatar } from "@/components/user-avatar";
import { EmptyState, PageContainer, PageHeader, Paper } from "@/components/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Hey!" };

type Item = Awaited<ReturnType<typeof load>>[number];

function load(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    include: {
      actor: { select: { id: true, name: true } },
      task: { select: { title: true, category: { select: { name: true, color: true } } } },
      message: { select: { body: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100, // ponytail: newest 100 only; add cursor paging if people need older history
  });
}

function List({ rows }: { rows: Item[] }) {
  return (
    <Paper className="divide-y overflow-hidden">
      {rows.map((n) => (
        <form key={n.id} action={openNotification}>
          <input type="hidden" name="id" value={n.id} />
          <button className={cn("flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/60", !n.readAt && "bg-accent/40")}>
            {n.actor ? <UserAvatar id={n.actor.id} name={n.actor.name} /> : <span className="size-8 rounded-full bg-muted" />}
            <span className="min-w-0 flex-1 text-sm">
              <span className="block">
                <strong>{n.actor?.name ?? "Someone"}</strong> {NOTIFY_TEXT[n.type] ?? n.type}
                {n.task && <> <strong>{n.task.title}</strong></>}
              </span>
              {n.message && (
                <span className="mt-0.5 line-clamp-1 text-muted-foreground">“{(n.message.body as { text?: string }).text || "📎 a file"}”</span>
              )}
              {n.task && (
                <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: n.task.category.color }} aria-hidden />
                  {n.task.category.name}
                </span>
              )}
              {!n.readAt && <span className="sr-only"> (unread)</span>}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1.5">
              <time className="text-xs text-muted-foreground" dateTime={n.createdAt.toISOString()}>{relative(n.createdAt)}</time>
              {!n.readAt && <span className="size-2 rounded-full bg-primary" aria-hidden />}
            </span>
          </button>
        </form>
      ))}
    </Paper>
  );
}

export default async function InboxPage() {
  const me = await requireMember();
  const items = await load(me.userId);
  const unread = items.filter((n) => !n.readAt);
  const read = items.filter((n) => n.readAt);

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Hey!"
        subtitle={unread.length ? `${unread.length} new update${unread.length > 1 ? "s" : ""} for you` : "You're all caught up."}
        actions={unread.length > 0 && (
          <form action={markAllRead}>
            <Button type="submit" variant="outline" size="sm"><CheckCheck /> Mark all as read</Button>
          </form>
        )}
      />

      {items.length === 0 ? (
        <EmptyState icon={<BellRing />} title="Nothing here yet">Activity on to-dos you follow shows up here.</EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {unread.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">New for you</h2>
              <List rows={unread} />
            </section>
          )}
          {read.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">Previously seen</h2>
              <List rows={read} />
            </section>
          )}
        </div>
      )}
    </PageContainer>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
