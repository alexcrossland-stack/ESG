import { queryClient } from "./queryClient";

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  queryClient.clear();
  window.location.href = "/auth";
}
