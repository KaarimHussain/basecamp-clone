"use client";

import { useState } from "react";

export type Upload = { key: string; name: string; mime: string; size: number };

const MAX = 25 * 1024 * 1024;

// Uploads straight to R2 via presigned PUT, then exposes the results as a hidden
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
          const mime = f.type || "application/octet-stream";
          const res = await fetch("/api/uploads/presign", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: f.name, mime, size: f.size }),
          });
          if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
          const { key, url } = await res.json();
          const put = await fetch(url, { method: "PUT", headers: { "content-type": mime }, body: f });
          if (!put.ok) throw new Error("Upload to storage failed");
          return { key, name: f.name, mime, size: f.size };
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
    <div className="text-sm">
      <label className="cursor-pointer underline">
        {busy ? "Uploading…" : "Attach files"}
        <input type="file" multiple onChange={onPick} disabled={busy} className="sr-only" />
      </label>
      {files.length > 0 && (
        <ul className="mt-1 text-zinc-500">
          {files.map((f) => (
            <li key={f.key}>
              {f.name}{" "}
              <button type="button" onClick={() => setFiles(files.filter((x) => x !== f))} className="underline" aria-label={`Remove ${f.name}`}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-red-600" role="alert">{error}</p>}
      <input type="hidden" name="uploads" value={JSON.stringify(files)} />
    </div>
  );
}
