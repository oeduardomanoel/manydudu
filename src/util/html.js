export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "a", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "hr", "span", "div"]);
const ALLOWED_ATTRS = { a: new Set(["href", "target", "rel"]) };

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
        if (key === "href" && /^\s*javascript:/i.test(attrValue)) continue;
        kept.push(`${key}="${escapeHtml(attrValue)}"`);
      }
      return kept.length ? `<${name} ${kept.join(" ")}>` : `<${name}>`;
    });
}
