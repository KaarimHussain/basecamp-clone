import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// Runtime data dir, not source: keep it out of build tracing.
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "uploads");

// key = "<workspaceId>/<uuid>/<safe name>"; always server-generated.
const KEY = /^[a-z0-9]+\/[0-9a-f-]{36}\/[\w.-]{1,200}$/;

export function filePath(key: string) {
  if (!KEY.test(key)) throw new Error("Bad key");
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Bad key"); // belt and braces vs traversal
  return full;
}

export async function saveFile(workspaceId: string, file: File) {
  const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-200) || "file";
  const key = `${workspaceId}/${randomUUID()}/${safe}`;
  const full = filePath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
  return key;
}

// Uploaded-file metadata posted back with a form. Key must sit under this
// workspace's prefix, so one workspace can't claim another's files.
export function parseUploads(raw: FormDataEntryValue | null, workspaceId: string) {
  if (!raw) return [];
  return z
    .array(
      z.object({
        key: z.string().startsWith(`${workspaceId}/`).regex(KEY),
        name: z.string().min(1).max(200),
        mime: z.string().max(100),
        size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
      }),
    )
    .max(10)
    .parse(JSON.parse(String(raw)));
}
