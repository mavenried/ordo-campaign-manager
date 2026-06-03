"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, Users, Calendar,
  MessageSquare, LogOut, Sun, Moon, CheckSquare, Settings, X,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { useThemeStore, THEMES } from "@/lib/theme";
import { useIsAdmin } from "@/hooks/useRole";
import { cn } from "@/lib/utils";

const navItems = (campaignId: string | null, isAdmin: boolean) => [
  { href: "/campaigns",  label: "Campaigns",  icon: LayoutDashboard },
  { href: "/my-tasks",   label: "My Tasks",   icon: CheckSquare },
  { href: "/calendar",   label: "Calendar",   icon: Calendar },
  ...(campaignId ? [
    { href: `/campaigns/${campaignId}`,            label: "Tasks",   icon: FolderKanban },
    { href: `/campaigns/${campaignId}/assignees`,  label: "Members", icon: Users },
    { href: `/campaigns/${campaignId}/chat`,       label: "AI Chat", icon: MessageSquare },
  ] : []),
  ...(isAdmin ? [{ href: "/settings", label: "Settings", icon: Settings }] : []),
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const params = useParams();
  const campaignId = (params?.id as string) ?? null;
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { mode, name, toggleMode, setTheme } = useThemeStore();
  const isAdmin = useIsAdmin();

  // Close drawer on navigation
  useEffect(() => {
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={cn(
        "w-56 flex flex-col bg-sidebar border-r border-sidebar-border flex-shrink-0",
        // Mobile: fixed drawer sliding in from left
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200",
        // Desktop: static, always visible
        "md:relative md:z-auto md:translate-x-0 md:transition-none",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        {/* Mobile close button */}
        <button
          className="md:hidden absolute top-3 right-3 p-1.5 text-sidebar-foreground hover:text-sidebar-foreground-active transition-colors"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={16} />
        </button>

        {/* Logo */}
        <div className="px-4 py-5 border-b border-sidebar-border flex flex-col items-center">
          <Link href="/campaigns">
            <img src="/logo.svg" alt="Logo" className="h-16 w-auto invert" />
          </Link>
          {user && <p className="text-xs mt-0.5 truncate text-sidebar-foreground">{user.name}</p>}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {navItems(campaignId, isAdmin).map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground-active font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground-active"
                )}>
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="border-t border-sidebar-border">
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground opacity-50 font-medium">Theme</p>
            <div className="flex gap-1.5 flex-wrap">
              {THEMES.map((t) => {
                const color = mode === "dark" ? t.dark : t.light;
                return (
                  <button
                    key={t.name}
                    title={t.label}
                    onClick={() => setTheme(t.name)}
                    className={cn(
                      "w-5 h-5 rounded-full transition-all ring-offset-1 ring-offset-sidebar",
                      name === t.name ? "ring-2 ring-sidebar-foreground-active scale-110" : "opacity-60 hover:opacity-100"
                    )}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
            </div>
          </div>

          <button onClick={toggleMode}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-sidebar-foreground hover:text-sidebar-foreground-active hover:bg-sidebar-accent transition-colors">
            {mode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {mode === "dark" ? "Light mode" : "Dark mode"}
          </button>

          <button onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-sidebar-foreground hover:text-sidebar-foreground-active hover:bg-sidebar-accent transition-colors">
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
