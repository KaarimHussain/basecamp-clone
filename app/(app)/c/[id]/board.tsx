"use client";

import { useId, useOptimistic, startTransition, type ReactNode } from "react";
import Link from "next/link";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { moveTask } from "@/lib/tasks";
import { PRIORITIES, STATUSES, TagChip } from "@/app/task-fields";

type Row = { id: string; title: string; status: string; priority: number; dueAt: string | null; assignees: string[]; tags: { id: string; name: string; color: string }[] };

export default function Board({ tasks }: { tasks: Row[] }) {
  const [optimistic, move] = useOptimistic(tasks, (state, { id, status }: { id: string; status: string }) =>
    state.map((t) => (t.id === id ? { ...t, status } : t)),
  );
  const dndId = useId(); // stable SSR/client id, avoids aria-describedby hydration mismatch
  // Distance threshold keeps plain clicks on the title link working.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const id = String(active.id);
    const status = String(over.id);
    if (optimistic.find((t) => t.id === id)?.status === status) return;
    startTransition(async () => {
      move({ id, status });
      await moveTask(id, status);
    });
  }

  return (
    <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-4 md:grid-cols-4">
        {STATUSES.map((s) => {
          const col = optimistic.filter((t) => t.status === s.value);
          return (
            <Column key={s.value} id={s.value} title={`${s.label} · ${col.length}`}>
              {col.map((t) => <Card key={t.id} task={t} />)}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}

function Column({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={title} className={`min-h-40 rounded p-3 ${isOver ? "bg-zinc-200" : "bg-zinc-100"} dark:bg-zinc-900`}>
      <h2 className="mb-3 text-sm font-medium text-zinc-600">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Card({ task }: { task: Row }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`cursor-grab rounded border bg-white p-3 text-sm shadow-sm dark:bg-black ${isDragging ? "z-10 opacity-80" : ""}`}
    >
      <Link href={`/t/${task.id}`} className="font-medium hover:underline">{task.title}</Link>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
        {task.priority > 0 && <span>{PRIORITIES[task.priority]}</span>}
        {task.dueAt && <span>Due {task.dueAt}</span>}
        {task.assignees.length > 0 && <span>{task.assignees.join(", ")}</span>}
        {task.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
      </div>
    </article>
  );
}
