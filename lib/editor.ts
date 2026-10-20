import StarterKit from "@tiptap/starter-kit";
import Mention, { type MentionOptions } from "@tiptap/extension-mention";

// One schema for the client editor and server-side rendering/validation.
// Links are off so stored JSON can never carry a javascript: href.
export function editorExtensions(suggestion?: MentionOptions["suggestion"]) {
  return [
    StarterKit.configure({ link: false }),
    Mention.configure({
      HTMLAttributes: { class: "mention" },
      ...(suggestion ? { suggestion } : {}),
    }),
  ];
}
