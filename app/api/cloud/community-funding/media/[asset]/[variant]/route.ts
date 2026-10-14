import { cloudApiBaseUrl } from "@/lib/config";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ asset: string; variant: string }> }) {
  const { asset, variant } = await context.params;
  const error = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (!/^[a-f0-9]{64}$/.test(asset) || !["image.webp", "poster.webp"].includes(variant)) return error(404);
  try {
    // Public, content-addressed creative: no session refresh, user IDs, cookies or tracking.
    // Only the configured Cloud origin and this fixed route may be fetched; no redirects.
    const response = await fetch(`${cloudApiBaseUrl()}/api/v1/public/community-sponsor-media/${asset}/${variant}`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    const max = variant === "poster.webp" ? 1024 * 1024 : 5 * 1024 * 1024;
    if (!response.ok || response.headers.get("content-type") !== "image/webp" || Number(response.headers.get("content-length")) > max) {
      await response.body?.cancel(); return error(404);
    }
    const reader = response.body?.getReader();
    if (!reader) return error(502);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) { await reader.cancel(); return error(502); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = Buffer.concat(chunks);
    if (body.length < 12 || body.toString("ascii", 0, 4) !== "RIFF" || body.toString("ascii", 8, 12) !== "WEBP") return error(502);
    return new Response(body, { headers: {
      "Content-Type": "image/webp", "Content-Length": String(body.length), "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch { return error(503); }
}
