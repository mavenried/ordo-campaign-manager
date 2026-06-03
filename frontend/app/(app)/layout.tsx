"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { useAuthStore } from "@/lib/store";
import { useThemeStore } from "@/lib/theme";
import { Sidebar } from "@/components/layout/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const init = useAuthStore((s) => s.init);
  const initTheme = useThemeStore((s) => s.init);

  useEffect(() => {
    init();
    initTheme();
    if (!getToken()) router.replace("/login");
  }, [init, initTheme, router]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
