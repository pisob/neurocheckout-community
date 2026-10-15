type RecordValue = Record<string, unknown>;
type ApprovalArchive = { shopId: string; installationId: string; get(id: string): RecordValue | null };

/** Only the exact Cloud-signed original from the authorized installation is reviewable. */
export function enrichEmailApprovals(items: RecordValue[], archive?: ApprovalArchive): RecordValue[] {
  return items.map(item => {
    if (item.content_location !== "community_local") return item;
    const unavailable = { ...item, subject: "", recipient_email: "", body_html: null, body_text: null,
      preview_available: false, preview_state: "unavailable" };
    if (!archive || item.shop_id !== archive.shopId || item.installation_id !== archive.installationId ||
        typeof item.delivery_id !== "string" || !/^community-edge-[1-9][0-9]{0,15}$/.test(item.delivery_id) ||
        typeof item.community_copy_signature !== "string" || !/^[a-f0-9]{64}$/.test(item.community_copy_signature)) return unavailable;
    try {
      const copy = archive.get(item.delivery_id);
      if (!copy || copy.delivery_id !== item.delivery_id || copy.copy_signature !== item.community_copy_signature ||
          !["subject", "recipient_email", "body_html", "body_text"].every(key => typeof copy[key] === "string") ||
          !(String(copy.body_html).trim() || String(copy.body_text).trim())) return unavailable;
      return { ...item, subject: copy.subject, recipient_email: copy.recipient_email,
        body_html: copy.body_html, body_text: copy.body_text, preview_available: true,
        preview_state: "available", preview_source: "encrypted_local_archive" };
    } catch { return { ...unavailable, preview_state: "read_error" }; }
  });
}
