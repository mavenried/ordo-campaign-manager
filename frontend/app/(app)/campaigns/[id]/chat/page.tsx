"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { Send, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { postAndStream } from "@/lib/sse";
import type { ChatSession, ChatMessage } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/Markdown";
import { useDeleteChatSession } from "@/hooks/useCampaigns";

export default function ChatPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const deleteSession = useDeleteChatSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const sseRef = useRef<{ close: () => void } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<ChatSession[]>("/chat/sessions").then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    api.get<ChatMessage[]>(`/chat/sessions/${activeSession}/messages`)
      .then(setMessages)
      .catch(() => {});
  }, [activeSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const newSession = async () => {
    const s = await api.post<ChatSession>("/chat/sessions", { campaign_id: projectId });
    setSessions((prev) => [s, ...prev]);
    setActiveSession(s.id);
    setMessages([]);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeSession) return;
    const content = input.trim();
    setInput("");
    setStreaming(true);

    setMessages((m) => [
      ...m,
      {
        id: `tmp-user-${Date.now()}`,
        session_id: activeSession,
        role: "user",
        content,
        context_refs: [],
        created_at: new Date().toISOString(),
      },
      {
        id: `tmp-ai-${Date.now()}`,
        session_id: activeSession,
        role: "assistant",
        content: "",
        context_refs: [],
        created_at: new Date().toISOString(),
      },
    ]);

    let aiText = "";
    sseRef.current = await postAndStream(
      `/chat/sessions/${activeSession}/message`,
      { content },
      (chunk) => {
        aiText += chunk;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: aiText };
          return copy;
        });
      },
      () => setStreaming(false),
      () => setStreaming(false),
    );
  };

  return (
    <div className="flex h-screen">
      {/* Session list */}
      <aside className="w-56 border-r bg-card flex flex-col">
        <div className="p-3 border-b">
          <Button size="sm" variant="outline" className="w-full" onClick={newSession}>
            <Plus size={14} className="mr-1.5" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.map((s) => (
            <div key={s.id}
              className={`group flex items-center border-b transition-colors ${
                activeSession === s.id
                  ? "bg-muted"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}>
              <button onClick={() => setActiveSession(s.id)}
                className="flex-1 text-left px-3 py-2.5 text-sm font-medium truncate">
                Chat {new Date(s.created_at).toLocaleDateString()}
              </button>
              <button
                onClick={() => {
                  deleteSession.mutate(s.id);
                  setSessions((prev) => prev.filter((x) => x.id !== s.id));
                  if (activeSession === s.id) setActiveSession(null);
                }}
                className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="font-medium">AI Project Assistant</p>
              <p className="text-sm mt-1">Start a new chat to brainstorm and ideate.</p>
              <Button className="mt-4" onClick={newSession}>
                New Chat
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                      m.role === "user"
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "bg-muted text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {m.content
                      ? m.role === "assistant"
                        ? <Markdown>{m.content}</Markdown>
                        : <span className="whitespace-pre-wrap">{m.content}</span>
                      : <span className="opacity-40">…</span>
                    }
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={send} className="p-4 border-t flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your project…"
                className="flex-1"
                autoFocus
              />
              <Button type="submit" disabled={streaming || !input.trim()}>
                <Send size={16} />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
