import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { toggleDone } from "@/lib/tasks";
import { dueLabel, today as todayInTz } from "@/lib/format";
import { StatusDot } from "@/app/task-fields";
import { EmptyState, PageContainer, PageHeader, Paper } from "@/components/page";
import { cn } from "@/lib/utils";

export const metadata = { title: "My Stuff" };

const TONE = { ok: "text-muted-foreground", warn: "text-amber-600 dark:text-amber-400", bad: "text-destructive" };

// Everything assigned to me that's still open, grouped like Basecamp's "My Assignments".
export default async function MyStuffPage() {
  const me = await requireMember();
  const tasks = await prisma.task.findMany({
    where: { workspaceId: me.workspaceId, archivedAt: null, status: { not: "DONE" }, assignees: { some: { userId: me.userId } } },
    include: { category: { select: { name: true, color: true } } },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  const today = todayInTz();
  const weekOut = new Date(today.getTime() + 7 * 86_400_000);
  const groups = [
    { title: "Overdue", rows: tasks.filter((t) => t.dueAt && t.dueAt < today) },
    { title: "Due this week", rows: tasks.filter((t) => t.dueAt && t.dueAt >= today && t.dueAt < weekOut) },
    { title: "Later", rows: tasks.filter((t) => t.dueAt && t.dueAt >= weekOut) },
    { title: "No due date", rows: tasks.filter((t) => !t.dueAt) },
  ].filter((g) => g.rows.length > 0);

  return (
    <PageContainer size="narrow">
      <PageHeader title="My assignments" subtitle={tasks.length ? `${tasks.length} open to-do${tasks.length > 1 ? "s" : ""} assigned to you` : undefined} />
      {tasks.length === 0 ? (
        <EmptyState icon={<CheckSquare />} title="Nothing assigned to you">Enjoy the calm. 🌤️</EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.title}>
              <h2 className={cn("mb-2 text-xs font-bold tracking-wide uppercase", g.title === "Overdue" ? "text-destructive" : "text-muted-foreground")}>{g.title}</h2>
              <Paper className="divide-y">
                {g.rows.map((t) => {
                  const due = t.dueAt ? dueLabel(t.dueAt, today) : null;
                  return (
                    <div key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                      <form action={toggleDone} className="pt-0.5">
                        <input type="hidden" name="id" value={t.id} />
                        <button aria-label={`Complete “${t.title}”`} className="size-5 rounded-full border-2 border-muted-foreground/50 transition-colors hover:border-primary hover:bg-primary/10" />
                      </form>
                      <div className="min-w-0 flex-1">
                        <Link href={`/t/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="size-2 rounded-full" style={{ background: t.category.color }} aria-hidden />{t.category.name}
                          </span>
                          {t.status !== "TODO" && <StatusDot status={t.status} />}
                          {due && <span className={cn("font-medium", TONE[due.tone])}>{due.text}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Paper>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
