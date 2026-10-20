"use client";

import { useId, useOptimistic, startTransition, type ReactNode } from "react";
import Link from "next/link";
import { DndContext, PointerSensor, KeyboardSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { Flag, MessageSquare } from "lucide-react";
import { moveTask } from "@/lib/tasks";
import { PRIORITIES, STATUSES, TagChip } from "@/app/task-fields";
import { AvatarStack } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export type Row = {
  id: string;
  title: string;
  status: string;
  priority: number;
  due: { text: string; tone: "ok" | "warn" | "bad" } | null;
  assignees: { id: string; name: string }[];
  tags: { id: string; name: string; color: string }[];
  comments: number;
};

// Under the pointer, a card beats its column (so a drop can mean "above this card").
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const cards = hits.filter((h) => String(h.id).startsWith("card:"));
  return cards.length ? cards : hits.length ? hits : rectIntersection(args);
};

const TONE = { ok: "text-muted-foreground", warn: "text-amber-600 dark:text-amber-400", bad: "text-destructive" };

// Basecamp-style "card table": one column per status, drag cards between them.
export default function Board({ tasks }: { tasks: Row[] }) {
  const [optimistic, move] = useOptimistic(tasks, (state, { id, status, beforeId }: { id: string; status: string; beforeId?: string }) => {
    const card = state.find((t) => t.id === id);
    if (!card) return state;
    const rest = state.filter((t) => t.id !== id);
    const at = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1;
    const moved = { ...card, status };
    return at < 0 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)];
  });
  const dndId = useId(); // stable SSR/client id, avoids aria-describedby hydration mismatch
  // Distance threshold keeps plain clicks on the title link working.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    // Dropped on a card: take its column and slot in above it. Dropped on a column: append.
    const beforeId = overId.startsWith("card:") ? overId.slice(5) : undefined;
    if (beforeId === id) return;
    const status = beforeId ? String(over.data.current?.status) : overId;
    if (!beforeId && optimistic.find((t) => t.id === id)?.status === status) return;
    startTransition(async () => {
      move({ id, status, beforeId });
      await moveTask(id, status, beforeId);
    });
  }

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd}>
      <div className="-mx-2 grid gap-3 overflow-x-auto px-2 pb-2 md:grid-cols-4">
        {STATUSES.map((s) => {
          const col = optimistic.filter((t) => t.status === s.value);
          return (
            <Column key={s.value} id={s.value} title={s.label} count={col.length} color={s.color}>
              {col.map((t) => <Card key={t.id} task={t} />)}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}

function Column({ id, title, count, color, children }: { id: string; title: string; count: number; color: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${title}, ${count} cards`}
      className={cn("flex min-h-56 flex-col rounded-xl bg-secondary/70 p-2 transition-colors", isOver && "bg-accent ring-2 ring-primary/40")}
    >
      <h2 className="mb-2 flex items-center gap-2 px-1.5 pt-1 text-sm font-bold">
        <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
        {title}
        <span className="ml-auto rounded-full bg-card px-2 text-xs font-semibold text-muted-foreground">{count}</span>
      </h2>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </section>
  );
}

function Card({ task }: { task: Row }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  // A card being dragged must not be its own drop target.
  const drop = useDroppable({ id: `card:${task.id}`, data: { status: task.status }, disabled: isDragging });
  return (
    <article
      ref={(el) => {
        setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px) rotate(1.5deg)` } : undefined}
      className={cn(
        "cursor-grab rounded-lg border bg-card p-3 text-sm shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing",
        isDragging && "z-10 shadow-xl",
        drop.isOver && !isDragging && "border-t-4 border-t-primary",
      )}
    >
      {task.tags.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1">{task.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}</div>}
      <Link href={`/t/${task.id}`} className="font-semibold leading-snug hover:underline">{task.title}</Link>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {task.priority > 0 && (
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", task.priority === 3 ? "text-destructive" : "text-muted-foreground")}>
            <Flag className="size-3" aria-hidden />{PRIORITIES[task.priority]}
          </span>
        )}
        {task.due && <span className={cn("font-medium", TONE[task.due.tone])}>{task.due.text}</span>}
        {task.comments > 0 && (
          <span className="inline-flex items-center gap-0.5 text-muted-foreground"><MessageSquare className="size-3" aria-hidden />{task.comments}</span>
        )}
        <span className="ml-auto"><AvatarStack people={task.assignees} max={3} /></span>
      </div>
    </article>
  );
}
