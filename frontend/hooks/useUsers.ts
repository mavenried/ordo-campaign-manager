import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User } from "@/types";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  });
}
