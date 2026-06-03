"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Plus, Megaphone, Loader2, Trash2 } from "lucide-react";
import { useCampaigns, useCreateCampaign, useDeleteCampaign } from "@/hooks/useCampaigns";
import { useIsAssigner } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/Markdown";
import { api } from "@/lib/api";
import { postAndStream } from "@/lib/sse";
import type { Campaign } from "@/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Msg { role: "user" | "assistant"; text: string; }

type Step = "name" | "chat" | "generating" | "done";

export default function CampaignsPage() {
  const { data: campaigns, isLoading, refetch } = useCampaigns();
  const createCampaign = useCreateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const isAssigner = useIsAssigner();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("name");
  const [campaignName, setCampaignName] = useState("");
  const [description, setDescription] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [tasksCreated, setTasksCreated] = useState(0);
  const sseRef = useRef<{ close: () => void } | null>(null);

  const handleOpen = () => {
    setStep("name"); setCampaignName(""); setDescription("");
    setCampaign(null); setSessionId(null); setMessages([]);
    setInput(""); setStreaming(false);
    setOpen(true);
  };

  const handleClose = () => {
    sseRef.current?.close();
    setOpen(false);
  };

  const startWizard = async (e: React.FormEvent) => {
    e.preventDefault();
    setStreaming(true);
    try {
      // Create the campaign first
      const c = await createCampaign.mutateAsync({ name: campaignName, description: description || undefined });
      setCampaign(c);

      // Start the AI wizard
      const res = await api.post<{ session_id: string; message: string }>("/campaign-wizard/start", {
        campaign_id: c.id,
        campaign_name: campaignName,
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
    const content = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: content }]);
    setStreaming(true);

    let assistantText = "";
    setMessages((m) => [...m, { role: "assistant", text: "" }]);

    sseRef.current = await postAndStream(
      `/campaign-wizard/${sessionId}/message`,
      { content },
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

  const generateTasks = async () => {
    if (!sessionId) return;
    setStep("generating");
    try {
      const res = await api.post<{ tasks_created: number }>(`/campaign-wizard/${sessionId}/generate`);
      setTasksCreated(res.tasks_created);
      setStep("done");
      refetch();
    } catch {
      setStep("chat");
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        {isAssigner && (
          <Button size="sm" className="rounded-full" onClick={handleOpen}>
            <Plus size={16} className="mr-1.5" />
            New Campaign
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : !campaigns?.length ? (
        <div className="text-center py-20 text-muted-foreground">
          <Megaphone size={40} className="mx-auto mb-3 opacity-30" />
          <p>No campaigns yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <div key={c.id} className="relative group bg-card rounded-xl border hover:shadow-sm transition-shadow">
              <Link href={`/campaigns/${c.id}`} className="block p-5">
                <h2 className="font-semibold">{c.name}</h2>
                {c.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                <p className="text-xs text-muted-foreground mt-3">{new Date(c.created_at).toLocaleDateString()}</p>
              </Link>
              {isAssigner && (
                <AlertDialog>
                  <AlertDialogTrigger>
                    <button className="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                      <Trash2 size={14} />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{c.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the campaign and all its tasks. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => deleteCampaign.mutate(c.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Campaign Creation Wizard */}
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {step === "name" ? "New Campaign" :
               step === "generating" ? "Generating Tasks…" :
               step === "done" ? "Campaign Ready!" :
               `Planning: ${campaignName}`}
            </DialogTitle>
          </DialogHeader>

          {step === "name" && (
            <form onSubmit={startWizard} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Campaign Name</label>
                <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Product Launch Q3" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Brief Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — a sentence about the campaign" />
              </div>
              <Button type="submit" className="w-full" disabled={streaming}>
                {streaming ? <><Loader2 size={14} className="mr-2 animate-spin" />Starting…</> : "Start Planning with AI"}
              </Button>
            </form>
          )}

          {step === "chat" && (
            <div className="space-y-3 mt-2">
              <div className="h-72 overflow-y-auto space-y-3 pr-1">
                {messages.map((m, i) => (
                  <div key={i} className={`text-sm px-3 py-2 rounded-lg max-w-[85%] ${
                    m.role === "user"
                      ? "ml-auto bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                      : "bg-muted text-gray-900 dark:text-gray-100"
                  }`}>
                    {m.text
                      ? m.role === "assistant" ? <Markdown>{m.text}</Markdown> : <span className="whitespace-pre-wrap">{m.text}</span>
                      : <span className="opacity-40">…</span>
                    }
                  </div>
                ))}
              </div>
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder="Your answer…" disabled={streaming} className="flex-1" />
                <Button type="submit" disabled={streaming || !input.trim()}>Send</Button>
              </form>
              <Button variant="outline" className="w-full" onClick={generateTasks} disabled={streaming || messages.length < 4}>
                Generate Tasks
              </Button>
            </div>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">AI is generating your task breakdown…</p>
            </div>
          )}

          {step === "done" && (
            <div className="space-y-4 mt-2 text-center">
              <div className="text-4xl">✓</div>
              <p className="font-medium">{tasksCreated} tasks created for <span className="text-primary">{campaignName}</span></p>
              <p className="text-sm text-muted-foreground">Your campaign is ready with a full task breakdown and dependencies.</p>
              <div className="flex gap-2">
                <Link href={`/campaigns/${campaign?.id}`} onClick={handleClose}
                  className="flex-1 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 text-sm font-medium">
                  Open Campaign
                </Link>
                <Button variant="outline" onClick={handleClose}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
