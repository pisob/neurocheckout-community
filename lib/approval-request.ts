/** Small action requests must not buffer arbitrary client uploads. */
export async function readApprovalRequest(request: Request): Promise<{ copy_signature?: string }> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512) { await reader.cancel(); throw Error("email_approval_invalid"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.length; }
  const body = size ? JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) : {};
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "copy_signature") ||
      (body.copy_signature !== undefined && (typeof body.copy_signature !== "string" || !/^[a-f0-9]{64}$/.test(body.copy_signature)))) throw Error("email_approval_invalid");
  return body;
}
