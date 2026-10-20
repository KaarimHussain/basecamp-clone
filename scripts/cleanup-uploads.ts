// Deletes uploaded files that no attachment points to any more (deleted comments/messages,
// uploads that were never saved). Files younger than a day are kept: they may be mid-upload.
//   npm run cleanup:uploads            dry run, lists what would go
//   npm run cleanup:uploads -- --yes   actually deletes
import "dotenv/config";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/db";

const ROOT = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
const DELETE = process.argv.includes("--yes");
const MIN_AGE_MS = 24 * 3600 * 1000;

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)])));
  return nested.flat();
}

const known = new Set((await prisma.attachment.findMany({ select: { key: true } })).map((a) => path.resolve(ROOT, a.key)));
let count = 0;
let bytes = 0;
for (const file of await files(ROOT)) {
  if (known.has(file)) continue;
  const info = await stat(file);
  if (Date.now() - info.mtimeMs < MIN_AGE_MS) continue;
  count++;
  bytes += info.size;
  console.log(`${DELETE ? "deleting" : "would delete"} ${path.relative(ROOT, file)}`);
  // Remove the per-upload folder (<workspace>/<uuid>/) along with its single file.
  if (DELETE) await rm(path.dirname(file), { recursive: true, force: true });
}
console.log(`${count} orphaned file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB${DELETE ? " removed" : " (dry run; pass --yes to delete)"}`);
await prisma.$disconnect();
