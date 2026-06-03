"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { postAndStream } from "@/lib/sse";
import { Markdown } from "@/components/ui/Markdown";

interface Props {
  campaignId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (familyName: string, schema: object, color: string) => void;
}

interface Msg {
  role: "user" | "assistant";
  text: string;
}

export function WizardModal({ campaignId, open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<"name" | "chat" | "done">("name");
  const [familyName, setFamilyName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [schema, setSchema] = useState<object | null>(null);
  const sseRef = useRef<{ close: () => void } | null>(null);

  const startWizard = async (e: React.FormEvent) => {
    e.preventDefault();
    setStreaming(true);
    try {
      const res = await api.post<{ session_id: string; message: string }>("/wizard/start", {
        family_name: familyName,
        campaign_id: campaignId,
      });
      setSessionId(res.session_id);
      setMessages([{ role: "assistant", text: res.message }]);
      setStep("chat");
    } finally {
      setStreaming(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !sessionId) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setStreaming(true);

    let assistantText = "";
    setMessages((m) => [...m, { role: "assistant", text: "" }]);

    sseRef.current = await postAndStream(
      `/wizard/${sessionId}/message`,
      { content: userMsg },
      (chunk) => {
        assistantText += chunk;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", text: assistantText };
          return copy;
        });
      },
      () => setStreaming(false),
      () => setStreaming(false),
    );
  };

  const finalize = async () => {
    if (!sessionId) return;
    setStreaming(true);
    try {
      const res = await api.post<{ template_schema: object }>(`/wizard/${sessionId}/finalize`);
      setSchema(res.template_schema);
      setStep("done");
    } finally {
      setStreaming(false);
    }
  };

  const handleCreate = () => {
    if (schema) onCreated(familyName, schema, color);
    handleClose();
  };

  const handleClose = () => {
    sseRef.current?.close();
    setStep("name");
    setFamilyName("");
    setSessionId(null);
    setMessages([]);
    setInput("");
    setSchema(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Task Family</DialogTitle>
        </DialogHeader>

        {step === "name" && (
          <form onSubmit={startWizard} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Family Name</label>
              <Input
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="e.g. Marketing Campaign"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Color</label>
              <div className="flex gap-2 flex-wrap">
                {["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? "#000" : "transparent",
                    }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={streaming}>
              {streaming ? "Starting…" : "Start Template Wizard"}
            </Button>
          </form>
        )}

        {step === "chat" && (
          <div className="space-y-3 mt-2">
            <div className="h-72 overflow-y-auto space-y-3 pr-1">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-sm px-3 py-2 rounded-lg max-w-[85%] ${
                    m.role === "user"
                      ? "ml-auto bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  {m.text
                    ? m.role === "assistant"
                      ? <Markdown>{m.text}</Markdown>
                      : <span className="whitespace-pre-wrap">{m.text}</span>
                    : <span className="opacity-40">…</span>
                  }
                </div>
              ))}
            </div>
            <form onSubmit={sendMessage} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Your answer…"
                disabled={streaming}
                className="flex-1"
              />
              <Button type="submit" disabled={streaming || !input.trim()}>
                Send
              </Button>
            </form>
            <Button
              variant="outline"
              className="w-full"
              onClick={finalize}
              disabled={streaming || messages.length < 4}
            >
              Generate Template
            </Button>
          </div>
        )}

        {step === "done" && schema && (
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Template generated with{" "}
              {(schema as { fields: unknown[] }).fields?.length ?? 0} fields. Ready to create the
              family?
            </p>
            <pre className="bg-gray-50 dark:bg-gray-800 rounded p-3 text-xs overflow-auto max-h-40">
              {JSON.stringify(schema, null, 2)}
            </pre>
            <Button className="w-full" onClick={handleCreate}>
              Create Family
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
