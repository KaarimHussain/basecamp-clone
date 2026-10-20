"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

// Catches errors thrown while rendering a page or running a form action.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="text-6xl" aria-hidden>🛠️</span>
      <h1 className="text-3xl font-extrabold">Something went wrong</h1>
      <p className="max-w-sm text-muted-foreground">
        That didn&apos;t work. Try again; if it keeps happening, tell the owner
        {error.digest && <> and mention code <code className="rounded bg-muted px-1">{error.digest}</code></>}.
      </p>
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>Back to Home</Link>
      </div>
    </main>
  );
}
