"use client";

import { useEffect, useMemo, useState } from "react";

type Shop = {
  id?: string;
  shop_uuid?: string;
  canonical_shop_id?: string;
  shop_id: string;
  platform: string;
  has_active_api_key?: boolean;
};

type Template = {
  id: string;
  template_key: string;
  locale: string;
  version: number;
  status: "draft" | "published" | "archived";
  subject_template: string;
  body_text_template: string;
};

type ByokStatus = {
  configured?: boolean;
  provider?: string;
  key_last4?: string | null;
  test_status?: string | null;
  mode_choice?: string | null;
};

type Platform = {
  platform_key: string;
  display_name: string;
  create_shop_enabled: boolean;
};

const DPA_LABEL = "J’accepte le DPA NeuroCheckout v1.0 et confirme être autorisé à l’accepter pour mon organisation.";

function shopUuid(shop: Shop): string {
  return String(shop.shop_uuid || shop.id || shop.canonical_shop_id || "").trim();
}

function detail(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload && "detail" in payload) {
    const value = String((payload as { detail?: unknown }).detail || "").trim();
    if (value) return value;
  }
  return fallback;
}

export default function CloudConfiguration() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedShopUuid, setSelectedShopUuid] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [byok, setByok] = useState<ByokStatus | null>(null);
  const [templateKey, setTemplateKey] = useState("abandoned_cart");
  const [locale, setLocale] = useState("fr");
  const [subject, setSubject] = useState("Votre panier vous attend chez {{ shop_name }}");
  const [bodyText, setBodyText] = useState("Bonjour {{ customer_first_name }}, votre sélection est toujours disponible. {{ cta_url }}");
  const [bodyHtml, setBodyHtml] = useState("<p>Bonjour <strong>{{ customer_first_name }}</strong>,</p><p>Votre sélection est toujours disponible.</p><p><a href=\"{{ cta_url }}\">{{ cta_label }}</a></p>");
  const [apiKey, setApiKey] = useState("");
  const [connectorKey, setConnectorKey] = useState<string | null>(null);
  const [dpaAccepted, setDpaAccepted] = useState(false);
  const [newShopId, setNewShopId] = useState("");
  const [newPlatform, setNewPlatform] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newSenderEmail, setNewSenderEmail] = useState("");
  const [newFromName, setNewFromName] = useState("");
  const [newReplyTo, setNewReplyTo] = useState("");
  const [newLogoDataUrl, setNewLogoDataUrl] = useState("");
  const [newLogoName, setNewLogoName] = useState("");
  const [newApprovalMode, setNewApprovalMode] = useState<"automatic" | "manual">("automatic");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<"shop" | "email" | "byok" | "connector">("shop");

  const selectedShop = useMemo(
    () => shops.find((shop) => shopUuid(shop) === selectedShopUuid) || null,
    [selectedShopUuid, shops],
  );

  const readJson = async (response: Response) => response.json().catch(() => ({}));

  const loadShops = async () => {
    setError(null);
    const [response, platformResponse] = await Promise.all([
      fetch("/api/cloud/shops", { cache: "no-store" }),
      fetch("/api/cloud/platforms", { cache: "no-store" }),
    ]);
    const payload = (await readJson(response)) as { items?: Shop[] };
    const platformPayload = (await readJson(platformResponse)) as { items?: Platform[] };
    if (!response.ok) throw new Error(detail(payload, "Boutiques indisponibles"));
    const items = Array.isArray(payload.items) ? payload.items : [];
    const platformItems = platformResponse.ok && Array.isArray(platformPayload.items)
      ? platformPayload.items.filter((item) => item.create_shop_enabled)
      : [];
    setShops(items);
    setPlatforms(platformItems);
    setNewPlatform((current) => current || platformItems[0]?.platform_key || "");
    setSelectedShopUuid((current) => current || (items[0] ? shopUuid(items[0]) : ""));
  };

  const loadShopConfiguration = async (uuid: string) => {
    if (!uuid) return;
    setError(null);
    const [templateResponse, byokResponse] = await Promise.all([
      fetch(`/api/cloud/templates?shop_uuid=${encodeURIComponent(uuid)}`, { cache: "no-store" }),
      fetch(`/api/cloud/byok?shop_uuid=${encodeURIComponent(uuid)}&provider=openai`, { cache: "no-store" }),
    ]);
    const templatePayload = (await readJson(templateResponse)) as { items?: Template[] };
    const byokPayload = (await readJson(byokResponse)) as ByokStatus;
    if (!templateResponse.ok) throw new Error(detail(templatePayload, "Templates indisponibles"));
    if (!byokResponse.ok) throw new Error(detail(byokPayload, "Statut BYOK indisponible"));
    setTemplates(Array.isArray(templatePayload.items) ? templatePayload.items : []);
    setByok(byokPayload);
  };

  useEffect(() => {
    void loadShops().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Configuration indisponible"));
  }, []);

  useEffect(() => {
    void loadShopConfiguration(selectedShopUuid).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Configuration indisponible"));
  }, [selectedShopUuid]);

  const createDraft = async () => {
    setBusy("template");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cloud/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_uuid: selectedShopUuid,
          template_key: templateKey,
          locale,
          subject_template: subject,
          body_text_template: bodyText,
          body_html_template: bodyHtml,
        }),
      });
      const payload = (await readJson(response)) as { item?: Template };
      if (!response.ok || !payload.item) throw new Error(detail(payload, "Brouillon refusé"));
      setTemplates((current) => [payload.item as Template, ...current]);
      setNotice(`Brouillon v${payload.item.version} créé. Publiez-le pour l’utiliser lors des prochains envois.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Brouillon refusé");
    } finally {
      setBusy(null);
    }
  };

  const publish = async (template: Template, action: "publish" | "rollback") => {
    setBusy(template.id);
    setError(null);
    try {
      const response = await fetch(`/api/cloud/templates/${encodeURIComponent(template.id)}/${action}`, { method: "POST" });
      const payload = (await readJson(response)) as { item?: Template };
      if (!response.ok || !payload.item) throw new Error(detail(payload, "Publication refusée"));
      await loadShopConfiguration(selectedShopUuid);
      setNotice(action === "publish" ? `Version ${payload.item.version} publiée.` : `Retour arrière publié en version ${payload.item.version}.`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Publication refusée");
    } finally {
      setBusy(null);
    }
  };

  const saveByok = async () => {
    setBusy("byok");
    setError(null);
    try {
      const response = await fetch(`/api/cloud/byok?shop_uuid=${encodeURIComponent(selectedShopUuid)}&provider=openai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, provider: "openai", test_after_save: true }),
      });
      const payload = (await readJson(response)) as ByokStatus;
      if (!response.ok) throw new Error(detail(payload, "Clé refusée"));
      setApiKey("");
      setByok(payload);
      setNotice(`Clé OpenAI chiffrée et enregistrée${payload.key_last4 ? ` · …${payload.key_last4}` : ""}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Clé refusée");
    } finally {
      setBusy(null);
    }
  };

  const revokeByok = async () => {
    setBusy("byok");
    setError(null);
    const response = await fetch(`/api/cloud/byok?shop_uuid=${encodeURIComponent(selectedShopUuid)}&provider=openai`, { method: "DELETE" });
    const payload = (await readJson(response)) as ByokStatus;
    if (!response.ok) setError(detail(payload, "Révocation refusée"));
    else {
      setByok(payload);
      setNotice("Clé OpenAI révoquée immédiatement.");
    }
    setBusy(null);
  };

  const issueConnectorKey = async (operation: "create" | "rotate") => {
    setBusy("connector");
    setError(null);
    setConnectorKey(null);
    try {
      const response = await fetch("/api/cloud/connector-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_uuid: selectedShopUuid, operation, dpa_accepted: dpaAccepted }),
      });
      const payload = (await readJson(response)) as { api_key?: string };
      if (!response.ok || !payload.api_key) throw new Error(detail(payload, "Clé connecteur refusée"));
      setConnectorKey(payload.api_key);
      setNotice("Clé créée. Copiez-la maintenant : elle ne sera plus affichée après avoir quitté cette page.");
      await loadShops();
    } catch (keyError) {
      setError(keyError instanceof Error ? keyError.message : "Clé connecteur refusée");
    } finally {
      setBusy(null);
    }
  };

  const selectLogo = (file: File | null) => {
    setError(null);
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/i.test(file.type) || file.size > 1_400_000) {
      setError("Logo invalide : utilisez PNG, JPEG, GIF, WebP ou SVG, 1,4 Mo maximum.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNewLogoDataUrl(String(reader.result || ""));
      setNewLogoName(file.name);
    };
    reader.onerror = () => setError("Lecture du logo impossible.");
    reader.readAsDataURL(file);
  };

  const createShop = async () => {
    setBusy("create-shop");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cloud/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: newShopId,
          platform: newPlatform,
          shop_base_url: newBaseUrl,
          sender_email: newSenderEmail,
          email_from_name: newFromName,
          email_reply_to: newReplyTo,
          brand_logo_url: newLogoDataUrl,
          email_approval_mode: newApprovalMode,
        }),
      });
      const payload = (await readJson(response)) as { shop_uuid?: string };
      if (!response.ok) throw new Error(detail(payload, "Création de la boutique refusée"));
      setNewShopId("");
      setNewBaseUrl("");
      setNewSenderEmail("");
      setNewFromName("");
      setNewReplyTo("");
      setNewLogoDataUrl("");
      setNewLogoName("");
      await loadShops();
      if (payload.shop_uuid) setSelectedShopUuid(payload.shop_uuid);
      setNotice("Boutique créée. Configurez les enregistrements DNS indiqués par le Cloud avant vos envois.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Création de la boutique refusée");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="configuration" className="configuration-section">
      <div className="configuration-toolbar">
        <div className="tool-tabs" role="tablist" aria-label="Outils de configuration">
          {([
            ["shop", "Boutique"],
            ["email", "Emails"],
            ["byok", "Clé IA"],
            ["connector", "Connecteur"],
          ] as const).map(([tool, label]) => (
            <button
              aria-selected={activeTool === tool}
              className={activeTool === tool ? "active" : ""}
              key={tool}
              role="tab"
              type="button"
              onClick={() => setActiveTool(tool)}
            >
              {label}
            </button>
          ))}
        </div>
        {shops.length ? (
          <label className="shop-selector">Boutique active<select value={selectedShopUuid} onChange={(event) => setSelectedShopUuid(event.target.value)}>{shops.map((shop) => <option key={shopUuid(shop)} value={shopUuid(shop)}>{shop.shop_id} · {shop.platform}</option>)}</select></label>
        ) : null}
      </div>

      {error ? <p className="config-error">{error}{error.includes("scope") ? " · Déconnectez puis reconnectez cette instance pour accepter les nouveaux droits." : ""}</p> : null}
      {notice ? <p className="config-notice">{notice}</p> : null}

      {activeTool === "shop" ? (
        <article className="configuration-block tool-panel">
          <div className="configuration-copy"><p className="eyebrow">Boutique</p><h2>Connecter une boutique</h2><p>La boutique reste la source de vérité. Le Cloud ne conserve que les projections minimales nécessaires aux agents.</p>{selectedShop ? <div className="selected-shop-note"><span>Boutique sélectionnée</span><strong>{selectedShop.shop_id}</strong><small>{selectedShop.platform}</small></div> : null}</div>
          <div className="configuration-form">
            <div className="form-row"><label>Identifiant boutique<input value={newShopId} onChange={(event) => setNewShopId(event.target.value)} placeholder="ma-boutique" maxLength={120} /></label><label>Plateforme<select value={newPlatform} onChange={(event) => setNewPlatform(event.target.value)}>{platforms.map((platform) => <option key={platform.platform_key} value={platform.platform_key}>{platform.display_name}</option>)}</select></label></div>
            <label>URL publique<input type="url" value={newBaseUrl} onChange={(event) => setNewBaseUrl(event.target.value)} placeholder="https://boutique.example" /></label>
            <div className="form-row"><label>Nom expéditeur<input value={newFromName} onChange={(event) => setNewFromName(event.target.value)} placeholder="Ma Boutique" /></label><label>Email de réponse<input type="email" value={newReplyTo} onChange={(event) => setNewReplyTo(event.target.value)} placeholder="contact@boutique.example" /></label></div>
            <label>Email du domaine expéditeur<input type="email" value={newSenderEmail} onChange={(event) => setNewSenderEmail(event.target.value)} placeholder="bonjour@boutique.example" /></label>
            <div className="form-row"><label>Logo de marque<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={(event) => selectLogo(event.target.files?.[0] || null)} /><span className="form-hint">{newLogoName || "1,4 Mo maximum"}</span></label><label>Validation email<select value={newApprovalMode} onChange={(event) => setNewApprovalMode(event.target.value as "automatic" | "manual")}><option value="automatic">Automatique</option><option value="manual">Manuelle</option></select></label></div>
            <button className="button primary" type="button" disabled={busy !== null || !newShopId.trim() || !newPlatform || !newBaseUrl.trim() || !newSenderEmail.trim() || !newFromName.trim() || !newReplyTo.trim() || !newLogoDataUrl} onClick={() => void createShop()}>{busy === "create-shop" ? "Création…" : "Créer la boutique"}</button>
          </div>
        </article>
      ) : null}

      {activeTool !== "shop" && !selectedShop ? (
        <div className="empty-tool"><p className="eyebrow">Boutique requise</p><h2>Créez d’abord votre boutique</h2><p>Les emails, la clé IA et le connecteur sont toujours rattachés à une boutique précise.</p><button className="button primary" type="button" onClick={() => setActiveTool("shop")}>Configurer la boutique</button></div>
      ) : null}

      {activeTool === "email" && selectedShop ? (
        <article className="configuration-block tool-panel">
          <div className="configuration-copy"><p className="eyebrow">Emails</p><h2>Template versionné</h2><p>Le Cloud nettoie le HTML, contrôle les variables et conserve l’historique. Seule une version publiée est utilisée.</p><div className="version-summary"><strong>{templates.length}</strong><span>versions enregistrées</span></div></div>
          <div className="configuration-form">
            <div className="form-row"><label>Automatisation<select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}><option value="abandoned_cart">Panier abandonné</option><option value="product_recommendation">Recommandation produit</option><option value="email_marketing">Email marketing</option><option value="upsell_cross_sell">Upsell / cross-sell</option></select></label><label>Langue<input value={locale} onChange={(event) => setLocale(event.target.value)} maxLength={8} /></label></div>
            <label>Objet<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} /></label>
            <label>Texte<textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} rows={3} /></label>
            <label>HTML nettoyé côté Cloud<textarea value={bodyHtml} onChange={(event) => setBodyHtml(event.target.value)} rows={5} className="code-input" /></label>
            <p className="form-hint">Variables autorisées : customer_first_name, shop_name, cta_url, cta_label, unsubscribe_url, coupon_code, discount_percent, cart_id, product_name.</p>
            <button className="button primary" type="button" disabled={busy !== null} onClick={() => void createDraft()}>{busy === "template" ? "Enregistrement…" : "Créer un brouillon"}</button>
            <div className="version-list">
              {templates.slice(0, 5).map((template) => <div className="version-row" key={template.id}><div><strong>{template.template_key} · {template.locale}</strong><span>v{template.version} · {template.status}</span></div><div>{template.status === "draft" ? <button type="button" onClick={() => void publish(template, "publish")} disabled={busy !== null}>Publier</button> : <button type="button" onClick={() => void publish(template, "rollback")} disabled={busy !== null}>Restaurer</button>}</div></div>)}
            </div>
          </div>
        </article>
      ) : null}

      {activeTool === "byok" && selectedShop ? (
        <article className="configuration-block tool-panel compact-tool">
          <div className="configuration-copy"><p className="eyebrow">Clé IA personnelle</p><h2>Votre clé OpenAI</h2><p>La clé est chiffrée dans le Cloud et n’est jamais renvoyée. Seuls son statut et ses quatre derniers caractères restent visibles.</p></div>
          <div className="configuration-form compact-form">
            <p className="secret-status">{byok?.configured ? `Configurée · …${byok.key_last4 || "????"} · test ${byok.test_status || "non exécuté"}` : "Aucune clé personnelle configurée"}</p>
            <label>Nouvelle clé<input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" /></label>
            <div className="actions left"><button className="button primary" type="button" disabled={!apiKey.trim() || busy !== null} onClick={() => void saveByok()}>Chiffrer et enregistrer</button>{byok?.configured ? <button className="button danger" type="button" disabled={busy !== null} onClick={() => void revokeByok()}>Révoquer</button> : null}</div>
          </div>
        </article>
      ) : null}

      {activeTool === "connector" && selectedShop ? (
        <article className="configuration-block tool-panel compact-tool">
          <div className="configuration-copy"><p className="eyebrow">Connecteur</p><h2>Clé dédiée à la boutique</h2><p>Cette clé signe les événements du module e-commerce. Elle n’autorise jamais l’accès au dashboard membre.</p></div>
          <div className="configuration-form compact-form">
            <label className="checkbox-line"><input type="checkbox" checked={dpaAccepted} onChange={(event) => setDpaAccepted(event.target.checked)} /><span>{DPA_LABEL}</span></label>
            <div className="actions left"><button className="button primary" type="button" disabled={!dpaAccepted || busy !== null} onClick={() => void issueConnectorKey(selectedShop.has_active_api_key ? "rotate" : "create")}>{selectedShop.has_active_api_key ? "Faire une rotation" : "Créer la clé"}</button></div>
            {connectorKey ? <div className="one-time-secret"><strong>Secret affiché une seule fois</strong><code>{connectorKey}</code></div> : null}
          </div>
        </article>
      ) : null}
    </section>
  );
}
