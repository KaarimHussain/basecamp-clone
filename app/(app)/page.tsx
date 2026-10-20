import Link from "next/link";
import { CalendarClock, CheckCircle2, CircleDot, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { activityText } from "@/lib/activity";
import { AvatarStack, UserAvatar } from "@/components/user-avatar";
import { EmptyState, PageContainer, Paper, SectionTitle } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { relative } from "@/lib/format";

export const metadata = { title: "Home" };

export default async function Home() {
  const me = await requireMember();
  const today = new Date(new Date().toISOString().slice(0, 10));

  const [categories, activity] = await Promise.all([
    prisma.category.findMany({
      where: { workspaceId: me.workspaceId, archivedAt: null },
      orderBy: { position: "asc" },
      include: {
        tasks: {
          where: { archivedAt: null },
          select: { status: true, dueAt: true, assignees: { select: { user: { select: { id: true, name: true } } } } },
        },
      },
    }),
    prisma.activity.findMany({
      where: { task: { workspaceId: me.workspaceId, archivedAt: null } },
      include: { actor: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <PageContainer size="wide">
      <section className="mb-10 text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
        </p>
        <h1 className="mt-1 text-4xl font-extrabold sm:text-5xl">
          Hey, {me.user.name.split(" ")[0]}!
        </h1>
        <p className="mt-2 text-muted-foreground">Here&apos;s what&apos;s happening across {me.workspace.name}.</p>
      </section>

      <SectionTitle
        action={me.role === "OWNER" && (
          <Link href="/categories" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Plus /> New category
          </Link>
        )}
      >
        Categories
      </SectionTitle>

      <ul className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const open = c.tasks.filter((t) => t.status !== "DONE");
          const done = c.tasks.length - open.length;
          const overdue = open.filter((t) => t.dueAt && t.dueAt < today).length;
          const people = [...new Map(open.flatMap((t) => t.assignees.map((a) => [a.user.id, a.user]))).values()];
          const pct = c.tasks.length ? Math.round((done / c.tasks.length) * 100) : 0;
          return (
            <li key={c.id}>
              <Link
                href={`/c/${c.id}`}
                className="group block h-full overflow-hidden rounded-2xl border bg-card shadow-paper transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="h-2" style={{ background: c.color }} />
                <div className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xl font-bold group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">{c.name}</h3>
                    <AvatarStack people={people} />
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1"><CircleDot className="size-4" aria-hidden /><dt className="sr-only">Open</dt><dd>{open.length} open</dd></div>
                    <div className="flex items-center gap-1"><CheckCircle2 className="size-4" aria-hidden /><dt className="sr-only">Done</dt><dd>{done} done</dd></div>
                    {overdue > 0 && (
                      <div className="flex items-center gap-1 font-medium text-destructive"><CalendarClock className="size-4" aria-hidden /><dt className="sr-only">Overdue</dt><dd>{overdue} overdue</dd></div>
                    )}
                  </dl>
                  <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% complete`}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c.color }} />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <SectionTitle>Latest activity</SectionTitle>
      {activity.length === 0 ? (
        <EmptyState title="Nothing yet">Activity on tasks shows up here.</EmptyState>
      ) : (
        <Paper className="divide-y">
          {activity.map((a) => (
            <Link key={a.id} href={`/t/${a.task.id}`} className="flex items-center gap-3 px-5 py-3 text-sm transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-secondary/60">
              <UserAvatar id={a.actor.id} name={a.actor.name} size="sm" />
              <p className="min-w-0 flex-1 truncate">
                <strong>{a.actor.name}</strong> {activityText(a.action, a.meta)} <span className="text-muted-foreground">on</span>{" "}
                <span className="font-medium">{a.task.title}</span>
              </p>
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.createdAt.toISOString()}>{relative(a.createdAt)}</time>
            </Link>
          ))}
        </Paper>
      )}
    </PageContainer>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
