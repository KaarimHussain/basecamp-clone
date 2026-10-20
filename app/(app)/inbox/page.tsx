import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { markAllRead, openNotification } from "@/lib/inbox";
import { NOTIFY_TEXT } from "@/lib/notify";

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export default async function InboxPage() {
  const me = await requireMember();
  const items = await prisma.notification.findMany({
    where: { userId: me.userId },
    include: {
      actor: { select: { name: true } },
      task: { select: { title: true, category: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100, // ponytail: newest 100 only; add cursor paging if people need older history
  });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inbox</h1>
        {unread > 0 && (
          <form action={markAllRead}><button className="text-sm underline">Mark all read</button></form>
        )}
      </header>

      {items.length === 0 ? (
        <p className="text-zinc-500">Nothing yet. You&apos;ll see activity on tasks you follow here.</p>
      ) : (
        <ul className="divide-y rounded border">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <button className={`flex w-full items-start gap-3 p-3 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 ${n.readAt ? "text-zinc-500" : ""}`}>
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "" : "bg-blue-600"}`} />
                  <span className="flex-1">
                    <strong>{n.actor?.name ?? "Someone"}</strong> {NOTIFY_TEXT[n.type] ?? n.type}{" "}
                    <strong>{n.task?.title ?? "a task"}</strong>
                    {n.task && <span className="text-zinc-500"> · {n.task.category.name}</span>}
                    {!n.readAt && <span className="sr-only"> (unread)</span>}
                  </span>
                  <time className="shrink-0 text-xs text-zinc-500">{fmt(n.createdAt)}</time>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
