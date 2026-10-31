type EmailRecord = Record<string, unknown>;
type Archive = {
  store?: { config: { shopId: string } };
  installationId?(): string | null;
  get(id: string): EmailRecord | null;
  confirm(id: string, sentAt: string): void;
  markConverted?(id: string, convertedAt: string): void;
};

export function enrichEmailHistory(items: EmailRecord[], archive?: Archive): EmailRecord[] {
  return items.map((item) => {
    const marketing = typeof item.delivery_id === "string" && item.delivery_id.startsWith("community-marketing-");
    const metadata = marketing ? { ...item, subject: null, recipient_email: null,
      body_html: null, body_text: null, preview_source: null } : item;
    const hasContent = (value: EmailRecord) => [value.body_html, value.body_text]
      .some((body) => typeof body === "string" && body.trim().length > 0);
    const fallback = { ...metadata, preview_available: hasContent(metadata), preview_state: hasContent(metadata) ? "available" : "unavailable" };
    if (!archive || typeof item.delivery_id !== "string" || typeof item.sent_at !== "string" || !Number.isFinite(Date.parse(item.sent_at))) return fallback;
    try {
      const diagnostic = item.copy_diagnostic as EmailRecord | undefined;
      if (marketing && (!/^community-marketing-[1-9][0-9]{0,15}$/.test(item.delivery_id) ||
          !["sent", "opened", "clicked"].includes(String(item.status)) ||
          item.content_location !== "community_local" ||
          !item.shop_id || item.shop_id !== archive.store?.config.shopId ||
          !item.installation_id || item.installation_id !== archive.installationId?.() ||
          typeof item.community_copy_signature !== "string" || !/^[a-f0-9]{64}$/.test(item.community_copy_signature) ||
          !["customer_preference_proactive", "intelligent_email_marketing"].includes(String(item.agent_name)) ||
          !diagnostic || !(
            (diagnostic.source === "db" && Number.isSafeInteger(diagnostic.variant_id) && Number(diagnostic.variant_id) > 0) ||
            (["byok", "unknown"].includes(String(diagnostic.source)) && diagnostic.variant_id === null)
          ) || typeof diagnostic.language !== "string" ||
          !/^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/.test(diagnostic.language))) return fallback;
      const copy = archive.get(item.delivery_id);
      if (!copy || copy.delivery_id !== item.delivery_id) return fallback;
      if (marketing && (copy.copy_signature !== item.community_copy_signature || copy.agent_name !== item.agent_name ||
          (diagnostic?.source !== "unknown" && copy.variant_id !== diagnostic?.variant_id) || copy.language !== diagnostic?.language ||
          !["subject", "recipient_email", "body_html", "body_text"].every(key => typeof copy[key] === "string") ||
          !hasContent(copy))) return fallback;
      if (item.status === "converted" && typeof item.converted_at === "string") {
        try { archive.markConverted?.(item.delivery_id, item.converted_at); } catch { /* Retry on the next read. */ }
      }
      // Confirmation failure must not discard an otherwise readable original.
      try { archive.confirm(item.delivery_id, item.sent_at); } catch { /* Retry on the next read. */ }
      const merged: EmailRecord = { ...fallback };
      for (const field of ["subject", "recipient_email", "body_html", "body_text"]) {
        if (typeof copy[field] === "string" && copy[field].trim()) merged[field] = copy[field];
      }
      return { ...merged, preview_available: hasContent(merged), preview_state: hasContent(merged) ? "available" : "unavailable", preview_source: "encrypted_local_archive" };
    } catch {
      // A damaged or unavailable copy cannot hide other messages on the page.
      return { ...fallback, preview_state: hasContent(metadata) ? "available" : "read_error" };
    }
  });
}
