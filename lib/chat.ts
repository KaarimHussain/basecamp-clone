"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { parseUploads } from "@/lib/storage";
import { emit } from "@/lib/realtime";
import { pushNotified } from "@/lib/notify";
import { channelFor, messageInclude, toChatMessage, type ChatMessage } from "@/lib/chat-data";

// Who receives realtime events for a channel: the whole workspace, or just the DM's members.
async function rooms(channel: { id: string; kind: string; workspaceId: string }) {
  if (channel.kind === "PUBLIC") return [`ws:${channel.workspaceId}`];
  const members = await prisma.channelMember.findMany({ where: { channelId: channel.id }, select: { userId: true } });
  return members.map((m) => `user:${m.userId}`);
}

export async function sendMessage(form: FormData): Promise<ChatMessage | null> {
  const me = await requireMember();
  const channel = await channelFor(z.string().parse(form.get("channelId")), me);
  const text = z.string().trim().max(4000).parse(form.get("text") ?? "");
  const uploads = parseUploads(form.get("uploads"), me.workspaceId);
  if (!text && uploads.length === 0) return null;

  const parentId = z.string().optional().parse(form.get("parentId") || undefined);
  if (parentId) {
    // Threads are one level deep and must stay in the same channel.
    const parent = await prisma.message.findFirst({ where: { id: parentId, channelId: channel.id, parentId: null } });
    if (!parent) throw new Error("Thread not found");
  }

  const message = await prisma.message.create({
    data: { channelId: channel.id, authorId: me.userId, parentId, body: { text }, attachments: { create: uploads } },
    include: messageInclude,
  });
  await markReadNow(channel.id, me.userId);

  // DMs "ping" the other person: a Hey! notification (and the email digest if unread).
  if (channel.kind === "DM") {
    const others = await prisma.channelMember.findMany({ where: { channelId: channel.id, userId: { not: me.userId } }, select: { userId: true } });
    await prisma.notification.createMany({ data: others.map((o) => ({ userId: o.userId, actorId: me.userId, messageId: message.id, type: "dm" })) });
    await pushNotified(others.map((o) => o.userId));
  }

  const payload = toChatMessage(message);
  await emit(await rooms(channel), "message:new", payload);
  return payload;
}

async function markReadNow(channelId: string, userId: string) {
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    update: { lastReadAt: new Date() },
    create: { channelId, userId, lastReadAt: new Date() },
  });
}

export async function markRead(channelId: string) {
  const me = await requireMember();
  const channel = await channelFor(channelId, me);
  await markReadNow(channel.id, me.userId);
  // Reading the conversation also clears its DM pings in Hey!.
  await prisma.notification.updateMany({ where: { userId: me.userId, readAt: null, message: { channelId: channel.id } }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

// Older top-level messages (or thread replies) before a cursor, oldest first.
export async function loadMessages(channelId: string, opts: { before?: string; parentId?: string }) {
  const me = await requireMember();
  const channel = await channelFor(channelId, me);
  const before = opts.before ? await prisma.message.findUnique({ where: { id: opts.before }, select: { createdAt: true } }) : null;
  const rows = await prisma.message.findMany({
    where: {
      channelId: channel.id,
      parentId: opts.parentId ?? null,
      ...(before && { createdAt: { lt: before.createdAt } }),
    },
    include: messageInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.reverse().map(toChatMessage);
}

// Public channels are open to everyone; private ones only to the people picked (plus the creator).
export async function createChannel(form: FormData) {
  const me = await requireMember();
  const name = z.string().trim().min(1).max(40).parse(form.get("name"));
  const isPrivate = form.get("private") === "on";
  const picked = isPrivate
    ? await prisma.member.findMany({ where: { workspaceId: me.workspaceId, userId: { in: form.getAll("memberIds").map(String) } }, select: { userId: true } })
    : [];
  const members = [...new Set([me.userId, ...picked.map((m) => m.userId)])];
  const channel = await prisma.channel.create({
    data: {
      workspaceId: me.workspaceId,
      name,
      kind: isPrivate ? "PRIVATE" : "PUBLIC",
      ...(isPrivate && { members: { create: members.map((userId) => ({ userId })) } }),
    },
  });
  redirect(`/chat/${channel.id}`);
}

// Opens (or creates) the 1:1 DM with another member.
export async function openDm(form: FormData) {
  const me = await requireMember();
  const otherId = z.string().parse(form.get("userId"));
  const other = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId: me.workspaceId, userId: otherId } } });
  if (!other || otherId === me.userId) throw new Error("Member not found");

  const existing = await prisma.channel.findFirst({
    where: {
      workspaceId: me.workspaceId,
      kind: "DM",
      AND: [{ members: { some: { userId: me.userId } } }, { members: { some: { userId: otherId } } }],
    },
  });
  const channel =
    existing ??
    (await prisma.channel.create({
      data: {
        workspaceId: me.workspaceId,
        name: "dm",
        kind: "DM",
        members: { create: [{ userId: me.userId }, { userId: otherId }] },
      },
    }));
  redirect(`/chat/${channel.id}`);
}

async function ownMessage(id: string, me: { userId: string; workspaceId: string }) {
  const message = await prisma.message.findFirst({ where: { id, authorId: me.userId, channel: { workspaceId: me.workspaceId } }, include: { channel: true } });
  if (!message) throw new Error("Message not found");
  return message;
}

export async function editMessage(id: string, text: string) {
  const me = await requireMember();
  const message = await ownMessage(id, me);
  const body = { text: z.string().trim().min(1).max(4000).parse(text) };
  await prisma.message.update({ where: { id: message.id }, data: { body } });
  await emit(await rooms(message.channel), "message:updated", { id: message.id, channelId: message.channelId, text: body.text });
}

// Deleting a thread starter removes its replies too (cascade).
export async function deleteMessage(id: string) {
  const me = await requireMember();
  const message = await ownMessage(id, me);
  await prisma.message.delete({ where: { id: message.id } });
  await emit(await rooms(message.channel), "message:deleted", { id: message.id, channelId: message.channelId, parentId: message.parentId });
}
