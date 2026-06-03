"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUsers } from "@/hooks/useUsers";
import { useIsAdmin } from "@/hooks/useRole";
import { useAuthStore } from "@/lib/store";
import { api } from "@/lib/api";
import type { User } from "@/types";

function RoleToggle({ user, currentUserId }: { user: User; currentUserId: string | undefined }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const isSelf = user.id === currentUserId;
  const isAdmin = user.role === "admin";

  const toggle = async () => {
    setPending(true);
    try {
      await api.patch(`/users/${user.id}/role`, { role: isAdmin ? "member" : "admin" });
      qc.invalidateQueries({ queryKey: ["users"] });
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={pending || isSelf}
      className={`text-xs px-3 py-1 rounded-full font-medium transition-colors border ${
        isAdmin
          ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800"
          : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-zinc-800 dark:text-gray-400 dark:border-zinc-700"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {pending ? "…" : isAdmin ? "Admin" : "Member"}
    </button>
  );
}

export default function SettingsPage() {
  const { data: users = [], isLoading } = useUsers();
  const isAdmin = useIsAdmin();
  const currentUser = useAuthStore((s) => s.user);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">Manage member roles. Click a role badge to toggle between Admin and Member.</p>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Members</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="bg-card rounded-xl border px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <RoleToggle user={u} currentUserId={currentUser?.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
