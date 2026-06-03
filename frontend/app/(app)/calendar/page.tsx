"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, dateFnsLocalizer, Views, View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { api } from "@/lib/api";
import type { CalendarTask } from "@/types";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { "en-US": enUS },
});

export default function CalendarPage() {
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["calendar"],
    queryFn: () => api.get<CalendarTask[]>("/calendar"),
  });

  // Assign a stable color per campaign using hue rotation
  const campaignColors: Record<string, string> = {};
  const palette = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#14b8a6"];
  let colorIdx = 0;
  tasks.forEach((t) => {
    if (t.campaign_id && !campaignColors[t.campaign_id]) {
      campaignColors[t.campaign_id] = palette[colorIdx++ % palette.length];
    }
  });

  const events = tasks.map((t) => ({
    id: t.id,
    title: `${t.title} · ${t.campaign_name}`,
    start: new Date(t.start_date ?? t.due_date ?? new Date()),
    end: new Date(t.due_date ?? t.start_date ?? new Date()),
    resource: { color: t.campaign_id ? campaignColors[t.campaign_id] : "#6366f1", status: t.status },
  }));

  return (
    <div className="p-4 sm:p-8 h-full flex flex-col">
      <h1 className="text-2xl font-semibold mb-6">Calendar</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex-1 rounded-xl overflow-auto border dark:border-gray-700 calendar-wrapper">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            date={date}
            onNavigate={setDate}
            view={view}
            onView={setView}
            views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
            style={{ height: view === Views.AGENDA ? "auto" : "100%", minHeight: 600 }}
            eventPropGetter={(event) => ({
              style: {
                backgroundColor: (event.resource as { color: string })?.color ?? "#6366f1",
                border: "none",
                borderRadius: "4px",
                fontSize: "12px",
                opacity: event.resource?.status === "done" ? 0.5 : 1,
              },
            })}
          />
        </div>
      )}
    </div>
  );
}
