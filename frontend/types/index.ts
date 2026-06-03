export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "multiselect" | "textarea";
  required: boolean;
  options?: string[];
}

export interface TemplateSchema {
  fields: TemplateField[];
}

export interface TaskFamily {
  id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  color: string;
  template_schema: TemplateSchema;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  campaign_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAssignees extends Task {
  assignee_ids: string[];
  depends_on: string[];
  blocked_by_incomplete: boolean;
}

export interface TaskWithExtras extends Task {
  assignee_ids: string[];
  depends_on: string[];
  blocked_by_incomplete: boolean;
}

export interface AssignedTask {
  id: string;
  campaign_id: string | null;
  campaign_name: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  depends_on: string[];
  assignee_ids: string[];
}

export interface CalendarTask {
  id: string;
  title: string;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  campaign_id: string | null;
  campaign_name: string;
}

export interface ChatSession {
  id: string;
  campaign_id: string | null;
  created_by: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  context_refs: ContextRef[];
  created_at: string;
}

export interface ContextRef {
  type: "task" | "family";
  id: string;
  label?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
