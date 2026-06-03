"use client";

import { useRef } from "react";
import type { TemplateField } from "@/types";
import { Input } from "@/components/ui/input";

interface Props {
  fields: TemplateField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function DynamicTaskForm({ fields, values, onChange }: Props) {
  if (!fields.length) return <p className="text-sm text-muted-foreground">No template fields defined.</p>;

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <label className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>

          {(field.type === "text" || field.type === "number") && (
            <Input
              type={field.type}
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              required={field.required}
            />
          )}

          {field.type === "textarea" && (
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px]"
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              required={field.required}
            />
          )}

          {field.type === "date" && (
            <Input
              type="date"
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              required={field.required}
            />
          )}

          {field.type === "select" && (
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={(values[field.key] as string) ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              required={field.required}
            >
              <option value="">Select…</option>
              {field.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}

          {field.type === "multiselect" && (
            <div className="flex flex-wrap gap-2">
              {field.options?.map((o) => {
                const selected = ((values[field.key] as string[]) ?? []).includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => {
                      const current = (values[field.key] as string[]) ?? [];
                      onChange(
                        field.key,
                        selected ? current.filter((v) => v !== o) : [...current, o]
                      );
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      selected
                        ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
