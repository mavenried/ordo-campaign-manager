import { useAuthStore } from "@/lib/store";

export function useIsAssigner() {
  const user = useAuthStore((s) => s.user);
  return user?.role === "assigner";
}
