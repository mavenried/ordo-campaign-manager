"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { getToken } from "@/lib/auth";
import { useAuthStore } from "@/lib/store";
import { useThemeStore } from "@/lib/theme";
import { Sidebar } from "@/components/layout/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const init = useAuthStore((s) => s.init);
  const initTheme = useThemeStore((s) => s.init);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    init();
    initTheme();
    if (!getToken()) router.replace("/login");
  }, [init, initTheme, router]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center gap-3 px-4 h-14 bg-sidebar border-b border-sidebar-border flex-shrink-0 z-30">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 -ml-1 text-sidebar-foreground hover:text-sidebar-foreground-active transition-colors"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <img src="/logo.svg" alt="Ordo" className="h-8 w-auto invert" />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
