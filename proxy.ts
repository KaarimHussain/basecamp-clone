import { auth } from "@/auth";

// Optimistic check only; every page/action still verifies via requireMember().
export const proxy = auth((req) => {
  if (!req.auth) return Response.redirect(new URL("/login", req.nextUrl));
});

export const config = {
  matcher: ["/((?!api/auth|login|invite|_next|favicon.ico).*)"],
};
