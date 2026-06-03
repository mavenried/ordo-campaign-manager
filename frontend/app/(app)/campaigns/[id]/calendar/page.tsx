"use client";

import { useParams } from "next/navigation";
import { useFamilies } from "@/hooks/useFamilies";
import { useTasks } from "@/hooks/useTasks";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { "en-US": enUS },
});

function FamilyTaskEvents({ family }: { family: { id: string; color: string; name: string } }) {
  const { data: tasks } = useTasks(family.id);
  return null;
}

export default function CalendarPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { data: families } = useFamilies(projectId);

  const events = (families ?? []).flatMap((family) => {
    return [];
  });

  const allEvents: { title: string; start: Date; end: Date; resource: { color: string } }[] = [];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-6">Calendar</h1>
      <div className="bg-white rounded-xl border p-4" style={{ height: "calc(100vh - 180px)" }}>
        <Calendar
          localizer={localizer}
          events={allEvents}
          startAccessor="start"
          endAccessor="end"
          eventPropGetter={(event) => ({
            style: {
              backgroundColor: event.resource?.color ?? "#6366f1",
              borderRadius: "4px",
              border: "none",
            },
          })}
        />
      </div>
    </div>
  );
}
