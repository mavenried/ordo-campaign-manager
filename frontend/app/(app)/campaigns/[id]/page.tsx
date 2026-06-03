"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Plus, Link2, AlertCircle, UserPlus, Trash2 } from "lucide-react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useCampaign } from "@/hooks/useCampaigns";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import { useUsers } from "@/hooks/useUsers";
import { useIsAssigner } from "@/hooks/useRole";
import { useAuthStore } from "@/lib/store";
import { taskColor } from "@/lib/taskColor";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TaskStatus, TaskWithExtras } from "@/types";

const STATUS_COLS: { key: TaskStatus; label: string; bg: string; cardBg: string }[] = [
  { key: "todo",        label: "To Do",       bg: "bg-zinc-100 dark:bg-zinc-800/60",   cardBg: "bg-card dark:bg-zinc-700/50" },
  { key: "in_progress", label: "In Progress",  bg: "bg-blue-50 dark:bg-blue-950/40",   cardBg: "bg-card dark:bg-blue-900/25" },
  { key: "blocked",     label: "Blocked",      bg: "bg-red-50 dark:bg-red-950/40",     cardBg: "bg-card dark:bg-red-900/25" },
  { key: "done",        label: "Done",         bg: "bg-green-50 dark:bg-green-950/40", cardBg: "bg-card dark:bg-green-900/25" },
];

// Build depth map from dependency tree within a task set
function buildDepthMap(tasks: TaskWithExtras[]): Map<string, number> {
  const ids = new Set(tasks.map((t) => t.id));
  const depths = new Map<string, number>();
  const visited = new Set<string>();

  function getDepth(id: string): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0; // cycle guard
    visited.add(id);
    const task = tasks.find((t) => t.id === id);
    if (!task || task.depends_on.length === 0) {
      depths.set(id, 0);
      return 0;
    }
    const parentDeps = task.depends_on.filter((d) => ids.has(d));
    const d = parentDeps.length > 0 ? Math.max(...parentDeps.map(getDepth)) + 1 : 0;
    depths.set(id, d);
    return d;
  }

  tasks.forEach((t) => getDepth(t.id));
  return depths;
}

// Draggable task card
function TaskCard({
  task, depth, taskMap, users, canEdit, isAssigner, cardBg, onStatusChange, onAssign, onDelete,
}: {
  task: TaskWithExtras;
  depth: number;
  taskMap: Map<string, string>;
  isAssigner: boolean;
  users: { id: string; name: string }[];
  canEdit: boolean;
  cardBg: string;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onAssign: (taskId: string, userId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const color = taskColor(task.id);
  const assignedUsers = users.filter((u) => task.assignee_ids.includes(u.id));

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, marginLeft: depth * 16 }}
      className={`group ${cardBg} rounded-xl border p-3 space-y-2 cursor-grab active:cursor-grabbing select-none ${task.blocked_by_incomplete ? "border-l-4 border-l-orange-400" : ""}`}
      {...attributes}
      {...listeners}
    >
      {/* Color dot + title */}
      <div className="flex items-start gap-2">
        <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: color }} />
        <p className="text-sm font-semibold leading-snug flex-1">{task.title}</p>
        {task.blocked_by_incomplete && (
          <span title="Blocked by incomplete dependencies">
            <AlertCircle size={13} className="text-orange-400 flex-shrink-0 mt-0.5" />
          </span>
        )}
        {isAssigner && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-red-500"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {task.description && <p className="text-xs text-muted-foreground line-clamp-2 pl-4">{task.description}</p>}

      {/* Dependencies */}
      {task.depends_on.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground pl-4">
          <Link2 size={9} />
          <span className="truncate">{task.depends_on.map((d) => taskMap.get(d) ?? "…").join(", ")}</span>
        </div>
      )}

      {task.due_date && (
        <p className="text-xs text-muted-foreground pl-4">Due {new Date(task.due_date).toLocaleDateString()}</p>
      )}

      {/* Assignees + assign button */}
      <div className="flex items-center justify-between pl-4 pt-0.5" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap gap-1">
          {assignedUsers.map((u) => (
            <span key={u.id} className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}22`, color }}>
              {u.name}
            </span>
          ))}
        </div>
        {canEdit && (
          <Popover>
            <PopoverTrigger>
              <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 ml-auto">
                <UserPlus size={12} />
                {assignedUsers.length === 0 ? "Assign" : "Change"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
              <p className="text-xs font-medium text-muted-foreground mb-2">Assign to</p>
              {users.map((u) => {
                const assigned = task.assignee_ids.includes(u.id);
                return (
                  <button key={u.id} onClick={() => onAssign(task.id, u.id)}
                    className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between ${assigned ? "font-medium" : ""}`}>
                    {u.name}
                    {assigned && <span className="text-xs text-green-500">✓</span>}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        )}
      </div>

    </div>
  );
}

// Droppable column
function Column({
  col, tasks, depthMap, taskMap, users, canEdit, currentUserId, isAssigner,
  onStatusChange, onAssign, onDelete,
}: {
  col: { key: TaskStatus; label: string; bg: string; cardBg: string };
  tasks: TaskWithExtras[];
  depthMap: Map<string, number>;
  taskMap: Map<string, string>;
  users: { id: string; name: string }[];
  canEdit: (task: TaskWithExtras) => boolean;
  currentUserId?: string;
  isAssigner: boolean;
  onStatusChange: (id: string, s: TaskStatus) => void;
  onAssign: (taskId: string, userId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const sorted = [...tasks].sort((a, b) => (depthMap.get(a.id) ?? 0) - (depthMap.get(b.id) ?? 0));

  return (
    <div ref={setNodeRef} className={`rounded-xl p-3 min-h-[200px] transition-colors ${col.bg} ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</h3>
        <span className="text-xs bg-white/60 dark:bg-black/20 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {sorted.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            depth={depthMap.get(task.id) ?? 0}
            taskMap={taskMap}
            users={users}
            canEdit={canEdit(task)}
            isAssigner={isAssigner}
            cardBg={col.cardBg}
            onStatusChange={onStatusChange}
            onAssign={onAssign}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign } = useCampaign(id);
  const { data: tasks = [], isLoading } = useTasks(id);
  const { data: users = [] } = useUsers();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const isAssigner = useIsAssigner();
  const currentUser = useAuthStore((s) => s.user);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const taskMap = new Map(tasks.map((t) => [t.id, t.title]));
  const depthMap = buildDepthMap(tasks);

  const canEdit = useCallback((task: TaskWithExtras) =>
    isAssigner || task.assignee_ids.includes(currentUser?.id ?? ""), [isAssigner, currentUser]);

  const handleStatusChange = (taskId: string, status: TaskStatus) =>
    updateTask.mutate({ id: taskId, campaignId: id, status });

  const handleAssign = async (taskId: string, userId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.assignee_ids.includes(userId)) {
      await api.delete(`/tasks/${taskId}/assignees/${userId}`);
    } else {
      await api.post(`/tasks/${taskId}/assignees`, { user_id: userId });
    }
    updateTask.mutate({ id: taskId, campaignId: id }); // trigger refetch
  };

  const handleDelete = (taskId: string) => deleteTask.mutate({ id: taskId, campaignId: id });

  const handleDragStart = (e: DragStartEvent) => setDraggingId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = String(over.id) as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus && canEdit(task)) {
      handleStatusChange(taskId, newStatus);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTask.mutateAsync({ campaignId: id, title, description: description || undefined, due_date: dueDate || undefined, assignee_ids: assigneeIds });
    setTitle(""); setDescription(""); setDueDate(""); setAssigneeIds([]);
    setOpen(false);
  };

  const draggingTask = draggingId ? tasks.find((t) => t.id === draggingId) : null;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{campaign?.name ?? "Campaign"}</h1>
          {campaign?.description && <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>}
        </div>
        {isAssigner && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger>
              <Button size="sm" type="button" className="rounded-full"><Plus size={16} className="mr-1.5" />New Task</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3 mt-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Title *</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Description</label>
                  <textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                    value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Due Date</label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Assignees</label>
                  <div className="flex flex-wrap gap-2">
                    {users.map((u) => {
                      const sel = assigneeIds.includes(u.id);
                      return (
                        <button key={u.id} type="button"
                          onClick={() => setAssigneeIds((ids) => sel ? ids.filter((i) => i !== u.id) : [...ids, u.id])}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${sel ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-gray-900" : "border-gray-200 dark:border-gray-600 hover:border-gray-400"}`}>
                          {u.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createTask.isPending}>
                  {createTask.isPending ? "Creating…" : "Create Task"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {STATUS_COLS.map((col) => (
              <Column
                key={col.key}
                col={col}
                tasks={tasks.filter((t) => t.status === col.key)}
                depthMap={depthMap}
                taskMap={taskMap}
                users={users}
                canEdit={canEdit}
                currentUserId={currentUser?.id}
                isAssigner={isAssigner}
                onStatusChange={handleStatusChange}
                onAssign={handleAssign}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <DragOverlay>
            {draggingTask && (
              <div className="bg-card rounded-xl border p-3 shadow-xl opacity-90">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: taskColor(draggingTask.id) }} />
                  <p className="text-sm font-medium">{draggingTask.title}</p>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
