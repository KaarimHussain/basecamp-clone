// Shown while a page's data loads: a skeleton "sheet" in the same shape as real pages.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16" aria-busy="true" aria-label="Loading">
      <div className="mx-auto mb-8 flex flex-col items-center gap-3">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-2xl border bg-card p-6 shadow-paper">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b py-4 last:border-0">
            <div className="size-5 animate-pulse rounded-full bg-muted" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" style={{ maxWidth: `${70 - i * 8}%` }} />
            <div className="size-6 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </main>
  );
}
