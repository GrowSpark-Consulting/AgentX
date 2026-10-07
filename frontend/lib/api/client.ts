import { apiErrorFrom } from "@/lib/errors";
import { apiBaseUrl } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// The one way the browser calls the API (backend/, on Railway): `${NEXT_PUBLIC_API_URL}/api/...` with
// the signed-in user's Supabase access token as a bearer token, and inside the dashboard the business
// being worked on. The API verifies both; nothing here is trusted on its own.

export const TENANT_HEADER = "x-pakka-tenant";

export type ApiPath = `/api/${string}`;

export interface ApiRequest {
  method: "GET" | "POST";
  body?: unknown;
  /** The business from the dashboard's TenantContext. The API checks the user is a member. */
  tenantId?: string;
  signal?: AbortSignal;
}

/** The current access token, refreshed by supabase-js when it is close to expiring; null if signed out. */
async function accessToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Calls the API as the signed-in user and returns the raw response. Throws only if fetch fails. */
export async function apiFetch(path: ApiPath, { method, body, tenantId, signal }: ApiRequest): Promise<Response> {
  const headers = new Headers();
  const token = await accessToken();
  // Without a token the API answers 401 unauthenticated, which the UI shows as "signed out".
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (tenantId) headers.set(TENANT_HEADER, tenantId);
  if (body !== undefined) headers.set("content-type", "application/json");
  return fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

/** POSTs JSON to the API; throws ApiError on an error response. */
export async function postJson<T>(path: ApiPath, body: unknown, options: { tenantId?: string; signal?: AbortSignal } = {}): Promise<T> {
  const res = await apiFetch(path, { method: "POST", body, ...options });
  if (!res.ok) throw await apiErrorFrom(res);
  return (await res.json()) as T;
}
