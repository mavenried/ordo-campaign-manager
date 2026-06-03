import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TaskStatus, TaskWithExtras } from "@/types";

export function useTasks(campaignId: string) {
  return useQuery({
    queryKey: ["tasks", campaignId],
    queryFn: () => api.get<TaskWithExtras[]>(`/campaigns/${campaignId}/tasks`),
    enabled: !!campaignId,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ["task", id],
    queryFn: () => api.get<TaskWithExtras>(`/tasks/${id}`),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      ...data
    }: {
      campaignId: string;
      title: string;
      description?: string;
      start_date?: string;
      due_date?: string;
      assignee_ids?: string[];
      depends_on?: string[];
    }) => api.post<TaskWithExtras>(`/campaigns/${campaignId}/tasks`, data),
    onSuccess: (_, { campaignId }) =>
      qc.invalidateQueries({ queryKey: ["tasks", campaignId] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      campaignId,
      ...data
    }: {
      id: string;
      campaignId: string;
      title?: string;
      description?: string;
      status?: TaskStatus;
      start_date?: string;
      due_date?: string;
    }) => api.patch<TaskWithExtras>(`/tasks/${id}`, data),
    onSuccess: (_, { campaignId }) =>
      qc.invalidateQueries({ queryKey: ["tasks", campaignId] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, campaignId }: { id: string; campaignId: string }) =>
      api.delete(`/tasks/${id}`),
    onSuccess: (_, { campaignId }) =>
      qc.invalidateQueries({ queryKey: ["tasks", campaignId] }),
  });
}
