# TFG Workspace — Spec & Architecture

Oct 20, 2026 · @Muhammad Kaarim

## Overview

A self-hosted Basecamp-style workspace for TFG Solutions' publishing team, built on Next.js + Postgres, with no seat or project caps. v1 covers only the five requirements Basecamp couldn't fully meet on its free plan:

1. Project management: tasks with assignees, due dates, status
2. Live team chat, Slack-style, with channels and threads
3. Tasks grouped by category/department (E-book, Publishing, Cover Design, more addable)
4. Leadership auto-looped into every task, with no manual @mentions
5. Comments, tags, and file/image uploads inside each task

Users: one President, two Project Managers, one QA Lead, four other Leads, plus the wider team. That's 8 leadership seats before staff, which is why the Basecamp free plan (5 seats) failed.

## v1 scope

v1 ships one workspace with category boards, task detail, chat and leadership auto-follow; everything else waits.

| Area | In v1 | Notes |
| --- | --- | --- |
| Auth | Email + password, magic link, invites by email | Auth.js; roles: Owner, Leadership, Member |
| Categories | Create, rename, reorder, archive | Seeded: E-book, Publishing, Cover Design |
| Tasks | Title, description, assignees, due date, status, priority | List view + Kanban view per category |
| Comments | Rich text, @mentions, edit/delete own | Mentions notify instantly |
| Tags | Workspace-level colored tags, filter by tag | Real tags, not title prefixes |
| Uploads | Images + files on tasks and comments | Local disk (`UPLOAD_DIR`), access-checked downloads, 25 MB cap |
| Chat | Channels (one per category + General), threads, DMs, file sharing | Realtime, unread counts |
| Leadership loop | Auto-follow every task, configurable per category | See Auto-loop section |
| Notifications | In-app inbox + email digest | Web push in v2 |
| Activity | Per-task history log | Who changed what, when |

**Out of v1:** message board, docs, calendar, automatic check-ins, hill charts, time tracking, client portal, mobile apps, SSO.

## Stack and architecture

Next.js 16 (App Router) + TypeScript + Prisma + self-hosted PostgreSQL (no managed provider), with a separate Socket.io service for realtime and local disk storage for files.

&#91;embedded content: architecture · 4 services\]

The browser talks HTTP to Next.js and WebSocket to the socket service; Next.js emits task and comment events to the socket service after each write. UI: Tailwind + shadcn/ui, Tiptap for rich text, dnd-kit for Kanban, TanStack Query for client cache, Resend for email.

## Data model

Seventeen Postgres tables via Prisma; every row carries `workspaceId` so multi-tenant is free later.

```prisma
model User        { id String @id @default(cuid()) email String @unique name String avatarUrl String? createdAt DateTime @default(now()) }
model Workspace   { id String @id @default(cuid()) name String slug String @unique }
model Member      { workspaceId String userId String role Role  @@id([workspaceId, userId]) }
enum  Role        { OWNER LEADERSHIP MEMBER }

model Category    { id String @id @default(cuid()) workspaceId String name String color String position Int archivedAt DateTime? }
model CategoryWatcher { categoryId String userId String  @@id([categoryId, userId]) }

model Task        { id String @id @default(cuid()) categoryId String title String description Json? status TaskStatus @default(TODO)
                    priority Int @default(0) dueAt DateTime? position Float createdById String createdAt DateTime @default(now()) completedAt DateTime? }
enum  TaskStatus  { TODO IN_PROGRESS REVIEW DONE }
model TaskAssignee   { taskId String userId String  @@id([taskId, userId]) }
model TaskSubscriber { taskId String userId String reason SubReason  @@id([taskId, userId]) }
enum  SubReason   { CREATOR ASSIGNEE MENTION LEADERSHIP MANUAL }

model Tag         { id String @id @default(cuid()) workspaceId String name String color String  @@unique([workspaceId, name]) }
model TaskTag     { taskId String tagId String  @@id([taskId, tagId]) }

model Comment     { id String @id @default(cuid()) taskId String authorId String body Json createdAt DateTime @default(now()) editedAt DateTime? }
model Attachment  { id String @id @default(cuid()) taskId String? commentId String? messageId String? key String name String mime String size Int }

model Channel     { id String @id @default(cuid()) workspaceId String name String kind ChannelKind categoryId String? }
enum  ChannelKind { PUBLIC PRIVATE DM }
model ChannelMember { channelId String userId String lastReadAt DateTime?  @@id([channelId, userId]) }
model Message     { id String @id @default(cuid()) channelId String authorId String parentId String? body Json createdAt DateTime @default(now()) }

model Notification { id String @id @default(cuid()) userId String type String taskId String? messageId String? readAt DateTime? createdAt DateTime @default(now()) }
model Activity    { id String @id @default(cuid()) taskId String actorId String action String meta Json createdAt DateTime @default(now()) }
```

`TaskSubscriber.reason` is the key table: it records why someone follows a task, so leadership auto-follows can be bulk-removed without touching manual follows. `Message.parentId` gives threads.

## API and realtime

REST route handlers under `app/api`, Server Actions for form mutations, and one Socket.io gateway for everything live.

| Method | Route | Does |
| --- | --- | --- |
| GET / POST | `/api/categories` | List / create categories |
| PATCH | `/api/categories/:id` | Rename, recolor, reorder, set watchers |
| GET / POST | `/api/categories/:id/tasks` | List (filter by status, tag, assignee) / create task |
| GET / PATCH / DELETE | `/api/tasks/:id` | Task detail, update fields, archive |
| PUT | `/api/tasks/:id/assignees` | Replace assignees |
| PUT | `/api/tasks/:id/tags` | Replace tags |
| POST / DELETE | `/api/tasks/:id/subscribers` | Follow / unfollow |
| GET / POST | `/api/tasks/:id/comments` | Thread / add comment |
| POST | `/api/uploads` | Upload a file (multipart) to local disk |
| GET / POST | `/api/channels/:id/messages?parent=` | History (cursor) / send; `parent` = thread |
| GET / PATCH | `/api/notifications` | Inbox / mark read |

**Socket rooms:** `ws:<id>`, `channel:<id>`, `task:<id>`, `user:<id>`.

**Events:** `message:new`, `message:thread`, `typing`, `task:updated`, `comment:new`, `notification:new`, `presence`.

The Socket.io server runs as a small Node service beside Next.js (Vercel can't hold websockets); Redis adapter if it ever scales past one instance.

## Auto-loop leadership

Every new task auto-subscribes all LEADERSHIP members plus that category's watchers, inside the same transaction that creates the task. No manual @mention needed.

```ts
// lib/tasks/create.ts
export async function createTask(input: CreateTaskInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({ data: { ...input, createdById: actorId } })

    const [leaders, watchers] = await Promise.all([
      tx.member.findMany({ where: { workspaceId: input.workspaceId, role: 'LEADERSHIP' }, select: { userId: true } }),
      tx.categoryWatcher.findMany({ where: { categoryId: input.categoryId }, select: { userId: true } }),
    ])

    const subs = new Map<string, SubReason>([
      ...leaders.map((l) => [l.userId, 'LEADERSHIP'] as const),
      ...watchers.map((w) => [w.userId, 'LEADERSHIP'] as const),
      ...input.assigneeIds.map((id) => [id, 'ASSIGNEE'] as const),
      [actorId, 'CREATOR'],
    ])

    await tx.taskSubscriber.createMany({
      data: [...subs].map(([userId, reason]) => ({ taskId: task.id, userId, reason })),
      skipDuplicates: true,
    })
    return task
  }).then(async (task) => { await notifySubscribers(task.id, 'task:created', actorId); return task })
}
```

Rules:

- Subscribers get notified on create, comment, status change, due-date change, and completion.
- Promoting someone to LEADERSHIP backfills them onto open tasks; demoting removes only rows with reason `LEADERSHIP`.
- Leaders can mute a single task, but can't unfollow by default (Owner setting).
- Email digest batches anything unread after 15 minutes, so leadership isn't spammed.

## Phases

Built in order; each phase ships when it works, no fixed dates.

1. **Phase 1:** repo, Prisma schema, Auth.js, workspace + invites + roles, seed categories.
2. **Phase 2:** tasks CRUD, list + Kanban views (dnd-kit), assignees, due dates, status.
3. **Phase 3:** task detail, comments with @mentions (Tiptap), tags + filters, local-disk uploads.
4. **Phase 4:** leadership auto-follow, category watchers, notification inbox, email digest (Resend).
5. **Phase 5:** chat: channels, threads, DMs, file sharing, unread counts, presence.
6. **Phase 6:** activity log, QA pass, deploy (one VPS: Next.js + PostgreSQL + socket service + upload directory; Vercel is out because uploads need a persistent disk), onboarding the team.

## Open questions for the client

- [ ] Should leadership follow **every** category, or can some leads follow only their own department?
- [ ] Any categories beyond E-book, Publishing, Cover Design (e.g. Editing, Marketing, Printing)?
- [ ] Do clients/authors ever need access, or is it internal only?
- [ ] Hosting budget: fine with \~$20–40/month for one VPS (app, Postgres, uploads)?
- [ ] Is data from Basecamp to be migrated, or start fresh?
- [ ] Who owns the code and the hosting accounts after handover?
