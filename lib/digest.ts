import "server-only";
import { prisma } from "@/lib/db";
import { NOTIFY_TEXT } from "@/lib/notify";

const DELAY_MS = 15 * 60 * 1000;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function send(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[digest] RESEND_API_KEY not set; would email ${to}: ${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// Emails each user one summary of notifications that stayed unread for 15+ minutes.
// Each notification is emailed at most once (emailedAt).
export async function sendDigests() {
  const pending = await prisma.notification.findMany({
    where: { readAt: null, emailedAt: null, createdAt: { lt: new Date(Date.now() - DELAY_MS) } },
    include: {
      user: { select: { email: true, name: true } },
      actor: { select: { name: true } },
      task: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byUser = Map.groupBy(pending, (n) => n.userId);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  let sent = 0;

  for (const items of byUser.values()) {
    const ids = items.map((n) => n.id);
    // Claim first so an overlapping run can't email the same rows.
    const claimed = await prisma.notification.updateMany({ where: { id: { in: ids }, emailedAt: null }, data: { emailedAt: new Date() } });
    if (claimed.count === 0) continue;

    const lines = items.map((n) => {
      const what = `${esc(n.actor?.name ?? "Someone")} ${NOTIFY_TEXT[n.type] ?? esc(n.type)}`;
      const task = n.task ? `<a href="${appUrl}/t/${n.task.id}">${esc(n.task.title)}</a>` : "a task";
      return `<li>${what} ${task}</li>`;
    });
    const { email, name } = items[0].user;
    try {
      await send(
        email,
        `${items.length} update${items.length > 1 ? "s" : ""} in TFG Workspace`,
        `<p>Hi ${esc(name)},</p><p>Here's what you missed:</p><ul>${lines.join("")}</ul><p><a href="${appUrl}/inbox">Open your inbox</a></p>`,
      );
      sent++;
    } catch (err) {
      // Release the claim so the next run retries.
      await prisma.notification.updateMany({ where: { id: { in: ids } }, data: { emailedAt: null } });
      console.error("[digest]", err);
    }
  }
  return { users: byUser.size, sent };
}
