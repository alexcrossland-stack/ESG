import { apiRequest, queryClient, setAuthToken } from "./queryClient";

export async function logout() {
  try { await apiRequest("POST", "/api/auth/logout"); } catch {}
  setAuthToken(null);
  queryClient.clear();
  window.location.href = "/auth";
}
