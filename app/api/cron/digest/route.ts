import { timingSafeEqual } from "node:crypto";
import { sendDigests } from "@/lib/digest";

// Hit every few minutes by the server's cron:
//   */5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/digest
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await sendDigests());
}
