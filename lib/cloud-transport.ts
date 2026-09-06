export class CloudRequestError extends Error {
  constructor(
    public readonly detail: "cloud_unavailable" | "cloud_response_invalid" | "community_not_connected",
    public readonly status: 401 | 502 | 503,
    public readonly invalidateSession = false,
  ) {
    super(detail);
    this.name = "CloudRequestError";
  }
}

// Do not forward credentials through redirects; the deadline also covers
// response-body consumption. Callers never expose native fetch diagnostics.
export async function cloudFetch(url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new CloudRequestError("cloud_unavailable", 503);
  }
}
