"use client";

import { useState } from "react";
import type { JSONContent } from "@tiptap/react";
import RichEditor, { type MentionUser } from "@/app/rich-editor";
import Uploader from "@/app/uploader";
import { Button } from "@/components/ui/button";

// One form for new comments (with uploads) and for editing an existing one.
export default function Composer({ action, users, hidden, initial, uploads = true, label = "Comment" }: {
  action: (form: FormData) => Promise<void>;
  users: MentionUser[];
  hidden: Record<string, string>;
  initial?: JSONContent;
  uploads?: boolean;
  label?: string;
}) {
  const [key, setKey] = useState(0); // remount clears editor + uploads after submit
  return (
    <form
      key={key}
      action={async (form) => {
        await action(form);
        setKey((k) => k + 1);
      }}
      className="flex flex-col gap-2"
    >
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <RichEditor name="body" users={users} initial={initial} placeholder="Add a comment… type @ to mention someone" />
      <div className="flex items-start justify-between gap-2">
        {uploads ? <Uploader /> : <span />}
        <Button type="submit" size="sm">{label === "Comment" ? "Add this comment" : label}</Button>
      </div>
    </form>
  );
}
