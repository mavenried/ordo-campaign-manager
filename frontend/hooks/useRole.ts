import { useAuthStore } from "@/lib/store";

export function useIsAdmin() {
  const user = useAuthStore((s) => s.user);
  return user?.role === "admin";
}
