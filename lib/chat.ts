"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { parseUploads } from "@/lib/storage";
import { emit } from "@/lib/realtime";
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
  revalidatePath("/chat", "layout");
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

export async function createChannel(form: FormData) {
  const me = await requireMember();
  const name = z.string().trim().min(1).max(40).parse(form.get("name"));
  const channel = await prisma.channel.create({ data: { workspaceId: me.workspaceId, name, kind: "PUBLIC" } });
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
