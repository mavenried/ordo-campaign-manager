import type { TaskStatus } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        STATUS_STYLES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
