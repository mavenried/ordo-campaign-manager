"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { api } from "@/lib/api";
import { taskColor } from "@/lib/taskColor";
import type { AssignedTask, TaskStatus } from "@/types";

const STATUS_COLS: { key: TaskStatus; label: string; bg: string; cardBg: string }[] = [
  { key: "todo",        label: "To Do",       bg: "bg-zinc-100 dark:bg-zinc-800/60",   cardBg: "bg-card dark:bg-zinc-700/50" },
  { key: "in_progress", label: "In Progress",  bg: "bg-blue-50 dark:bg-blue-950/40",   cardBg: "bg-card dark:bg-blue-900/25" },
  { key: "done",        label: "Done",         bg: "bg-green-50 dark:bg-green-950/40", cardBg: "bg-card dark:bg-green-900/25" },
];

function TaskCard({ task, cardBg }: { task: AssignedTask; cardBg: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const color = taskColor(task.id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 }}
      className={`${cardBg} rounded-xl border p-3 space-y-1.5 select-none`}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 mt-0.5 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          aria-label="Drag to move"
        >
          <GripVertical size={14} />
        </button>
        <span className="w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: color }} />
        <p className={`text-sm font-semibold leading-snug ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
          {task.title}
        </p>
      </div>
      <div className="pl-9 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">{task.campaign_name}</span>
        {task.due_date && (
          <span className="text-xs text-muted-foreground shrink-0">
            Due {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function Column({ col, tasks }: {
  col: { key: TaskStatus; label: string; bg: string; cardBg: string };
  tasks: AssignedTask[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl p-3 min-h-[200px] transition-colors ${col.bg} ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</h3>
        <span className="text-xs bg-white/60 dark:bg-black/20 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} cardBg={col.cardBg} />
        ))}
      </div>
    </div>
  );
}

export default function MyTasksPage() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => api.get<AssignedTask[]>("/me/tasks"),
  });

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (e: DragStartEvent) => setDraggingId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = String(over.id) as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    api.patch(`/tasks/${taskId}`, { status: newStatus }).then(() => {
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      if (task.campaign_id) qc.invalidateQueries({ queryKey: ["tasks", task.campaign_id] });
    });
  };

  const draggingTask = draggingId ? tasks.find((t) => t.id === draggingId) : null;
  const pending = tasks.filter((t) => t.status !== "done").length;
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">{pending} pending · {done} done</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p>No tasks assigned to you yet.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {STATUS_COLS.map((col) => (
              <Column
                key={col.key}
                col={col}
                tasks={tasks.filter((t) => t.status === col.key)}
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
