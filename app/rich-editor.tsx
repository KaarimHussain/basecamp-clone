"use client";

import { useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import type { MentionOptions } from "@tiptap/extension-mention";
import type { SuggestionProps } from "@tiptap/suggestion";
import { editorExtensions } from "@/lib/editor";

export type MentionUser = { id: string; label: string };

// Plain-DOM dropdown; Tiptap's mount() handles positioning.
function suggestion(users: MentionUser[]): MentionOptions["suggestion"] {
  return {
    items: ({ query }) => users.filter((u) => u.label.toLowerCase().includes(query.toLowerCase())).slice(0, 6),
    render: () => {
      let el: HTMLUListElement;
      let unmount: (() => void) | undefined;
      let active = 0;
      let props: SuggestionProps<MentionUser>;

      const draw = () => {
        el.replaceChildren(
          ...props.items.map((u: MentionUser, i: number) => {
            const li = document.createElement("li");
            li.textContent = u.label;
            li.setAttribute("role", "option");
            li.setAttribute("aria-selected", String(i === active));
            li.className = `cursor-pointer px-3 py-1 ${i === active ? "bg-zinc-200 dark:bg-zinc-700" : ""}`;
            li.onmousedown = (e) => { e.preventDefault(); props.command(u); };
            return li;
          }),
        );
        el.hidden = props.items.length === 0;
      };

      return {
        onStart: (p) => {
          props = p;
          active = 0;
          el = document.createElement("ul");
          el.setAttribute("role", "listbox");
          el.className = "z-50 rounded border bg-white py-1 text-sm shadow dark:bg-zinc-900";
          draw();
          unmount = p.mount(el);
        },
        onUpdate: (p) => { props = p; active = 0; draw(); },
        onKeyDown: ({ event }) => {
          const n = props.items.length;
          if (!n) return false;
          if (event.key === "ArrowDown") active = (active + 1) % n;
          else if (event.key === "ArrowUp") active = (active - 1 + n) % n;
          else if (event.key === "Enter") { props.command(props.items[active]); return true; }
          else return false;
          draw();
          return true;
        },
        onExit: () => unmount?.(),
      };
    },
  };
}

// Writes the editor's JSON into a hidden input so plain <form action> works.
export default function RichEditor({ name, users, initial, placeholder }: {
  name: string;
  users: MentionUser[];
  initial?: JSONContent | null;
  placeholder?: string;
}) {
  const [json, setJson] = useState(() => JSON.stringify(initial ?? { type: "doc", content: [] }));
  const editor = useEditor({
    extensions: editorExtensions(suggestion(users)),
    content: initial ?? undefined,
    immediatelyRender: false, // SSR-safe
    editorProps: {
      attributes: {
        class: "prose-sm min-h-24 rounded border px-3 py-2 focus:outline-none",
        "aria-label": placeholder ?? name,
      },
    },
    onUpdate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
  });

  return (
    <div className="rich">
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={json} />
    </div>
  );
}
