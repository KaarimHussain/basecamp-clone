// Shared by Next.js and the standalone socket service, so no "server-only" here.
import { createHmac, timingSafeEqual } from "node:crypto";

export type RealtimeClaims = { uid: string; ws: string; exp: number };

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function createToken(claims: Omit<RealtimeClaims, "exp">, secret: string, ttlSec = 3600) {
  const data = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

export function verifyToken(token: string, secret: string): RealtimeClaims | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const claims = JSON.parse(Buffer.from(data, "base64url").toString()) as RealtimeClaims;
  return claims.exp > Date.now() / 1000 ? claims : null;
}
