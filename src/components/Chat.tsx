"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase, type ChatMessage } from "@/lib/supabase";
import { avatarColor } from "@/lib/identity";

const MAX_MESSAGE_LENGTH = 2000;

export default function Chat({
  room,
  username,
  avatar,
}: {
  room: string;
  username: string;
  avatar: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("messages")
      .select("*")
      .eq("room", room)
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(error.message);
          return;
        }
        // Merge rather than replace: a realtime INSERT can arrive on the
        // subscription below before this fetch resolves, and overwriting
        // state here would drop it.
        setMessages((prev) => {
          const byId = new Map((data ?? []).map((m) => [m.id, m]));
          for (const m of prev) if (!byId.has(m.id)) byId.set(m.id, m);
          return Array.from(byId.values()).sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          );
        });
      });

    const channel = supabase
      .channel(`messages-${room}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room=eq.${room}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [room]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;

    setDraft("");
    const { error } = await supabase.from("messages").insert({
      room,
      username,
      avatar,
      content,
    });
    if (error) {
      setLoadError(error.message);
      setDraft(content);
    }
  }

  return (
    <aside className="flex min-h-0 w-full flex-[2] flex-col border-t border-discord-border bg-discord-bg-secondary md:h-auto md:w-80 md:flex-none md:border-t-0 md:border-l">
      <div className="border-b border-discord-border px-4 py-3 text-sm font-semibold text-discord-text-bright">
        # chat
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {loadError && <p className="text-xs text-discord-red">{loadError}</p>}
        {messages.length === 0 && !loadError && (
          <p className="px-1 text-sm text-discord-text-muted">No messages yet. Say hi.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2 rounded-xl px-1 py-1 hover:bg-white/[0.02]">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${avatarColor(m.avatar)}`}
            >
              {m.avatar}
            </div>
            <div className="min-w-0 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-discord-text-bright">{m.username}</span>
                <span className="text-[10px] text-discord-text-muted">
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="break-words text-discord-text">{m.content}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-discord-border p-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={`Message as ${username}`}
          className="flex-1 rounded-xl bg-discord-input px-3 py-2.5 text-sm text-discord-text-bright outline-none placeholder:text-discord-text-muted focus:ring-2 focus:ring-discord-blurple"
        />
        <button
          type="submit"
          className="rounded-xl bg-discord-blurple px-4 py-2.5 text-sm font-medium text-white transition hover:bg-discord-blurple-hover"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
