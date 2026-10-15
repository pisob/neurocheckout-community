/** Public contract fields only. Cloud validates the current document again. */
export type ConnectorKeyDpa = {
  version: string;
  html: string;
  locale: "en" | "fr";
  source: "published";
  document_sha256: string;
  acceptance_text: string;
};

export function isConnectorKeyDpa(value: unknown): value is ConnectorKeyDpa {
  if (!value || typeof value !== "object") return false;
  const doc = value as Record<string, unknown>;
  return doc.source === "published" && (doc.locale === "en" || doc.locale === "fr")
    && ["version", "html", "acceptance_text"].every((key) => typeof doc[key] === "string" && String(doc[key]).trim().length > 0)
    && typeof doc.document_sha256 === "string" && /^[a-f0-9]{64}$/.test(doc.document_sha256);
}
