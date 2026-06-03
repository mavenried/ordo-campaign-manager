"use client";

import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply theme before paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var s = JSON.parse(localStorage.getItem('ordo-theme') || '{}');
              var name = s.name || 'slate';
              var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              var mode = s.mode || (prefersDark ? 'dark' : 'light');
              document.documentElement.setAttribute('data-theme', name);
              if (mode === 'dark') document.documentElement.classList.add('dark');
            } catch(e) {
              document.documentElement.setAttribute('data-theme', 'slate');
            }
          })();
        `}} />
      </head>
      <body className="antialiased">
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </body>
    </html>
  );
}
