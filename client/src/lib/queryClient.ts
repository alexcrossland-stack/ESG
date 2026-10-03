import { QueryClient, QueryFunction } from "@tanstack/react-query";

let authToken: string | null = localStorage.getItem("auth_token");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("auth_token", token);
  } else {
    localStorage.removeItem("auth_token");
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

export function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...getAuthHeaders(), ...(init?.headers || {}) };
  return fetch(url, { ...init, headers, credentials: "include" });
}

// Custom query functions must not interpret an HTTP failure as a blank record.
export async function checkedJson<T = unknown>(res: Response): Promise<T> {
  await throwIfResNotOk(res);
  try {
    return await res.json();
  } catch {
    throw new Error("The server returned an unreadable response. Please try again.");
  }
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  return checkedJson<T>(await authFetch(url));
}

export async function checkedArrayJson(res: Response): Promise<any[]> {
  const result = await checkedJson<unknown>(res);
  if (!Array.isArray(result) || result.some(row => row === null || typeof row !== "object")) throw new Error("The server returned an invalid list. Please try again.");
  return result;
}

export async function checkedEntryJson(res: Response): Promise<{ metrics: any[]; values: any[]; [key: string]: any }> {
  const result = await checkedJson<any>(res);
  if (!result || !Array.isArray(result.metrics) || !Array.isArray(result.values)) throw new Error("Recorded values could not be read. Please try again.");
  return result;
}

export class StepUpRequiredError extends Error {
  readonly code = "STEP_UP_REQUIRED";
  constructor() {
    super("Step-up authentication required");
    this.name = "StepUpRequiredError";
  }
}

export type ApiRequestError = Error & {
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
  partialSuccess?: boolean;
};

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message: string;
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
      code = json.code;
      if (json && typeof json === "object" && !Array.isArray(json)) details = json;
    } catch {
      message = text;
    }
    if (res.status === 403 && code === "STEP_UP_REQUIRED") {
      throw new StepUpRequiredError();
    }
    if (res.status === 429) {
      message = "Too many attempts. Please wait a few minutes before trying again.";
    }
    const err = new Error(message) as ApiRequestError;
    if (code) err.code = code;
    err.status = res.status;
    if (details) {
      err.details = details;
      if (details.partialSuccess === true) err.partialSuccess = true;
    }
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  retryFn?: () => void,
): Promise<Response> {
  const headers: Record<string, string> = { ...getAuthHeaders() };
  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && data instanceof Blob;
  if (data && !isFormData && !isBlob) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: data
      ? isFormData || isBlob
        ? data as BodyInit
        : JSON.stringify(data)
      : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message: string;
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
      code = json.code;
      if (json && typeof json === "object" && !Array.isArray(json)) details = json;
    } catch {
      message = text;
    }
    if (res.status === 403 && code === "STEP_UP_REQUIRED") {
      const err = new StepUpRequiredError();
      if (retryFn) {
        window.dispatchEvent(new CustomEvent("stepup-required", { detail: { retry: retryFn } }));
      }
      throw err;
    }
    if (res.status === 429) {
      message = "Too many attempts. Please wait a few minutes before trying again.";
    }
    const apiErr = new Error(message) as ApiRequestError;
    if (code) apiErr.code = code;
    apiErr.status = res.status;
    if (details) {
      apiErr.details = details;
      if (details.partialSuccess === true) apiErr.partialSuccess = true;
    }
    throw apiErr;
  }

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T | null> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: getAuthHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    return await checkedJson(res);
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 60_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Invalidation only: form state remains owned by the page's dirty-input guards.
// The storage event is delivered to other tabs, never rebroadcast by receivers.
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "success") {
    void queryClient.invalidateQueries();
    try { localStorage.setItem("simplyesg-data-changed", `${Date.now()}-${Math.random()}`); } catch { /* Storage may be disabled. */ }
  }
});
window.addEventListener("storage", (event) => {
  if (event.key === "simplyesg-data-changed") void queryClient.invalidateQueries();
});
