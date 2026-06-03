import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TaskFamily } from "@/types";

export function useFamilies(campaignId: string) {
  return useQuery({
    queryKey: ["families", campaignId],
    queryFn: () => api.get<TaskFamily[]>(`/campaigns/${campaignId}/families`),
    enabled: !!campaignId,
  });
}

export function useFamily(id: string) {
  return useQuery({
    queryKey: ["family", id],
    queryFn: () => api.get<TaskFamily>(`/families/${id}`),
    enabled: !!id,
  });
}

export function useCreateFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      ...data
    }: {
      campaignId: string;
      name: string;
      description?: string;
      color?: string;
      template_schema?: object;
    }) => api.post<TaskFamily>(`/campaigns/${campaignId}/families`, data),
    onSuccess: (_, { campaignId }) =>
      qc.invalidateQueries({ queryKey: ["families", campaignId] }),
  });
}

export function useUpdateFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      campaignId,
      ...data
    }: {
      id: string;
      campaignId: string;
      name?: string;
      description?: string;
      color?: string;
      template_schema?: object;
    }) => api.patch<TaskFamily>(`/families/${id}`, data),
    onSuccess: (_, { campaignId }) =>
      qc.invalidateQueries({ queryKey: ["families", campaignId] }),
  });
}

export function useDeleteFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, campaignId }: { id: string; campaignId: string }) =>
      api.delete(`/families/${id}`),
    onSuccess: (_, { campaignId }) =>
      qc.invalidateQueries({ queryKey: ["families", campaignId] }),
  });
}
