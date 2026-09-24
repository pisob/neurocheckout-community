type EmailRecord = Record<string, unknown>;
type Archive = {
  get(id: string): EmailRecord | null;
  confirm(id: string, sentAt: string): void;
};

export function enrichEmailHistory(items: EmailRecord[], archive?: Archive): EmailRecord[] {
  return items.map((item) => {
    const hasContent = (value: EmailRecord) => [value.body_html, value.body_text]
      .some((body) => typeof body === "string" && body.trim().length > 0);
    const fallback = { ...item, preview_available: hasContent(item) };
    if (!archive || typeof item.delivery_id !== "string" || typeof item.sent_at !== "string" || !Number.isFinite(Date.parse(item.sent_at))) return fallback;
    try {
      const copy = archive.get(item.delivery_id);
      if (!copy || copy.delivery_id !== item.delivery_id) return fallback;
      // Confirmation failure must not discard an otherwise readable original.
      try { archive.confirm(item.delivery_id, item.sent_at); } catch { /* Retry on the next read. */ }
      const merged: EmailRecord = { ...fallback };
      for (const field of ["subject", "recipient_email", "body_html", "body_text"]) {
        if (typeof copy[field] === "string" && copy[field].trim()) merged[field] = copy[field];
      }
      return { ...merged, preview_available: hasContent(merged), preview_source: "encrypted_local_archive" };
    } catch {
      // A damaged or unavailable copy cannot hide other messages on the page.
      return fallback;
    }
  });
}
