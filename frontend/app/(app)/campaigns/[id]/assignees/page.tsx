"use client";

import { useQuery } from "@tanstack/react-query";
import { useUsers } from "@/hooks/useUsers";
import { api } from "@/lib/api";
import { taskColor } from "@/lib/taskColor";
import type { AssignedTask } from "@/types";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    todo: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
    in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
  const labels: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? styles.todo}`}>
      {labels[status] ?? status}
    </span>
  );
}

function MemberCard({ userId, userName, userRole }: { userId: string; userName: string; userRole: string }) {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["user-tasks", userId],
    queryFn: () => api.get<AssignedTask[]>(`/users/${userId}/tasks`),
  });

  return (
    <div className="bg-card rounded-xl border overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between">
        <div>
          <p className="font-medium">{userName}</p>
          <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
        </div>
        <span className="text-sm text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
      </div>
      {isLoading ? (
        <div className="px-5 py-4 text-sm text-muted-foreground">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="px-5 py-4 text-sm text-muted-foreground">No tasks assigned</div>
      ) : (
        <div className="divide-y dark:divide-gray-700">
          {tasks.map((task) => (
            <div key={task.id} className="px-5 py-3 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: taskColor(task.id) }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{task.title}</p>
                <p className="text-xs text-muted-foreground">{task.campaign_name}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {task.due_date && (
                  <span className="text-xs text-muted-foreground">Due {new Date(task.due_date).toLocaleDateString()}</span>
                )}
                <StatusBadge status={task.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MembersPage() {
  const { data: users = [] } = useUsers();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-6">Members</h1>
      <div className="space-y-4">
        {users.map((u) => (
          <MemberCard key={u.id} userId={u.id} userName={u.name} userRole={u.role} />
        ))}
      </div>
    </div>
  );
}
