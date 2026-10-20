import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="text-6xl" aria-hidden>🧭</span>
      <h1 className="text-3xl font-extrabold">We couldn&apos;t find that</h1>
      <p className="max-w-sm text-muted-foreground">It may have been archived, moved, or you might not have access to it.</p>
      <Link href="/" className={buttonVariants({ className: "mt-2" })}>Back to Home</Link>
    </main>
  );
}
