import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Flag, KanbanSquare, ListChecks, Plus, SlidersHorizontal } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createTask, restoreTask, toggleDone } from "@/lib/tasks";
import { dueLabel } from "@/lib/format";
import { PRIORITIES, STATUSES, StatusDot, TagChip, TaskFields, selectClass } from "@/app/task-fields";
import { AvatarStack } from "@/components/user-avatar";
import { Breadcrumb, EmptyState, PageContainer, Paper } from "@/components/page";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Board, { type Row } from "./board";
import { LiveTask } from "../../realtime";

// Query string from the defined entries only, so filters survive a view switch.
const qs = (p: Record<string, string | undefined>) =>
  `?${new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1]))}`;

const TONE = { ok: "text-muted-foreground", warn: "text-amber-600 dark:text-amber-400", bad: "text-destructive" };

export async function generateMetadata({ params }: PageProps<"/c/[id]">) {
  const category = await prisma.category.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: category?.name ?? "Category" };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const view = sp.view === "board" ? "board" : sp.view === "archived" ? "archived" : "list";
  const filter = { tag: one(sp.tag), status: one(sp.status), assignee: one(sp.assignee) };
  const status = STATUSES.find((s) => s.value === filter.status)?.value;

  const [category, tasks, members, tags] = await Promise.all([
    prisma.category.findFirst({ where: { id, workspaceId: me.workspaceId } }),
    prisma.task.findMany({
      where: {
        categoryId: id,
        workspaceId: me.workspaceId,
        archivedAt: view === "archived" ? { not: null } : null,
        ...(status && { status }),
        ...(filter.tag && { tags: { some: { tagId: filter.tag } } }),
        ...(filter.assignee && { assignees: { some: { userId: filter.assignee } } }),
      },
      include: {
        assignees: { include: { user: { select: { id: true, name: true } } } },
        tags: { include: { tag: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { position: "asc" },
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
    prisma.tag.findMany({ where: { workspaceId: me.workspaceId }, orderBy: { name: "asc" } }),
  ]);
  if (!category) notFound();
  const archivedCount = view === "archived" ? tasks.length : await prisma.task.count({ where: { categoryId: id, archivedAt: { not: null } } });

  const rows: Row[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due: t.dueAt && t.status !== "DONE" ? dueLabel(t.dueAt) : null,
    assignees: t.assignees.map((a) => a.user),
    tags: t.tags.map(({ tag }) => ({ id: tag.id, name: tag.name, color: tag.color })),
    comments: t._count.comments,
  }));
  const filtered = Object.values(filter).some(Boolean);
  const open = rows.filter((r) => r.status !== "DONE");
  const done = rows.filter((r) => r.status === "DONE");

  return (
    <PageContainer size={view === "board" ? "wide" : "default"}>
      <LiveTask categoryId={category.id} />
      <Breadcrumb href="/">Home</Breadcrumb>

      <Paper className="overflow-hidden">
        <div className="h-2" style={{ background: category.color }} />
        <div className="px-5 pt-8 pb-6 sm:px-10">
          <header className="mb-6 flex flex-col items-center gap-4 text-center">
            <h1 className="text-3xl font-extrabold sm:text-4xl">{category.name}</h1>
            <p className="text-sm text-muted-foreground">
              {open.length} open · {done.length} done{filtered && " (filtered)"}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div role="tablist" aria-label="View" className="inline-flex rounded-full border bg-secondary p-0.5">
                {([["list", "To-dos", ListChecks], ["board", "Card table", KanbanSquare]] as const).map(([v, label, Icon]) => (
                  <Link
                    key={v}
                    role="tab"
                    aria-selected={view === v}
                    href={qs({ ...filter, view: v })}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition-colors",
                      view === v && "bg-card text-foreground shadow-xs",
                    )}
                  >
                    <Icon className="size-4" aria-hidden /> {label}
                  </Link>
                ))}
              </div>
            </div>
          </header>

          {category.archivedAt ? (
            <p className="mb-6 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
              <Archive className="size-4" aria-hidden /> This category is archived. Its to-dos are read-only history; an owner can restore it from Categories.
            </p>
          ) : (
            <details className="group mb-6 rounded-xl border border-transparent open:border-border open:bg-card open:shadow-xs">
              <summary className={cn(buttonVariants(), "cursor-pointer list-none group-open:hidden")}>
                <Plus /> Add a to-do
              </summary>
              <form action={createTask} className="flex flex-col gap-4 p-4 sm:p-5">
                <input type="hidden" name="categoryId" value={category.id} />
                <TaskFields members={members} tags={tags} autoFocus />
                <div className="flex gap-2">
                  <Button type="submit">Add this to-do</Button>
                </div>
              </form>
            </details>
          )}

          <form className="mb-6 flex flex-wrap items-center gap-2 text-sm">
            <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
            <input type="hidden" name="view" value={view} />
            <select name="tag" defaultValue={filter.tag ?? ""} aria-label="Filter by tag" className={selectClass}>
              <option value="">All tags</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {view === "list" && (
              <select name="status" defaultValue={filter.status ?? ""} aria-label="Filter by status" className={selectClass}>
                <option value="">Any status</option>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            )}
            <select name="assignee" defaultValue={filter.assignee ?? ""} aria-label="Filter by assignee" className={selectClass}>
              <option value="">Anyone</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
            </select>
            <Button type="submit" variant="outline" size="sm">Apply</Button>
            {filtered && <Link href={qs({ view })} className={buttonVariants({ variant: "ghost", size: "sm" })}>Clear</Link>}
          </form>

          {view === "archived" ? (
            rows.length === 0 ? (
              <EmptyState icon={<Archive />} title="Nothing archived" />
            ) : (
              <ul className="divide-y">
                {rows.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <Archive className="size-4 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.title}</span>
                    <form action={restoreTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button type="submit" variant="outline" size="sm">Restore</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )
          ) : view === "board" ? (
            <Board tasks={rows} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<ListChecks />} title={filtered ? "No to-dos match these filters" : "No to-dos yet"}>
              {!filtered && "Add the first one above."}
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-8">
              {open.length > 0 && <TodoList rows={open} />}
              {done.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Completed</h2>
                  <TodoList rows={done} />
                </section>
              )}
            </div>
          )}
          {archivedCount > 0 && (
            <div className="mt-8 text-center">
              <Link href={qs({ view: view === "archived" ? "list" : "archived" })} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <Archive className="size-4" aria-hidden />
                {view === "archived" ? "Back to to-dos" : `${archivedCount} archived to-do${archivedCount > 1 ? "s" : ""}`}
              </Link>
            </div>
          )}
        </div>
      </Paper>
    </PageContainer>
  );
}

function TodoList({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y">
      {rows.map((t) => {
        const isDone = t.status === "DONE";
        return (
          <li key={t.id} className="group flex items-start gap-3 py-3">
            <form action={toggleDone} className="pt-0.5">
              <input type="hidden" name="id" value={t.id} />
              <button
                aria-label={isDone ? `Mark “${t.title}” as not done` : `Complete “${t.title}”`}
                className={cn(
                  "grid size-5 place-items-center rounded-full border-2 transition-colors",
                  isDone ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary hover:bg-primary/10",
                )}
              >
                {isDone && <svg viewBox="0 0 16 16" className="size-3" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            </form>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/t/${t.id}`} className={cn("font-medium hover:underline", isDone && "text-muted-foreground line-through")}>{t.title}</Link>
                {t.priority > 0 && !isDone && (
                  <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", t.priority === 3 ? "text-destructive" : "text-muted-foreground")}>
                    <Flag className="size-3" aria-hidden />{PRIORITIES[t.priority]}
                  </span>
                )}
                {t.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {!isDone && t.status !== "TODO" && <StatusDot status={t.status} />}
                {t.due && <span className={cn("font-medium", TONE[t.due.tone])}>{t.due.text}</span>}
                {t.comments > 0 && <span className="text-muted-foreground">{t.comments} comment{t.comments > 1 && "s"}</span>}
              </div>
            </div>
            <AvatarStack people={t.assignees} max={3} />
          </li>
        );
      })}
    </ul>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
