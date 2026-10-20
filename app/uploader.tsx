"use client";

import { useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Upload = { key: string; name: string; mime: string; size: number };

const MAX = 25 * 1024 * 1024;

// Uploads each file to /api/uploads as soon as it's picked, then exposes the results as a hidden
// "uploads" field for the surrounding server-action form.
export default function Uploader() {
  const [files, setFiles] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])];
    e.target.value = "";
    setError(null);
    if (picked.some((f) => f.size > MAX)) return setError("Files must be 25 MB or smaller.");

    setBusy(true);
    try {
      const done = await Promise.all(
        picked.map(async (f) => {
          const body = new FormData();
          body.append("file", f);
          const res = await fetch("/api/uploads", { method: "POST", body });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Upload failed");
          return json as Upload;
        }),
      );
      setFiles((prev) => [...prev, ...done]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit cursor-pointer has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50", busy && "pointer-events-none opacity-60")}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
        {busy ? "Uploading…" : "Attach files"}
        <input type="file" multiple onChange={onPick} disabled={busy} className="sr-only" />
      </label>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <li key={f.key} className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2.5 text-xs">
              <span className="max-w-40 truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles(files.filter((x) => x !== f))} aria-label={`Remove ${f.name}`} className="grid size-5 place-items-center rounded-full hover:bg-background">
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <input type="hidden" name="uploads" value={JSON.stringify(files)} />
    </div>
  );
}
