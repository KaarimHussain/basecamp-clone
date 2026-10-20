import "server-only";
import nodemailer from "nodemailer";

// SMTP_URL e.g. smtps://user:pass@smtp.example.com:465 or smtp://user:pass@host:587
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

// Without SMTP_URL (local dev) mail is logged instead of sent.
export async function sendMail(to: string, subject: string, html: string) {
  if (!transport) {
    // Local dev: print the links so sign-in/reset/invite flows still work without a mail server.
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    console.log(`[mail] SMTP_URL not set; would email ${to}: ${subject}${links.length ? ` → ${links.join(" ")}` : ""}`);
    return;
  }
  await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
}
