export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "a", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "hr", "span", "div"]);
const ALLOWED_ATTRS = { a: new Set(["href", "target", "rel"]), ol: new Set(["start"]) };
const ALLOWED_HREF_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isSafeHref(value) {
  try {
    return ALLOWED_HREF_SCHEMES.has(new URL(String(value ?? ""), "https://sanitize.invalid").protocol);
  } catch {
    return false;
  }
}

export function sanitizeHtml(html = "") {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, tag, attrs) => {
      const name = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return "";
      const closing = match.startsWith("</");
      if (closing) return `</${name}>`;
      const allowed = ALLOWED_ATTRS[name];
      if (!allowed) return `<${name}>`;
      const kept = [];
      const attrPattern = /([a-z-]+)\s*=\s*"([^"]*)"/gi;
      let attrMatch;
      while ((attrMatch = attrPattern.exec(attrs))) {
        const [, attrName, attrValue] = attrMatch;
        const key = attrName.toLowerCase();
        if (!allowed.has(key)) continue;
        if (key === "href" && !isSafeHref(attrValue)) continue;
        if (key === "start" && !/^\d{1,4}$/.test(attrValue)) continue;
        kept.push(`${key}="${escapeHtml(attrValue)}"`);
      }
      return kept.length ? `<${name} ${kept.join(" ")}>` : `<${name}>`;
    });
}
