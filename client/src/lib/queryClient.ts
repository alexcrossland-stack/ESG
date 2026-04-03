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

export class StepUpRequiredError extends Error {
  readonly code = "STEP_UP_REQUIRED";
  constructor() {
    super("Step-up authentication required");
    this.name = "StepUpRequiredError";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message: string;
    let code: string | undefined;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
      code = json.code;
    } catch {
      message = text;
    }
    if (res.status === 403 && code === "STEP_UP_REQUIRED") {
      throw new StepUpRequiredError();
    }
    if (res.status === 429) {
      message = "Too many attempts. Please wait a few minutes before trying again.";
    }
    const err = new Error(message) as Error & { code?: string };
    if (code) err.code = code;
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
  if (data) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message: string;
    let code: string | undefined;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
      code = json.code;
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
    const apiErr = new Error(message) as Error & { code?: string };
    if (code) apiErr.code = code;
    throw apiErr;
  }

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: getAuthHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
