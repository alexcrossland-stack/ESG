import { apiRequest, queryClient } from "./queryClient";

export async function logout() {
  try { await apiRequest("POST", "/api/auth/logout"); } catch {}
  queryClient.clear();
  window.location.href = "/auth";
}
