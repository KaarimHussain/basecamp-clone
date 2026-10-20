import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeToken } from "@/lib/auth-tokens";
import { allow, reset } from "@/lib/throttle";

const credentials = z.object({ email: z.email(), password: z.string().min(1) });

export class Throttled extends CredentialsSignin {
  code = "throttled";
}

// Only people who still belong to a workspace may sign in (removed members are locked out).
async function activeUser(where: { id: string } | { email: string }) {
  const user = await prisma.user.findUnique({ where, include: { memberships: { take: 1 } } });
  return user && user.memberships.length > 0 ? user : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      authorize: async (raw) => {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        // 8 tries per email per 15 minutes slows password guessing to a crawl.
        if (!allow(`login:${email}`, 8, 15 * 60_000)) throw new Throttled();
        const user = await activeUser({ email });
        if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return null;
        reset(`login:${email}`);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    // One-time emailed link (magic sign-in).
    Credentials({
      id: "magic",
      credentials: { token: {} },
      authorize: async (raw) => {
        const token = typeof raw?.token === "string" ? raw.token : "";
        const userId = token && (await consumeToken(token, "MAGIC"));
        const user = userId ? await activeUser({ id: userId }) : null;
        return user ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session: ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
