/** Extract the recovery CTA without navigating or triggering email tracking. */
export function sentEmailRecoveryLink(html: string): { href: string; label: string } | null {
  const template = document.createElement("template");
  template.innerHTML = String(html).slice(0, 65536);
  for (const anchor of Array.from(template.content.querySelectorAll("a[href]"))) {
    const label = (anchor.textContent || "").replace(/\s+/g, " ").trim();
    if (!/(?:cart|panier|checkout|commande)/i.test(label) || /unsubscribe|désabonn/i.test(label)) continue;
    try {
      const url = new URL(anchor.getAttribute("href") || "");
      if (url.protocol === "https:" && !url.username && !url.password) return { href: url.href, label };
    } catch { /* Invalid links cannot be opened from the preview. */ }
  }
  return null;
}

/** Call in a browser effect. Inert HTML with raster images and no active content. */
export function sentEmailPreview(html: string, assetBaseUrl?: string): string {
  const template = document.createElement("template");
  template.innerHTML = String(html).slice(0, 65536);
  const tags = new Set("a p div span table thead tbody tfoot tr td th img h1 h2 h3 h4 h5 h6 b strong i em u s small br hr ul ol li blockquote pre code center style font caption colgroup col".split(" "));
  for (const node of Array.from(template.content.querySelectorAll("*"))) {
    if (!tags.has(node.tagName.toLowerCase())) { node.remove(); continue; }
    if (node.tagName === "IMG") {
      if (assetBaseUrl) {
        try {
          const url = new URL(node.getAttribute("src") || "");
          const base = new URL(assetBaseUrl);
          if (base.protocol === "https:" && /^\/api\/v1\/public\/email-image-cache\/[a-zA-Z0-9_-]+\/images\/[a-f0-9]{32}\.jpg$/.test(url.pathname) && !url.search && !url.hash) {
            node.setAttribute("src", new URL(url.pathname, base.origin).href);
          }
        } catch { /* Invalid image sources are removed below. */ }
      }
      const src = node.getAttribute("src") || "";
      const tiny = ["width", "height"].some(key => {
        const value = node.getAttribute(key);
        return value !== null && Number(value) >= 0 && Number(value) <= 2;
      });
      if (tiny || /(?:pixel|tracking|email[-_/]?open|beacon)/i.test(src)) { node.remove(); continue; }
    }
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      let rasterUrl = false;
      if (node.tagName === "IMG" && name === "src") {
        try {
          const url = new URL(attribute.value);
          rasterUrl = url.protocol === "https:" && !url.username && !url.password && !url.port &&
            /\.(?:png|jpe?g|webp)$/i.test(url.pathname) && !url.search && !url.hash;
        } catch { /* Non-URL sources are checked as embedded images below. */ }
      }
      const image = node.tagName === "IMG" && name === "src" && (rasterUrl || /^data:image\/(png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(attribute.value));
      if (!image && !["style", "class", "width", "height", "align", "valign", "cellpadding", "cellspacing", "border", "colspan", "rowspan", "alt", "color", "face", "size"].includes(name)) node.removeAttribute(attribute.name);
    }
  }
  // Only exact sanitized image URLs may load; CSS cannot request other resources.
  const imageSources = Array.from(template.content.querySelectorAll("img[src]"))
    .map(node => node.getAttribute("src") || "").filter(src => src.startsWith("https://"))
    .map(src => new URL(src).href).filter(src => !/[;'"<>\s]/.test(src));
  const policy = `default-src 'none'; img-src data: ${imageSources.join(" ")}; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; media-src 'none'; font-src 'none'`;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html{color-scheme:light}body{margin:16px;color:#17202a;background:#fff;overflow-wrap:anywhere}img{max-width:100%}a,button{pointer-events:none!important}</style></head><body>${template.innerHTML}</body></html>`;
}
