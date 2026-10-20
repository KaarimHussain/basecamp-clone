"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadMessages, markRead, sendMessage } from "@/lib/chat";
import type { ChatMessage } from "@/lib/chat-data";
import Uploader from "@/app/uploader";
import { useRealtime } from "../../realtime";

const PAGE = 50;
const addUnique = (list: ChatMessage[], m: ChatMessage) => (list.some((x) => x.id === m.id) ? list : [...list, m]);

export default function ChatRoom({ channelId, title, meId, names, initial, thread }: {
  channelId: string;
  title: string;
  meId: string;
  names: Record<string, string>;
  initial: ChatMessage[];
  thread: { parent: ChatMessage; replies: ChatMessage[] } | null;
}) {
  const router = useRouter();
  const { socket } = useRealtime();
  const [messages, setMessages] = useState(initial);
  const [hasOlder, setHasOlder] = useState(initial.length === PAGE);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLLIElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    markRead(channelId);
  }, [channelId]);

  useEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView({ block: "end" });
    stickToBottom.current = true;
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (m: ChatMessage) => {
      if (m.channelId !== channelId) return router.refresh(); // other channel: refresh sidebar badges
      if (m.parentId) {
        setMessages((list) => list.map((x) => (x.id === m.parentId ? { ...x, replyCount: x.replyCount + 1 } : x)));
        return;
      }
      setMessages((list) => addUnique(list, m));
      if (m.authorId !== meId) markRead(channelId);
    };
    const onTyping = ({ channelId: c, uid }: { channelId: string; uid: string }) => {
      if (c === channelId && uid !== meId) setTyping((t) => ({ ...t, [uid]: Date.now() + 3000 }));
    };
    socket.on("message:new", onMessage);
    socket.on("typing", onTyping);
    return () => {
      socket.off("message:new", onMessage);
      socket.off("typing", onTyping);
    };
  }, [socket, channelId, meId, router]);

  // Expire typing indicators.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const t = setTimeout(() => setTyping((cur) => Object.fromEntries(Object.entries(cur).filter(([, until]) => until > Date.now()))), 1000);
    return () => clearTimeout(t);
  }, [typing]);

  async function older() {
    const page = await loadMessages(channelId, { before: messages[0]?.id });
    stickToBottom.current = false;
    setMessages((list) => [...page, ...list]);
    setHasOlder(page.length === PAGE);
  }

  const typers = Object.keys(typing).map((uid) => names[uid] ?? "Someone");

  return (
    <div className="flex h-[calc(100dvh-3.25rem)] min-h-96">
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="border-b px-4 py-3 font-semibold">{title}</h1>
        <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
          {hasOlder && (
            <li className="text-center">
              <button onClick={older} className="text-sm underline">Load older messages</button>
            </li>
          )}
          {messages.length === 0 && <li className="text-zinc-500">No messages yet. Say hi.</li>}
          {messages.map((m) => (
            <li key={m.id}>
              <Message m={m} />
              <Link href={`?thread=${m.id}`} scroll={false} className="ml-0 text-xs text-zinc-500 underline">
                {m.replyCount > 0 ? `${m.replyCount} repl${m.replyCount === 1 ? "y" : "ies"}` : "Reply in thread"}
              </Link>
            </li>
          ))}
          <li ref={endRef} aria-hidden />
        </ol>
        <p className="h-5 px-4 text-xs text-zinc-500">{typers.length > 0 && `${typers.join(", ")} ${typers.length > 1 ? "are" : "is"} typing…`}</p>
        <Composer channelId={channelId} onSent={(m) => setMessages((list) => addUnique(list, m))} placeholder={`Message ${title}`} />
      </div>
      {thread && <Thread key={thread.parent.id} channelId={channelId} {...thread} />}
    </div>
  );
}

function Thread({ channelId, parent, replies: initial }: { channelId: string; parent: ChatMessage; replies: ChatMessage[] }) {
  const { socket } = useRealtime();
  const [replies, setReplies] = useState(initial);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (m: ChatMessage) => {
      if (m.parentId === parent.id) setReplies((list) => addUnique(list, m));
    };
    socket.on("message:new", onMessage);
    return () => {
      socket.off("message:new", onMessage);
    };
  }, [socket, parent.id]);

  return (
    <aside aria-label="Thread" className="fixed inset-0 z-20 flex flex-col bg-white md:static md:w-80 md:border-l dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Thread</h2>
        <Link href="?" scroll={false} className="text-sm underline">Close</Link>
      </header>
      <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <li className="border-b pb-3"><Message m={parent} /></li>
        {replies.map((m) => <li key={m.id}><Message m={m} /></li>)}
      </ol>
      <Composer channelId={channelId} parentId={parent.id} onSent={(m) => setReplies((list) => addUnique(list, m))} placeholder="Reply…" />
    </aside>
  );
}

function Message({ m }: { m: ChatMessage }) {
  return (
    <article className="text-sm">
      <div className="text-xs text-zinc-500">
        <strong className="text-zinc-800 dark:text-zinc-200">{m.authorName}</strong>{" "}
        <time dateTime={m.createdAt} suppressHydrationWarning>
          {new Date(m.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
        </time>
      </div>
      {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
      {m.attachments.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-2">
          {m.attachments.map((f) => (
            <li key={f.id}>
              <a href={`/api/attachments/${f.id}`} target="_blank" rel="noopener" className="block rounded border px-2 py-1">
                {f.mime.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- auth-checked file route
                  <img src={`/api/attachments/${f.id}`} alt={f.name} className="max-h-40 max-w-60 object-contain" />
                ) : (
                  <>📎 {f.name}</>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Composer({ channelId, parentId, onSent, placeholder }: {
  channelId: string;
  parentId?: string;
  onSent: (m: ChatMessage) => void;
  placeholder: string;
}) {
  const { socket } = useRealtime();
  const [key, setKey] = useState(0); // remount clears text + uploads
  const lastTyping = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      key={key}
      ref={formRef}
      action={async (form) => {
        const m = await sendMessage(form);
        if (m) onSent(m);
        setKey((k) => k + 1);
      }}
      className="flex flex-col gap-1 border-t p-3"
    >
      <input type="hidden" name="channelId" value={channelId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <textarea
        name="text"
        rows={2}
        maxLength={4000}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus
        className="w-full resize-none rounded border px-3 py-2 text-sm"
        onChange={() => {
          if (Date.now() - lastTyping.current > 2000) {
            lastTyping.current = Date.now();
            socket?.emit("typing", channelId);
          }
        }}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter adds a line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <Uploader />
        <button className="rounded bg-black px-3 py-1 text-sm text-white dark:bg-white dark:text-black">Send</button>
      </div>
    </form>
  );
}
