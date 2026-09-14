/** Call in a browser effect. Inert template parsing, allowlisted HTML, no network. */
export function sentEmailPreview(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = String(html).slice(0, 65536);
  const tags = new Set("a p div span table thead tbody tfoot tr td th img h1 h2 h3 h4 h5 h6 b strong i em u s small br hr ul ol li blockquote pre code center style font caption colgroup col".split(" "));
  for (const node of Array.from(template.content.querySelectorAll("*"))) {
    if (!tags.has(node.tagName.toLowerCase())) { node.remove(); continue; }
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const image = node.tagName === "IMG" && name === "src" && /^data:image\/(png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(attribute.value);
      if (!image && !["style", "class", "width", "height", "align", "valign", "cellpadding", "cellspacing", "border", "colspan", "rowspan", "alt", "color", "face", "size"].includes(name)) node.removeAttribute(attribute.name);
    }
  }
  const policy = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; media-src 'none'; font-src 'none'";
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html{color-scheme:light}body{margin:16px;color:#17202a;background:#fff;overflow-wrap:anywhere}img{max-width:100%}a,button{pointer-events:none!important}</style></head><body>${template.innerHTML}</body></html>`;
}
