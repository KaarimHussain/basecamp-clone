import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});
const Bucket = process.env.R2_BUCKET;

export function presignPut(key: string, mime: string, size: number) {
  // ContentLength is signed, so the browser can't upload more than it declared.
  return getSignedUrl(r2, new PutObjectCommand({ Bucket, Key: key, ContentType: mime, ContentLength: size }), { expiresIn: 300 });
}

export function presignGet(key: string, name: string) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket, Key: key, ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}` }),
    { expiresIn: 300 },
  );
}

// Uploaded-file metadata posted back by the client after a successful PUT.
// Key must sit under this workspace's prefix, so one workspace can't claim another's objects.
export function parseUploads(raw: FormDataEntryValue | null, workspaceId: string) {
  if (!raw) return [];
  return z
    .array(
      z.object({
        key: z.string().startsWith(`${workspaceId}/`).max(300),
        name: z.string().min(1).max(200),
        mime: z.string().max(100),
        size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
      }),
    )
    .max(10)
    .parse(JSON.parse(String(raw)));
}
