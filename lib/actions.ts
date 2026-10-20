"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";
import { signIn, signOut, Throttled } from "@/auth";
import { consumeToken, issueToken } from "@/lib/auth-tokens";
import { allow } from "@/lib/throttle";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { backfill, removeLeadershipFollows } from "@/lib/leadership";
import { appUrl, esc, sendMail } from "@/lib/mail";

export async function login(_: string | undefined, form: FormData) {
  try {
    await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirectTo: "/" });
  } catch (e) {
    if (e instanceof Throttled) return "Too many attempts. Wait 15 minutes, or use “Email me a sign-in link”.";
    if (e instanceof AuthError) return "Invalid email or password.";
    throw e; // successful sign-in throws a redirect
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

const inviteSchema = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  role: z.enum(["LEADERSHIP", "MEMBER"]),
});

export async function createInvite(form: FormData) {
  const me = await requireMember("OWNER");
  const { email, role } = inviteSchema.parse(Object.fromEntries(form));
  const invite = await prisma.invite.create({
    data: {
      workspaceId: me.workspaceId,
      email,
      role,
      token: randomBytes(24).toString("base64url"),
      invitedById: me.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  const link = `${appUrl()}/invite/${invite.token}`;
  // The link stays visible on the Members page, so a mail failure isn't fatal.
  await sendMail(
    email,
    `${me.user.name} invited you to ${me.workspace.name}`,
    `<p>${esc(me.user.name)} invited you to join <strong>${esc(me.workspace.name)}</strong> on TFG Workspace.</p>
     <p><a href="${link}">Accept the invite</a> (expires in 7 days)</p>`,
  ).catch((err) => console.error("[mail] invite failed:", err));
  revalidatePath("/members");
}

export async function setRole(form: FormData) {
  const me = await requireMember("OWNER");
  const userId = z.string().parse(form.get("userId"));
  const role = z.enum(["LEADERSHIP", "MEMBER"]).parse(form.get("role"));
  if (userId === me.userId) throw new Error("Cannot change your own role");
  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { workspaceId_userId: { workspaceId: me.workspaceId, userId } },
      data: { role },
    });
    // Promotion follows every open task; demotion removes only the LEADERSHIP-reason follows.
    if (role === "LEADERSHIP") await backfill(tx, userId, { workspaceId: me.workspaceId });
    else await removeLeadershipFollows(tx, me.workspaceId, userId, {});
  });
  revalidatePath("/members");
}

// Replaces a category's watchers. New watchers follow its open tasks; removed ones drop those follows.
export async function setWatchers(form: FormData) {
  const me = await requireMember("OWNER");
  const categoryId = z.string().parse(form.get("categoryId"));
  const category = await prisma.category.findFirst({ where: { id: categoryId, workspaceId: me.workspaceId } });
  if (!category) throw new Error("Category not found");

  const wanted = new Set(
    (await prisma.member.findMany({
      where: { workspaceId: me.workspaceId, userId: { in: form.getAll("userIds").map(String) } },
      select: { userId: true },
    })).map((m) => m.userId),
  );
  const current = new Set((await prisma.categoryWatcher.findMany({ where: { categoryId } })).map((w) => w.userId));
  const added = [...wanted].filter((id) => !current.has(id));
  const removed = [...current].filter((id) => !wanted.has(id));

  await prisma.$transaction(async (tx) => {
    await tx.categoryWatcher.createMany({ data: added.map((userId) => ({ categoryId, userId })) });
    await tx.categoryWatcher.deleteMany({ where: { categoryId, userId: { in: removed } } });
    for (const userId of added) await backfill(tx, userId, { categoryId });
    for (const userId of removed) await removeLeadershipFollows(tx, me.workspaceId, userId, { categoryId });
  });
  revalidatePath("/categories");
}

const acceptSchema = z.object({
  token: z.string(),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function acceptInvite(_: string | undefined, form: FormData) {
  const parsed = acceptSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const { token, name, password } = parsed.data;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return "This invite is invalid or expired.";
  if (await prisma.user.findUnique({ where: { email: invite.email } })) return "An account with this email already exists.";

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.create({
      data: {
        email: invite.email,
        name,
        passwordHash,
        memberships: { create: { workspaceId: invite.workspaceId, role: invite.role } },
      },
    }),
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);

  await signIn("credentials", { email: invite.email, password, redirectTo: "/" });
}

// ── Categories (owner) ────────────────────────────────────

const categorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

async function ownCategory(id: unknown, workspaceId: string) {
  const category = await prisma.category.findFirst({ where: { id: z.string().parse(id), workspaceId } });
  if (!category) throw new Error("Category not found");
  return category;
}

// New category gets its own chat channel, like the seeded ones.
export async function createCategory(form: FormData) {
  const me = await requireMember("OWNER");
  const data = categorySchema.parse(Object.fromEntries(form));
  const last = await prisma.category.aggregate({ where: { workspaceId: me.workspaceId }, _max: { position: true } });
  await prisma.category.create({
    data: {
      ...data,
      workspaceId: me.workspaceId,
      position: (last._max.position ?? -1) + 1,
      channels: { create: { workspaceId: me.workspaceId, name: data.name } },
    },
  });
  revalidatePath("/", "layout");
}

export async function updateCategory(form: FormData) {
  const me = await requireMember("OWNER");
  const category = await ownCategory(form.get("id"), me.workspaceId);
  const data = categorySchema.parse(Object.fromEntries(form));
  await prisma.$transaction([
    prisma.category.update({ where: { id: category.id }, data }),
    prisma.channel.updateMany({ where: { categoryId: category.id }, data: { name: data.name } }),
  ]);
  revalidatePath("/", "layout");
}

// Swaps position with the neighbour above or below.
export async function moveCategory(form: FormData) {
  const me = await requireMember("OWNER");
  const category = await ownCategory(form.get("id"), me.workspaceId);
  const up = form.get("dir") === "up";
  const neighbour = await prisma.category.findFirst({
    where: { workspaceId: me.workspaceId, archivedAt: null, position: up ? { lt: category.position } : { gt: category.position } },
    orderBy: { position: up ? "desc" : "asc" },
  });
  if (!neighbour) return;
  await prisma.$transaction([
    prisma.category.update({ where: { id: category.id }, data: { position: neighbour.position } }),
    prisma.category.update({ where: { id: neighbour.id }, data: { position: category.position } }),
  ]);
  revalidatePath("/", "layout");
}

// Archive hides the board; tasks, history and the chat channel are kept.
export async function setCategoryArchived(form: FormData) {
  const me = await requireMember("OWNER");
  const category = await ownCategory(form.get("id"), me.workspaceId);
  await prisma.category.update({
    where: { id: category.id },
    data: { archivedAt: form.get("archived") === "1" ? new Date() : null },
  });
  revalidatePath("/", "layout");
}

// ── Account ───────────────────────────────────────────────

const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  current: z.string(),
  next: z.string().optional(),
});

export async function updateAccount(_: string | undefined, form: FormData) {
  const me = await requireMember();
  const parsed = accountSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return "Please fill in your name.";
  const { name, current, next } = parsed.data;

  let passwordHash: string | undefined;
  if (next) {
    if (next.length < 8) return "New password must be at least 8 characters.";
    if (!me.user.passwordHash || !(await bcrypt.compare(current, me.user.passwordHash))) return "Current password is wrong.";
    passwordHash = await bcrypt.hash(next, 10);
  }
  await prisma.user.update({ where: { id: me.userId }, data: { name, ...(passwordHash && { passwordHash }) } });
  revalidatePath("/", "layout");
  return passwordHash ? "Saved. Your password was changed." : "Saved.";
}

// ── Sign-in links & password reset ───────────────────────

const SENT = "If that email belongs to an account, a link is on its way. Check your inbox.";
const emailField = z.email().transform((s) => s.toLowerCase());

// Same answer whether or not the account exists, so the form can't be used to probe emails.
async function emailLink(form: FormData, kind: "MAGIC" | "RESET") {
  const parsed = emailField.safeParse(form.get("email"));
  if (!parsed.success) return "Enter a valid email address.";
  const email = parsed.data;
  if (!allow(`link:${email}`, 3, 15 * 60_000)) return SENT; // quietly cap at 3 mails / 15 min
  const user = await prisma.user.findUnique({ where: { email }, include: { memberships: { take: 1 } } });
  if (!user || user.memberships.length === 0) return SENT;

  const raw = await issueToken(user.id, kind);
  const link = `${appUrl()}/${kind === "MAGIC" ? "magic" : "reset"}/${raw}`;
  await sendMail(
    email,
    kind === "MAGIC" ? "Your TFG Workspace sign-in link" : "Reset your TFG Workspace password",
    kind === "MAGIC"
      ? `<p>Hi ${esc(user.name)},</p><p><a href="${link}">Sign in to TFG Workspace</a>. This link works once and expires in 15 minutes.</p>`
      : `<p>Hi ${esc(user.name)},</p><p><a href="${link}">Choose a new password</a>. This link works once and expires in 1 hour.</p><p>If you didn't ask for this, ignore this email.</p>`,
  ).catch((err) => console.error("[mail] link failed:", err));
  return SENT;
}

export async function requestMagicLink(_: string | undefined, form: FormData) {
  return emailLink(form, "MAGIC");
}

export async function requestReset(_: string | undefined, form: FormData) {
  return emailLink(form, "RESET");
}

export async function magicSignIn(form: FormData) {
  try {
    await signIn("magic", { token: form.get("token"), redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?error=link");
    throw e;
  }
}

export async function resetPassword(_: string | undefined, form: FormData) {
  const parsed = z.object({ token: z.string(), password: z.string().min(8, "Password must be at least 8 characters.") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const userId = await consumeToken(parsed.data.token, "RESET");
  if (!userId) return "This link is invalid, expired or already used. Request a new one.";
  const user = await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) } });
  await signIn("credentials", { email: user.email, password: parsed.data.password, redirectTo: "/" });
}

// ── People admin (owner) ──────────────────────────────────

// For people whose email isn't working: the owner hands them a one-time reset link.
export async function ownerResetLink(_: string | undefined, form: FormData) {
  const me = await requireMember("OWNER");
  const userId = z.string().parse(form.get("userId"));
  const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId: me.workspaceId, userId } } });
  if (!member) return undefined;
  return `${appUrl()}/reset/${await issueToken(userId, "RESET")}`;
}

// Removes access but keeps everything they wrote (comments, messages, history).
export async function removeMember(form: FormData) {
  const me = await requireMember("OWNER");
  const userId = z.string().parse(form.get("userId"));
  if (userId === me.userId) throw new Error("You can't remove yourself");
  const ws = me.workspaceId;
  await prisma.$transaction([
    prisma.member.deleteMany({ where: { workspaceId: ws, userId, role: { not: "OWNER" } } }),
    prisma.categoryWatcher.deleteMany({ where: { userId, category: { workspaceId: ws } } }),
    prisma.taskSubscriber.deleteMany({ where: { userId, task: { workspaceId: ws } } }),
    prisma.taskAssignee.deleteMany({ where: { userId, task: { workspaceId: ws } } }),
    prisma.channelMember.deleteMany({ where: { userId, channel: { workspaceId: ws, kind: { not: "DM" } } } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.authToken.deleteMany({ where: { userId } }),
  ]);
  revalidatePath("/", "layout");
}

export async function revokeInvite(form: FormData) {
  const me = await requireMember("OWNER");
  await prisma.invite.deleteMany({ where: { id: z.string().parse(form.get("id")), workspaceId: me.workspaceId, acceptedAt: null } });
  revalidatePath("/members");
}
