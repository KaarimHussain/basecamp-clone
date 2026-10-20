import { notFound } from "next/navigation";
import type { JSONContent } from "@tiptap/react";
import { Archive, Bell, BellOff, CalendarDays, FileText, Flag, Paperclip, Pencil, Tag, UserRound, Users, History } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { archiveTask, followTask, setMuted, toggleDone, unfollowTask, updateTask } from "@/lib/tasks";
import { addComment, addTaskFiles, createTag, deleteComment, editComment } from "@/lib/comments";
import { renderRichText } from "@/lib/rich-text";
import { activityText } from "@/lib/activity";
import { dueLabel, relative, shortDate } from "@/lib/format";
import { PRIORITIES, StatusDot, TagChip, TaskFields } from "@/app/task-fields";
import RichEditor from "@/app/rich-editor";
import Uploader from "@/app/uploader";
import { AvatarStack, UserAvatar } from "@/components/user-avatar";
import { Breadcrumb, PageContainer, Paper, SectionTitle } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Composer from "./composer";
import { LiveTask } from "../../realtime";

type FileRow = { id: string; name: string; mime: string; size: number };

function Files({ files }: { files: FileRow[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={`/api/attachments/${f.id}`}
            target="_blank"
            rel="noopener"
            className="group flex items-center gap-2 overflow-hidden rounded-lg border bg-card text-sm shadow-xs transition hover:shadow-md"
          >
            {f.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- auth-checked file route
              <img src={`/api/attachments/${f.id}`} alt={f.name} className="max-h-36 min-h-16 max-w-56 min-w-16 bg-muted object-cover" />
            ) : (
              <span className="flex items-center gap-2 px-3 py-2">
                <FileText className="size-5 text-muted-foreground" aria-hidden />
                <span className="max-w-48 truncate font-medium group-hover:underline">{f.name}</span>
                <span className="text-xs text-muted-foreground">{Math.ceil(f.size / 1024)} KB</span>
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof Users; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-3 py-2 text-sm">
      <dt className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" aria-hidden />{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps<"/t/[id]">) {
  const task = await prisma.task.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: task?.title ?? "To-do" };
}

export default async function TaskPage({ params }: PageProps<"/t/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const [task, members, tags] = await Promise.all([
    prisma.task.findFirst({
      where: { id, workspaceId: me.workspaceId, archivedAt: null },
      include: {
        category: true,
        assignees: { include: { user: { select: { id: true, name: true } } } },
        tags: { include: { tag: true } },
        attachments: true,
        createdBy: { select: { id: true, name: true } },
        subscribers: { include: { user: { select: { id: true, name: true } } } },
        activity: { include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true } }, attachments: true },
        },
      },
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
    prisma.tag.findMany({ where: { workspaceId: me.workspaceId }, orderBy: { name: "asc" } }),
  ]);
  if (!task) notFound();
  const users = members.map((m) => ({ id: m.userId, label: m.user.name }));
  const mine = task.subscribers.find((s) => s.userId === me.userId);
  const isDone = task.status === "DONE";
  const due = task.dueAt && !isDone ? dueLabel(task.dueAt) : null;
  const description = renderRichText(task.description);

  return (
    <PageContainer>
      <LiveTask taskId={task.id} />
      <Breadcrumb href={`/c/${task.categoryId}`} color={task.category.color}>{task.category.name}</Breadcrumb>

      <Paper className="px-5 py-8 sm:px-10">
        {/* ── Overview ─────────────────────────────── */}
        <div className="flex items-start gap-3">
          <form action={toggleDone} className="pt-1.5">
            <input type="hidden" name="id" value={task.id} />
            <button
              aria-label={isDone ? "Mark as not done" : "Mark as done"}
              className={cn(
                "grid size-7 place-items-center rounded-full border-2 transition-colors",
                isDone ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary hover:bg-primary/10",
              )}
            >
              {isDone && <svg viewBox="0 0 16 16" className="size-4" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
          </form>
          <div className="min-w-0 flex-1">
            <h1 className={cn("text-2xl font-extrabold sm:text-3xl", isDone && "text-muted-foreground line-through")}>{task.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Added by {task.createdBy.name} {relative(task.createdAt)}
              {task.completedAt && ` · completed ${shortDate(task.completedAt)}`}
            </p>
          </div>
        </div>

        <dl className="mt-6 divide-y border-y">
          <Detail icon={Flag} label="Status">
            <span className="flex items-center gap-3"><StatusDot status={task.status} />{task.priority > 0 && <span className="text-xs font-semibold text-muted-foreground">{PRIORITIES[task.priority]} priority</span>}</span>
          </Detail>
          <Detail icon={UserRound} label="Assigned to">
            {task.assignees.length ? (
              <span className="flex flex-wrap items-center gap-2">
                {task.assignees.map((a) => (
                  <span key={a.userId} className="inline-flex items-center gap-1.5"><UserAvatar id={a.user.id} name={a.user.name} size="sm" />{a.user.name}</span>
                ))}
              </span>
            ) : <span className="text-muted-foreground">Unassigned</span>}
          </Detail>
          <Detail icon={CalendarDays} label="Due on">
            {task.dueAt ? (
              <span className={cn(due?.tone === "bad" && "font-semibold text-destructive", due?.tone === "warn" && "font-semibold text-amber-600 dark:text-amber-400")}>
                {due?.text ?? shortDate(task.dueAt)}
              </span>
            ) : <span className="text-muted-foreground">No due date</span>}
          </Detail>
          <Detail icon={Tag} label="Tags">
            {task.tags.length ? <span className="flex flex-wrap gap-1">{task.tags.map(({ tag }) => <TagChip key={tag.id} tag={tag} />)}</span> : <span className="text-muted-foreground">None</span>}
          </Detail>
        </dl>

        {description && <div className="rich mt-6 text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: description }} />}

        {/* ── Edit ─────────────────────────────────── */}
        <details className="group mt-6">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-secondary group-open:mb-4">
            <Pencil className="size-4" aria-hidden /> <span className="group-open:hidden">Edit to-do</span><span className="hidden group-open:inline">Editing…</span>
          </summary>
          <form action={updateTask} className="flex flex-col gap-4 rounded-xl border bg-background/50 p-4 sm:p-5">
            <input type="hidden" name="id" value={task.id} />
            <TaskFields
              members={members}
              tags={tags}
              task={{ ...task, assigneeIds: task.assignees.map((a) => a.userId), tagIds: task.tags.map((t) => t.tagId) }}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Notes</span>
              <RichEditor name="description" users={users} initial={task.description as JSONContent | null} placeholder="Add notes, type @ to mention" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
          <form action={createTag} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="taskId" value={task.id} />
            <span className="text-muted-foreground">New tag:</span>
            <Input name="name" placeholder="e.g. Urgent" required maxLength={40} aria-label="Tag name" className="h-8 w-40" />
            <input name="color" type="color" defaultValue="#6366f1" aria-label="Tag color" className="h-8 w-9 cursor-pointer rounded border bg-transparent" />
            <Button type="submit" variant="outline" size="sm">Create tag</Button>
          </form>
        </details>
      </Paper>

      {/* ── Files ─────────────────────────────────── */}
      <section className="mt-10">
        <SectionTitle>
          <span className="inline-flex items-center gap-2"><Paperclip className="size-4" aria-hidden />Files</span>
        </SectionTitle>
        <Files files={task.attachments} />
        <form action={addTaskFiles} className="mt-3 flex items-center gap-3">
          <input type="hidden" name="taskId" value={task.id} />
          <Uploader />
          <Button type="submit" variant="outline" size="sm">Save files</Button>
        </form>
      </section>

      {/* ── Comments ──────────────────────────────── */}
      <section className="mt-10">
        <SectionTitle>Comments{task.comments.length > 0 && <span className="ml-2 text-muted-foreground">{task.comments.length}</span>}</SectionTitle>
        <ol className="mb-6 flex flex-col gap-5">
          {task.comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <UserAvatar id={c.author.id} name={c.author.name} />
              <div className="min-w-0 flex-1">
                <Paper className="rounded-xl px-4 py-3 shadow-xs">
                  <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                    <strong>{c.author.name}</strong>
                    <time className="text-xs text-muted-foreground" dateTime={c.createdAt.toISOString()}>{relative(c.createdAt)}</time>
                    {c.editedAt && <span className="text-xs text-muted-foreground">· edited</span>}
                  </div>
                  <div className="rich text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichText(c.body) }} />
                  <Files files={c.attachments} />
                </Paper>
                {c.authorId === me.userId && (
                  <div className="mt-1 flex items-start gap-3 pl-1 text-xs">
                    <details className="group flex-1">
                      <summary className="cursor-pointer list-none text-muted-foreground hover:text-foreground group-open:mb-2">Edit</summary>
                      <Composer action={editComment} users={users} hidden={{ id: c.id }} initial={c.body as JSONContent} uploads={false} label="Save" />
                    </details>
                    <form action={deleteComment}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-muted-foreground hover:text-destructive">Delete</button>
                    </form>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="flex gap-3">
          <UserAvatar id={me.userId} name={me.user.name} />
          <div className="min-w-0 flex-1">
            <Composer action={addComment} users={users} hidden={{ taskId: task.id }} />
          </div>
        </div>
      </section>

      {/* ── Followers ─────────────────────────────── */}
      <Paper className="mt-10 flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
        <Users className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">{task.subscribers.length} following</span>
        <AvatarStack people={task.subscribers.map((s) => s.user)} max={8} />
        <span className="ml-auto flex items-center gap-2">
          {mine ? (
            <>
              <span className="text-xs text-muted-foreground">
                {mine.mutedAt ? "You muted this" : mine.reason === "LEADERSHIP" ? "You follow this as leadership" : "You're following"}
              </span>
              <form action={setMuted}>
                <input type="hidden" name="id" value={task.id} />
                <input type="hidden" name="muted" value={mine.mutedAt ? "0" : "1"} />
                <Button type="submit" variant="outline" size="sm">{mine.mutedAt ? <><Bell /> Unmute</> : <><BellOff /> Mute</>}</Button>
              </form>
              {mine.reason !== "LEADERSHIP" && (
                <form action={unfollowTask}>
                  <input type="hidden" name="id" value={task.id} />
                  <Button type="submit" variant="ghost" size="sm">Unfollow</Button>
                </form>
              )}
            </>
          ) : (
            <form action={followTask}>
              <input type="hidden" name="id" value={task.id} />
              <Button type="submit" size="sm"><Bell /> Follow</Button>
            </form>
          )}
        </span>
      </Paper>

      {/* ── History ───────────────────────────────── */}
      <details className="mt-8">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <History className="size-4" aria-hidden /> History ({task.activity.length})
        </summary>
        <ol className="mt-3 flex flex-col gap-2 border-l pl-4 text-sm">
          {task.activity.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute top-2 -left-[1.3rem] size-2 rounded-full bg-border" aria-hidden />
              <strong>{a.actor.name}</strong> {activityText(a.action, a.meta)}{" "}
              <time className="text-xs text-muted-foreground" dateTime={a.createdAt.toISOString()}>{relative(a.createdAt)}</time>
            </li>
          ))}
        </ol>
      </details>

      <form action={archiveTask} className="mt-10 flex justify-center">
        <input type="hidden" name="id" value={task.id} />
        <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
          <Archive /> Archive this to-do
        </Button>
      </form>
    </PageContainer>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
