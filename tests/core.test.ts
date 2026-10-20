// Core logic checks. Run with: npm test
// (react-server condition makes "server-only" a no-op outside Next.js.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { allow } from "../lib/throttle";
import { createToken, verifyToken } from "../lib/realtime-token";
import { filePath, parseUploads } from "../lib/storage";
import { isEmpty, mentionIds, richText } from "../lib/rich-text";
import { activityText, diffTask } from "../lib/activity";
import { changeEvents } from "../lib/notify";
import { dueLabel, relative, today } from "../lib/format";

test("throttle: blocks after the limit and frees up after the window", () => {
  const key = `t:${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.equal(allow(key, 3, 1000, 0), true);
  assert.equal(allow(key, 3, 1000, 10), false);
  assert.equal(allow(key, 3, 1000, 2000), true);
});

test("realtime token: round-trips, rejects tampering and expiry", () => {
  const t = createToken({ uid: "u1", ws: "w1" }, "secret");
  assert.equal(verifyToken(t, "secret")?.uid, "u1");
  assert.equal(verifyToken(t, "other-secret"), null);
  const [data, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "admin", ws: "w1", exp: 9e9 })).toString("base64url");
  assert.equal(verifyToken(`${forged}.${sig}`, "secret"), null);
  assert.equal(verifyToken(createToken({ uid: "u1", ws: "w1" }, "secret", -1), "secret"), null);
  assert.ok(data);
});

test("storage: only server-shaped keys resolve, no path traversal", () => {
  assert.ok(filePath("abc123/0b1e8d4c-1f2a-4b3c-9d8e-123456789abc/cover.png").endsWith("cover.png"));
  assert.throws(() => filePath("../etc/passwd"));
  assert.throws(() => filePath("abc123/0b1e8d4c-1f2a-4b3c-9d8e-123456789abc/../../x"));
  const ok = { key: "ws1/0b1e8d4c-1f2a-4b3c-9d8e-123456789abc/a.pdf", name: "a.pdf", mime: "application/pdf", size: 10 };
  assert.equal(parseUploads(JSON.stringify([ok]), "ws1").length, 1);
  assert.throws(() => parseUploads(JSON.stringify([ok]), "ws2"), "another workspace's file");
  assert.throws(() => parseUploads(JSON.stringify([{ ...ok, size: 26 * 1024 * 1024 }]), "ws1"), "over 25 MB");
});

test("rich text: validates docs, finds mentions, detects empty", () => {
  const doc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "hi " }, { type: "mention", attrs: { id: "u2", label: "Priya" } }] }],
  };
  assert.deepEqual(richText.parse(JSON.stringify(doc)), doc);
  assert.deepEqual(mentionIds(doc), ["u2"]);
  assert.equal(isEmpty(doc), false);
  assert.equal(isEmpty({ type: "doc", content: [{ type: "paragraph" }] }), true);
  assert.equal(richText.safeParse("{not json").success, false);
  assert.equal(richText.safeParse(JSON.stringify({ type: "doc", content: [{ type: "script" }] })).success, false);
});

test("activity: diffs only what changed, with readable text", () => {
  const before = { title: "A", status: "TODO", priority: 0, dueAt: null, assignees: ["Sam"], tags: [] as string[] };
  const out = diffTask(before, { title: "A", status: "DONE", priority: 0, dueAt: new Date("2026-11-05T00:00:00Z"), assignees: ["Sam", "Priya"], tags: [] });
  assert.deepEqual(out.map((e) => e.action), ["status", "due", "assignees"]);
  assert.equal(activityText("status", { from: "TODO", to: "DONE" }), "moved it from To do to Done");
  assert.equal(activityText("assignees", { added: ["Priya"], removed: [] }), "added assignee Priya");
  assert.deepEqual(diffTask(before, { ...before }), []);
});

test("notifications: status/due changes map to the right events", () => {
  const before = { status: "TODO", dueAt: null };
  assert.deepEqual(changeEvents(before, { status: "DONE" }), ["completed"]);
  assert.deepEqual(changeEvents(before, { status: "REVIEW", dueAt: new Date() }), ["status", "due"]);
  assert.deepEqual(changeEvents(before, { status: "TODO", dueAt: null }), []);
});

test("format: due labels and relative times", () => {
  const today = new Date("2026-10-20T00:00:00Z");
  assert.deepEqual(dueLabel(new Date("2026-10-20T00:00:00Z"), today), { text: "Due today", tone: "warn" });
  assert.equal(dueLabel(new Date("2026-10-18T00:00:00Z"), today).tone, "bad");
  assert.equal(dueLabel(new Date("2026-11-05T00:00:00Z"), today).text, "Due Nov 5");
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal(relative(new Date("2026-10-20T11:59:30Z"), now), "just now");
  assert.equal(relative(new Date("2026-10-20T09:00:00Z"), now), "3h ago");
});

test("format: 'today' follows the workspace timezone, not UTC", () => {
  // 20:00 UTC on Oct 20 is already 01:00 on Oct 21 in Karachi (UTC+5).
  assert.equal(today(new Date("2026-10-20T20:00:00Z")).toISOString(), "2026-10-21T00:00:00.000Z");
  assert.equal(today(new Date("2026-10-20T10:00:00Z")).toISOString(), "2026-10-20T00:00:00.000Z");
});
