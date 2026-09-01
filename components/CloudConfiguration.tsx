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

type ByokStatus = {
  configured?: boolean;
  provider?: string;
  key_last4?: string | null;
  test_status?: string | null;
  mode_choice?: string | null;
};

type EmailProfile = {
  locale: string;
  tone: "friendly" | "premium" | "minimal" | "urgent";
  address_style: "neutral" | "formal" | "informal";
  message_length: "short" | "standard";
  discount_policy: "never" | "confirmed_only";
  approval_mode: "automatic" | "manual";
  required_terms: string[];
  forbidden_terms: string[];
  signature: string;
};

type EmailPreview = {
  subject: string;
  body_text: string;
  primary_cta: string;
  tone: string;
  urgency: string;
};

type LocaleOption = {
  code: string;
  label: string;
};

const BUILTIN_LOCALES: LocaleOption[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
];
const CUSTOM_LOCALES_STORAGE_KEY = "neurocheckout-community-custom-locales-v1";
const LOCALE_CODE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

const DEFAULT_EMAIL_PROFILE: EmailProfile = {
  locale: "en",
  tone: "friendly",
  address_style: "neutral",
  message_length: "standard",
  discount_policy: "confirmed_only",
  approval_mode: "automatic",
  required_terms: [],
  forbidden_terms: [],
  signature: "",
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

function normalizeLocaleCode(value: string): string {
  const [language, region] = value.trim().replaceAll("_", "-").split("-", 2);
  return `${(language || "").toLowerCase()}${region ? `-${region.toUpperCase()}` : ""}`;
}

export default function CloudConfiguration() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedShopUuid, setSelectedShopUuid] = useState("");
  const [byok, setByok] = useState<ByokStatus | null>(null);
  const [templateKey, setTemplateKey] = useState("abandoned_cart");
  const [emailProfile, setEmailProfile] = useState<EmailProfile>(DEFAULT_EMAIL_PROFILE);
  const [customLocales, setCustomLocales] = useState<LocaleOption[]>([]);
  const [showLocaleAdder, setShowLocaleAdder] = useState(false);
  const [newLocaleCode, setNewLocaleCode] = useState("");
  const [newLocaleLabel, setNewLocaleLabel] = useState("");
  const [requiredTermsInput, setRequiredTermsInput] = useState("");
  const [forbiddenTermsInput, setForbiddenTermsInput] = useState("");
  const [previews, setPreviews] = useState<EmailPreview[]>([]);
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

  const localeOptions = useMemo(() => {
    const options = [...BUILTIN_LOCALES, ...customLocales];
    if (!options.some((option) => option.code === emailProfile.locale)) {
      options.push({ code: emailProfile.locale, label: emailProfile.locale });
    }
    return options.filter(
      (option, index) => options.findIndex((candidate) => candidate.code === option.code) === index,
    );
  }, [customLocales, emailProfile.locale]);

  const readJson = async (response: Response) => response.json().catch(() => ({}));

  const terms = (value: string) => value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);

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

  const loadShopConfiguration = async (uuid: string, locale = "en") => {
    if (!uuid) return;
    setError(null);
    const normalizedLocale = normalizeLocaleCode(locale);
    const [profileResponse, byokResponse] = await Promise.all([
      fetch(`/api/cloud/email-profile?shop_uuid=${encodeURIComponent(uuid)}&locale=${encodeURIComponent(normalizedLocale)}`, { cache: "no-store" }),
      fetch(`/api/cloud/byok?shop_uuid=${encodeURIComponent(uuid)}&provider=openai`, { cache: "no-store" }),
    ]);
    const profilePayload = (await readJson(profileResponse)) as { item?: EmailProfile };
    const byokPayload = (await readJson(byokResponse)) as ByokStatus;
    if (!profileResponse.ok || !profilePayload.item) throw new Error(detail(profilePayload, "Réglages email indisponibles"));
    if (!byokResponse.ok) throw new Error(detail(byokPayload, "Statut BYOK indisponible"));
    setEmailProfile(profilePayload.item);
    setRequiredTermsInput((profilePayload.item.required_terms || []).join(", "));
    setForbiddenTermsInput((profilePayload.item.forbidden_terms || []).join(", "));
    setPreviews([]);
    setByok(byokPayload);
  };

  useEffect(() => {
    void loadShops().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Configuration indisponible"));
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CUSTOM_LOCALES_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(parsed)) return;
      const validLocales = parsed
        .map((item): LocaleOption | null => {
          if (!item || typeof item !== "object") return null;
          const candidate = item as Partial<LocaleOption>;
          const code = normalizeLocaleCode(String(candidate.code || ""));
          const label = String(candidate.label || "").trim().slice(0, 48);
          return LOCALE_CODE_PATTERN.test(code) && label ? { code, label } : null;
        })
        .filter((item): item is LocaleOption => item !== null)
        .slice(0, 30);
      setCustomLocales(validLocales);
    } catch {
      window.localStorage.removeItem(CUSTOM_LOCALES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    void loadShopConfiguration(selectedShopUuid, "en").catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Configuration indisponible"));
  }, [selectedShopUuid]);

  const selectEmailLocale = async (locale: string) => {
    if (!selectedShopUuid) return;
    setBusy("email-locale");
    setNotice(null);
    try {
      await loadShopConfiguration(selectedShopUuid, locale);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Langue indisponible");
    } finally {
      setBusy(null);
    }
  };

  const addEmailLocale = async () => {
    const code = normalizeLocaleCode(newLocaleCode);
    const label = newLocaleLabel.trim().slice(0, 48);
    setError(null);
    if (!LOCALE_CODE_PATTERN.test(code)) {
      setError("Code langue invalide. Utilisez par exemple pt ou pt-BR.");
      return;
    }
    if (!label) {
      setError("Indiquez le nom visible de la langue.");
      return;
    }
    const knownLocale = localeOptions.find((option) => option.code === code);
    if (!knownLocale) {
      const nextLocales = [...customLocales, { code, label }].slice(0, 30);
      setCustomLocales(nextLocales);
      window.localStorage.setItem(CUSTOM_LOCALES_STORAGE_KEY, JSON.stringify(nextLocales));
    }
    setNewLocaleCode("");
    setNewLocaleLabel("");
    setShowLocaleAdder(false);
    await selectEmailLocale(code);
  };

  const saveEmailProfile = async () => {
    setBusy("email-profile");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/cloud/email-profile?shop_uuid=${encodeURIComponent(selectedShopUuid)}&locale=${encodeURIComponent(emailProfile.locale)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...emailProfile,
          required_terms: terms(requiredTermsInput),
          forbidden_terms: terms(forbiddenTermsInput),
        }),
      });
      const payload = (await readJson(response)) as { item?: EmailProfile };
      if (!response.ok || !payload.item) throw new Error(detail(payload, "Réglages refusés"));
      setEmailProfile(payload.item);
      setRequiredTermsInput(payload.item.required_terms.join(", "));
      setForbiddenTermsInput(payload.item.forbidden_terms.join(", "));
      setPreviews([]);
      setNotice("Règles éditoriales enregistrées pour cette boutique.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Réglages refusés");
    } finally {
      setBusy(null);
    }
  };

  const generatePreview = async () => {
    setBusy("email-preview");
    setError(null);
    setNotice(null);
    try {
      const profileResponse = await fetch(`/api/cloud/email-profile?shop_uuid=${encodeURIComponent(selectedShopUuid)}&locale=${encodeURIComponent(emailProfile.locale)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...emailProfile,
          required_terms: terms(requiredTermsInput),
          forbidden_terms: terms(forbiddenTermsInput),
        }),
      });
      const profilePayload = (await readJson(profileResponse)) as { item?: EmailProfile };
      if (!profileResponse.ok || !profilePayload.item) throw new Error(detail(profilePayload, "Réglages refusés"));
      setEmailProfile(profilePayload.item);
      setRequiredTermsInput(profilePayload.item.required_terms.join(", "));
      setForbiddenTermsInput(profilePayload.item.forbidden_terms.join(", "));
      const response = await fetch(`/api/cloud/email-preview?shop_uuid=${encodeURIComponent(selectedShopUuid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_key: templateKey, locale: emailProfile.locale }),
      });
      const payload = (await readJson(response)) as { items?: EmailPreview[] };
      if (!response.ok || !Array.isArray(payload.items)) throw new Error(detail(payload, "Prévisualisation indisponible"));
      setPreviews(payload.items);
      setNotice("Règles enregistrées. Les aperçus sont uniquement destinés à votre validation et aucun email client n’a été envoyé.");
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Prévisualisation indisponible");
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
        <article className="email-control-panel tool-panel">
          <header className="email-control-intro">
            <div><p className="eyebrow">Emails pilotés</p><h2>Votre marque guide, les agents rédigent</h2><p>Définissez un cadre éditorial réutilisable pour guider le ton et la présentation de vos emails, sans imposer un message unique.</p></div>
          </header>

          <div className="email-rules-layout">
            <div className="email-rules-copy"><p className="eyebrow">Cadre éditorial</p><h3>Règles de la boutique</h3><p>Ces préférences permettent d’aligner les propositions sur votre marque.</p><div className="privacy-note"><strong>Données protégées</strong><span>Votre clé personnelle est chiffrée dans le Cloud. Les aperçus utilisent uniquement le contexte minimal nécessaire et ne déclenchent aucun envoi client.</span></div></div>
            <div className="configuration-form email-rules-form">
              <label>Automatisation à prévisualiser<select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}><option value="abandoned_cart">Panier abandonné</option><option value="product_recommendation">Recommandation produit</option><option value="email_marketing">Email marketing</option><option value="upsell_cross_sell">Upsell / cross-sell</option></select></label>
              <div className="form-row">
                <label>Langue
                  <div className="locale-picker">
                    <select value={emailProfile.locale} disabled={busy !== null} onChange={(event) => void selectEmailLocale(event.target.value)}>
                      {localeOptions.map((option) => <option key={option.code} value={option.code}>{option.label} · {option.code}</option>)}
                    </select>
                    <button className="locale-add-trigger" type="button" onClick={() => setShowLocaleAdder((current) => !current)}>+ Ajouter une langue absente</button>
                  </div>
                </label>
                <label>Ton<select value={emailProfile.tone} onChange={(event) => setEmailProfile((current) => ({ ...current, tone: event.target.value as EmailProfile["tone"] }))}><option value="friendly">Chaleureux</option><option value="premium">Premium</option><option value="minimal">Minimal</option><option value="urgent">Urgent, sans pression artificielle</option></select></label>
              </div>
              {showLocaleAdder ? (
                <div className="locale-adder" aria-label="Ajouter une langue">
                  <label>Code langue<input value={newLocaleCode} onChange={(event) => setNewLocaleCode(event.target.value)} placeholder="pt-BR" maxLength={5} /></label>
                  <label>Nom affiché<input value={newLocaleLabel} onChange={(event) => setNewLocaleLabel(event.target.value)} placeholder="Português (Brasil)" maxLength={48} /></label>
                  <div className="locale-adder-actions"><button className="button secondary-blue" type="button" disabled={busy !== null} onClick={() => void addEmailLocale()}>Ajouter</button><button className="locale-cancel" type="button" onClick={() => setShowLocaleAdder(false)}>Annuler</button></div>
                </div>
              ) : null}
              <div className="form-row"><label>Adresse au client<select value={emailProfile.address_style} onChange={(event) => setEmailProfile((current) => ({ ...current, address_style: event.target.value as EmailProfile["address_style"] }))}><option value="neutral">Neutre</option><option value="formal">Vouvoiement</option><option value="informal">Tutoiement</option></select></label><label>Longueur<select value={emailProfile.message_length} onChange={(event) => setEmailProfile((current) => ({ ...current, message_length: event.target.value as EmailProfile["message_length"] }))}><option value="short">Courte</option><option value="standard">Standard</option></select></label></div>
              <div className="form-row"><label>Promotions<select value={emailProfile.discount_policy} onChange={(event) => setEmailProfile((current) => ({ ...current, discount_policy: event.target.value as EmailProfile["discount_policy"] }))}><option value="confirmed_only">Uniquement si confirmées</option><option value="never">Jamais mentionner</option></select></label><label>Validation avant envoi<select value={emailProfile.approval_mode} onChange={(event) => setEmailProfile((current) => ({ ...current, approval_mode: event.target.value as EmailProfile["approval_mode"] }))}><option value="automatic">Automatique</option><option value="manual">Manuelle</option></select></label></div>
              <label>Expressions obligatoires<input value={requiredTermsInput} onChange={(event) => setRequiredTermsInput(event.target.value)} placeholder="livraison offerte, fabriqué en France" /><span className="form-hint">Séparez les expressions par une virgule. Maximum 12.</span></label>
              <label>Expressions interdites<input value={forbiddenTermsInput} onChange={(event) => setForbiddenTermsInput(event.target.value)} placeholder="gratuit, dernière chance" /></label>
              <label>Signature facultative<textarea value={emailProfile.signature} onChange={(event) => setEmailProfile((current) => ({ ...current, signature: event.target.value }))} rows={3} maxLength={500} placeholder="L’équipe de votre boutique" /></label>
              <div className="actions left"><button className="button primary" type="button" disabled={busy !== null} onClick={() => void saveEmailProfile()}>{busy === "email-profile" ? "Enregistrement…" : "Enregistrer les règles"}</button><button className="button secondary-blue" type="button" disabled={busy !== null || !byok?.configured} onClick={() => void generatePreview()}>{busy === "email-preview" ? "Génération…" : "Prévisualiser 3 variantes"}</button></div>
              {!byok?.configured ? <button className="inline-link" type="button" onClick={() => setActiveTool("byok")}>Configurer la clé OpenAI pour activer la prévisualisation →</button> : null}
            </div>
          </div>

          {previews.length ? <section className="email-preview-section"><div><p className="eyebrow">Aperçu sans enregistrement</p><h3>Trois directions possibles</h3></div><div className="email-preview-list">{previews.map((preview, index) => <article key={`${preview.subject}-${index}`}><span>0{index + 1}</span><div><strong>{preview.subject}</strong><p>{preview.body_text}</p><small>{preview.primary_cta} · {preview.tone} · urgence {preview.urgency}</small></div></article>)}</div></section> : null}
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
