"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Plus, Link2, UserPlus, Trash2, Pencil, ChevronRight, ChevronDown, GripVertical } from "lucide-react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { useCampaign } from "@/hooks/useCampaigns";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import { useUsers } from "@/hooks/useUsers";
import { useIsAdmin } from "@/hooks/useRole";
import { useAuthStore } from "@/lib/store";
import { taskColor } from "@/lib/taskColor";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TaskStatus, TaskWithExtras, User } from "@/types";

const STATUS_COLS: { key: TaskStatus; label: string; bg: string; cardBg: string }[] = [
  { key: "todo",        label: "To Do",       bg: "bg-zinc-100 dark:bg-zinc-800/60",   cardBg: "bg-card dark:bg-zinc-700/50" },
  { key: "in_progress", label: "In Progress",  bg: "bg-blue-50 dark:bg-blue-950/40",   cardBg: "bg-card dark:bg-blue-900/25" },
  { key: "done",        label: "Done",         bg: "bg-green-50 dark:bg-green-950/40", cardBg: "bg-card dark:bg-green-900/25" },
];

// Build a shallow tree: for each task, find its "primary parent" within the same column.
// Primary parent = first entry in depends_on that exists in the same column.
function buildColumnTree(tasks: TaskWithExtras[]) {
  const ids = new Set(tasks.map((t) => t.id));
  const childrenOf = new Map<string, TaskWithExtras[]>();
  const hasParent = new Set<string>();

  for (const task of tasks) {
    const parentId = task.depends_on.find((d) => ids.has(d));
    if (parentId) {
      hasParent.add(task.id);
      const arr = childrenOf.get(parentId) ?? [];
      arr.push(task);
      childrenOf.set(parentId, arr);
    }
  }

  const roots = tasks.filter((t) => !hasParent.has(t.id));
  return { roots, childrenOf };
}

// ── TaskCard ──────────────────────────────────────────────────────────────────
function TaskCard({
  task, users, isAdmin, canEdit, cardBg,
  hasChildren, isExpanded,
  onToggle, onEdit, onAssign, onDelete,
}: {
  task: TaskWithExtras;
  users: User[];
  isAdmin: boolean;
  canEdit: boolean;
  cardBg: string;
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAssign: (taskId: string, userId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const color = taskColor(task.id);
  const assignedUsers = users.filter((u) => task.assignee_ids.includes(u.id));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 }}
      className={`group ${cardBg} rounded-xl border p-3 space-y-2 select-none`}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle — only this area initiates drag */}
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 mt-0.5 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          aria-label="Drag to move"
        >
          <GripVertical size={14} />
        </button>

        {/* Expand / collapse toggle */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`mt-0.5 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors ${hasChildren ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: color }} />
        <p className="text-sm font-semibold leading-snug flex-1">{task.title}</p>

        {/* Edit + Delete buttons */}
        {canEdit && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Pencil size={12} />
          </button>
        )}
        {isAdmin && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-red-500"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 pl-5">{task.description}</p>
      )}

      {task.depends_on.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground pl-5">
          <Link2 size={9} />
          <span className="truncate text-xs opacity-60">{task.depends_on.length} dep{task.depends_on.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {task.due_date && (
        <p className="text-xs text-muted-foreground pl-5">Due {new Date(task.due_date).toLocaleDateString()}</p>
      )}

      <div className="flex items-center justify-between pl-5 pt-0.5" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap gap-1">
          {assignedUsers.map((u) => (
            <span key={u.id} className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}22`, color }}>
              {u.name}
            </span>
          ))}
        </div>
        {isAdmin && (
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

// ── TaskTree (recursive) ──────────────────────────────────────────────────────
function TaskTree({
  task, childrenOf, depth, expanded, onToggle,
  users, isAdmin, canEdit, cardBg,
  onEdit, onAssign, onDelete,
}: {
  task: TaskWithExtras;
  childrenOf: Map<string, TaskWithExtras[]>;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  users: User[];
  isAdmin: boolean;
  canEdit: (t: TaskWithExtras) => boolean;
  cardBg: string;
  onEdit: (t: TaskWithExtras) => void;
  onAssign: (taskId: string, userId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const children = childrenOf.get(task.id) ?? [];
  const isExpanded = expanded.has(task.id);

  return (
    <div style={{ marginLeft: depth * 14 }}>
      <TaskCard
        task={task}
        users={users}
        isAdmin={isAdmin}
        canEdit={canEdit(task)}
        cardBg={cardBg}
        hasChildren={children.length > 0}
        isExpanded={isExpanded}
        onToggle={() => onToggle(task.id)}
        onEdit={() => onEdit(task)}
        onAssign={onAssign}
        onDelete={onDelete}
      />
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {children.map((child) => (
            <TaskTree
              key={child.id}
              task={child}
              childrenOf={childrenOf}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              users={users}
              isAdmin={isAdmin}
              canEdit={canEdit}
              cardBg={cardBg}
              onEdit={onEdit}
              onAssign={onAssign}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column (droppable) ────────────────────────────────────────────────────────
function Column({
  col, tasks, expanded, onToggle, users, isAdmin, canEdit,
  onEdit, onAssign, onDelete,
}: {
  col: { key: TaskStatus; label: string; bg: string; cardBg: string };
  tasks: TaskWithExtras[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  users: User[];
  isAdmin: boolean;
  canEdit: (t: TaskWithExtras) => boolean;
  onEdit: (t: TaskWithExtras) => void;
  onAssign: (taskId: string, userId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const { roots, childrenOf } = buildColumnTree(tasks);

  return (
    <div ref={setNodeRef} className={`rounded-xl p-3 min-h-[200px] transition-colors ${col.bg} ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</h3>
        <span className="text-xs bg-white/60 dark:bg-black/20 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {roots.map((task) => (
          <TaskTree
            key={task.id}
            task={task}
            childrenOf={childrenOf}
            depth={0}
            expanded={expanded}
            onToggle={onToggle}
            users={users}
            isAdmin={isAdmin}
            canEdit={canEdit}
            cardBg={col.cardBg}
            onEdit={onEdit}
            onAssign={onAssign}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ── EditDialog ────────────────────────────────────────────────────────────────
function EditDialog({
  task, allTasks, users, campaignId, isAdmin, onClose,
}: {
  task: TaskWithExtras;
  allTasks: TaskWithExtras[];
  users: User[];
  campaignId: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [startDate, setStartDate] = useState(task.start_date ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([...task.assignee_ids]);
  const [depsIds, setDepsIds] = useState<string[]>([...task.depends_on]);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/tasks/${task.id}`, {
        title,
        description: description || undefined,
        start_date: startDate || undefined,
        due_date: dueDate || undefined,
      });

      // Assignee diffs
      for (const id of task.assignee_ids) {
        if (!assigneeIds.includes(id))
          await api.delete(`/tasks/${task.id}/assignees/${id}`);
      }
      for (const id of assigneeIds) {
        if (!task.assignee_ids.includes(id))
          await api.post(`/tasks/${task.id}/assignees`, { user_id: id });
      }

      // Dependency diffs
      for (const id of task.depends_on) {
        if (!depsIds.includes(id))
          await api.delete(`/tasks/${task.id}/dependencies/${id}`);
      }
      for (const id of depsIds) {
        if (!task.depends_on.includes(id))
          await api.post(`/tasks/${task.id}/dependencies`, { depends_on: id });
      }

      qc.invalidateQueries({ queryKey: ["tasks", campaignId] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const otherTasks = allTasks.filter((t) => t.id !== task.id);

  const toggleAssignee = (id: string) =>
    setAssigneeIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const toggleDep = (id: string) =>
    setDepsIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-4 mt-2">

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Title *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Start Date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Due Date</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        {isAdmin && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assignees</label>
            <div className="flex flex-wrap gap-2">
              {users.map((u) => {
                const sel = assigneeIds.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${sel ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-gray-900" : "border-gray-200 dark:border-gray-600 hover:border-gray-400"}`}>
                    {u.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isAdmin && otherTasks.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Dependencies</label>
            <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
              {otherTasks.map((t) => {
                const sel = depsIds.includes(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => toggleDep(t.id)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between transition-colors ${sel ? "bg-gray-100 dark:bg-gray-800 font-medium" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}>
                    <span className="truncate">{t.title}</span>
                    <span className={`ml-2 text-xs flex-shrink-0 px-1.5 py-0.5 rounded-full ${
                      t.status === "done" ? "bg-green-100 text-green-700" :
                      t.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                      "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                    }`}>{t.status === "in_progress" ? "In Progress" : t.status === "done" ? "Done" : "To Do"}</span>
                    {sel && <span className="text-green-500 ml-1">✓</span>}
                  </button>
                );
              })}
            </div>
            {depsIds.length > 0 && (
              <p className="text-xs text-muted-foreground">{depsIds.length} selected</p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1" disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </DialogContent>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign } = useCampaign(id);
  const { data: tasks = [], isLoading } = useTasks(id);
  const { data: users = [] } = useUsers();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const isAdmin = useIsAdmin();
  const currentUser = useAuthStore((s) => s.user);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<TaskWithExtras | null>(null);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  // New task form
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newAssigneeIds, setNewAssigneeIds] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const canEdit = useCallback((task: TaskWithExtras) =>
    isAdmin || task.assignee_ids.includes(currentUser?.id ?? ""), [isAdmin, currentUser]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleAssign = async (taskId: string, userId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.assignee_ids.includes(userId)) {
      await api.delete(`/tasks/${taskId}/assignees/${userId}`);
    } else {
      await api.post(`/tasks/${taskId}/assignees`, { user_id: userId });
    }
    updateTask.mutate({ id: taskId, campaignId: id });
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
    if (!task || task.status === newStatus || !canEdit(task)) return;

    if (newStatus === "done" && task.blocked_by_incomplete) {
      setBlockMsg("Cannot mark as done — this task has incomplete dependencies.");
      setTimeout(() => setBlockMsg(null), 3500);
      return;
    }

    updateTask.mutate({ id: taskId, campaignId: id, status: newStatus });
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTask.mutateAsync({
      campaignId: id,
      title: newTitle,
      description: newDesc || undefined,
      due_date: newDueDate || undefined,
      assignee_ids: newAssigneeIds,
    });
    setNewTitle(""); setNewDesc(""); setNewDueDate(""); setNewAssigneeIds([]);
    setNewOpen(false);
  };

  const draggingTask = draggingId ? tasks.find((t) => t.id === draggingId) : null;

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{campaign?.name ?? "Campaign"}</h1>
          {campaign?.description && <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>}
        </div>
        {isAdmin && (
          <Button size="sm" type="button" className="rounded-full" onClick={() => setNewOpen(true)}>
            <Plus size={16} className="mr-1.5" />New Task
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {STATUS_COLS.map((col) => (
              <Column
                key={col.key}
                col={col}
                tasks={tasks.filter((t) => t.status === col.key)}
                expanded={expanded}
                onToggle={toggleExpanded}
                users={users}
                isAdmin={isAdmin}
                canEdit={canEdit}
                onEdit={setEditingTask}
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

      {/* New task dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <form onSubmit={submitNew} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title *</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Due Date</label>
              <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Assignees</label>
              <div className="flex flex-wrap gap-2">
                {users.map((u) => {
                  const sel = newAssigneeIds.includes(u.id);
                  return (
                    <button key={u.id} type="button"
                      onClick={() => setNewAssigneeIds((ids) => sel ? ids.filter((i) => i !== u.id) : [...ids, u.id])}
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

      {/* Edit task dialog */}
      <Dialog open={!!editingTask} onOpenChange={(o) => !o && setEditingTask(null)}>
        {editingTask && (
          <EditDialog
            key={editingTask.id}
            task={editingTask}
            allTasks={tasks}
            users={users}
            campaignId={id}
            isAdmin={isAdmin}
            onClose={() => setEditingTask(null)}
          />
        )}
      </Dialog>

      {/* Block warning */}
      {blockMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {blockMsg}
        </div>
      )}
    </div>
  );
}
