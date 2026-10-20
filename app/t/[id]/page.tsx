import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSONContent } from "@tiptap/react";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { archiveTask, updateTask } from "@/lib/tasks";
import { addComment, addTaskFiles, createTag, deleteComment, editComment } from "@/lib/comments";
import { renderRichText } from "@/lib/rich-text";
import { TaskFields } from "@/app/task-fields";
import RichEditor from "@/app/rich-editor";
import Uploader from "@/app/uploader";
import Composer from "./composer";

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

function Files({ files }: { files: { id: string; name: string; mime: string; size: number }[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2 text-sm">
      {files.map((f) => (
        <li key={f.id}>
          <a href={`/api/attachments/${f.id}`} target="_blank" rel="noopener" className="block rounded border px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900">
            {f.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL behind a redirect
              <img src={`/api/attachments/${f.id}`} alt={f.name} className="max-h-32 max-w-48 object-contain" />
            ) : (
              <>📎 {f.name} <span className="text-zinc-500">({Math.ceil(f.size / 1024)} KB)</span></>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default async function TaskPage({ params }: PageProps<"/t/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const [task, members, tags] = await Promise.all([
    prisma.task.findFirst({
      where: { id, workspaceId: me.workspaceId, archivedAt: null },
      include: {
        category: true,
        assignees: true,
        tags: true,
        attachments: true,
        createdBy: { select: { name: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { name: true } }, attachments: true },
        },
      },
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
    prisma.tag.findMany({ where: { workspaceId: me.workspaceId }, orderBy: { name: "asc" } }),
  ]);
  if (!task) notFound();
  const users = members.map((m) => ({ id: m.userId, label: m.user.name }));

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href={`/c/${task.categoryId}`} className="text-sm underline">← {task.category.name}</Link>
      <p className="mt-6 mb-4 text-sm text-zinc-500">
        Created by {task.createdBy.name} on {task.createdAt.toISOString().slice(0, 10)}
        {task.completedAt && ` · completed ${task.completedAt.toISOString().slice(0, 10)}`}
      </p>

      <form action={updateTask} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={task.id} />
        <TaskFields
          members={members}
          tags={tags}
          task={{ ...task, assigneeIds: task.assignees.map((a) => a.userId), tagIds: task.tags.map((t) => t.tagId) }}
        />
        <RichEditor name="description" users={users} initial={task.description as JSONContent | null} placeholder="Description" />
        <button className="self-start rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black">Save</button>
      </form>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-zinc-500">New tag</summary>
        <form action={createTag} className="mt-2 flex gap-2">
          <input type="hidden" name="taskId" value={task.id} />
          <input name="name" placeholder="Tag name" required maxLength={40} aria-label="Tag name" className="rounded border px-2 py-1" />
          <input name="color" type="color" defaultValue="#6366f1" aria-label="Tag color" className="h-8 w-10" />
          <button className="underline">Create</button>
        </form>
      </details>

      <section className="mt-8">
        <h2 className="mb-2 font-semibold">Files</h2>
        <Files files={task.attachments} />
        <form action={addTaskFiles} className="mt-2 flex items-center gap-3">
          <input type="hidden" name="taskId" value={task.id} />
          <Uploader />
          <button className="text-sm underline">Save files</button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 font-semibold">Comments</h2>
        <ol className="mb-6 space-y-4">
          {task.comments.map((c) => (
            <li key={c.id} className="rounded border p-3">
              <div className="mb-1 text-xs text-zinc-500">
                <strong className="text-zinc-800 dark:text-zinc-200">{c.author.name}</strong> · {fmt(c.createdAt)}
                {c.editedAt && " · edited"}
              </div>
              <div className="rich text-sm" dangerouslySetInnerHTML={{ __html: renderRichText(c.body) }} />
              <Files files={c.attachments} />
              {c.authorId === me.userId && (
                <div className="mt-2 flex gap-3 text-xs">
                  <details>
                    <summary className="cursor-pointer underline">Edit</summary>
                    <div className="mt-2">
                      <Composer action={editComment} users={users} hidden={{ id: c.id }} initial={c.body as JSONContent} uploads={false} label="Save" />
                    </div>
                  </details>
                  <form action={deleteComment}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-red-600 underline">Delete</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ol>
        <Composer action={addComment} users={users} hidden={{ taskId: task.id }} />
      </section>

      <form action={archiveTask} className="mt-10 border-t pt-4">
        <input type="hidden" name="id" value={task.id} />
        <button className="text-sm text-red-600 underline">Archive task</button>
      </form>
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
