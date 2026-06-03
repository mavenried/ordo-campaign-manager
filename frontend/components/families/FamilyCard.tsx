"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import type { TaskFamily } from "@/types";

interface Props {
  family: TaskFamily;
  campaignId: string;
  taskCount?: number;
}

export function FamilyCard({ family, campaignId, taskCount }: Props) {
  return (
    <Link href={`/campaigns/${campaignId}/families/${family.id}`}>
      <div className="bg-card rounded-xl border hover:shadow-sm transition-shadow p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: family.color }}
          />
          <h3 className="font-medium truncate">{family.name}</h3>
        </div>
        {family.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{family.description}</p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-auto">
          <Layers size={12} />
          <span>{taskCount ?? family.template_schema.fields.length} fields in template</span>
        </div>
      </div>
    </Link>
  );
}
