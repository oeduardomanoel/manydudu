export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "a", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "hr", "span", "div", "pre", "code", "img"]);
const ALLOWED_ATTRS = { a: new Set(["href", "target", "rel"]), ol: new Set(["start"]), img: new Set(["src", "alt"]) };
const ALLOWED_HREF_SCHEMES = new Set(["http:", "https:", "mailto:"]);
// Elements whose body a browser never reparses as markup — the sanitizer has to skip
// their content the same way, or a payload hidden inside one (e.g. an <a> tag written
// inside a <script> body) could smuggle an allow-listed tag past the filter below.
const RAW_TEXT_TAGS = new Set(["script", "style", "iframe", "object", "embed", "form", "textarea", "title"]);
// Strips ASCII control characters (0x00-0x1F) from attribute values — built with
// RegExp() rather than a /…/ literal so the control-character range is a plain escaped
// string, never raw bytes sitting in the source file.
const CONTROL_CHARS = new RegExp("[\\x00-\\x1f]", "g");

function isSafeHref(value) {
  try {
    return ALLOWED_HREF_SCHEMES.has(new URL(String(value ?? ""), "https://sanitize.invalid").protocol);
  } catch {
    return false;
  }
}

// Imagem só por https absoluto — sem data:, sem caminho relativo apontando pra rotas do próprio painel.
function isSafeImageSrc(value) {
  try {
    return new URL(String(value ?? "")).protocol === "https:";
  } catch {
    return false;
  }
}

const TAG_NAME = /^<\/?([a-z][a-z0-9]*)/i;
const ATTR = /([a-z][a-z0-9-]*)\s*=\s*("([^"]*)"|'([^']*)')/gi;

function sanitizeTag(raw) {
  const nameMatch = TAG_NAME.exec(raw);
  if (!nameMatch) return "";
  const name = nameMatch[1].toLowerCase();
  if (!ALLOWED_TAGS.has(name)) return "";
  if (raw.startsWith("</")) return `</${name}>`;
  const allowed = ALLOWED_ATTRS[name];
  if (!allowed) return `<${name}>`;
  const seen = new Set();
  const kept = [];
  let match;
  ATTR.lastIndex = 0;
  while ((match = ATTR.exec(raw))) {
    const key = match[1].toLowerCase();
    if (!allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    const value = (match[3] ?? match[4] ?? "").replace(CONTROL_CHARS, "");
    if (key === "href" && !isSafeHref(value)) continue;
    if (key === "src" && !isSafeImageSrc(value)) continue;
    if (key === "start" && !/^\d{1,4}$/.test(value)) continue;
    kept.push([key, value]);
  }
  if (name === "img" && !kept.some(([key]) => key === "src")) return "";
  if (name === "a") {
    // an <a target="_blank"> without rel="noopener" lets the opened page reach back
    // via window.opener (reverse tabnabbing) — enforce it regardless of input
    const target = kept.find(([key]) => key === "target");
    if (target?.[1] === "_blank") {
      const rel = kept.find(([key]) => key === "rel");
      if (rel) rel[1] = "noopener noreferrer";
      else kept.push(["rel", "noopener noreferrer"]);
    }
  }
  return kept.length ? `<${name} ${kept.map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(" ")}>` : `<${name}>`;
}

// Hand-rolled tokenizer instead of one regex over the whole string: a `>` inside a
// quoted attribute value must never be mistaken for the tag's real end (the exact
// failure mode of a pure regex tag matcher), and raw-text elements must have their
// whole body skipped verbatim, the same way a browser never reparses markup found
// inside a <script>.
export function sanitizeHtml(html = "") {
  const input = String(html);
  const len = input.length;
  let out = "";
  let i = 0;
  while (i < len) {
    const lt = input.indexOf("<", i);
    if (lt < 0) { out += input.slice(i); break; }
    out += input.slice(i, lt);

    if (input.startsWith("<!--", lt)) {
      // a real HTML parser treats "<!-->" and "<!--->" as an already-closed comment —
      // matching that here keeps us from under-stripping relative to a real browser
      if (input.startsWith("<!--->", lt)) { i = lt + 6; continue; }
      if (input.startsWith("<!-->", lt)) { i = lt + 5; continue; }
      const end = input.indexOf("-->", lt + 4);
      i = end < 0 ? len : end + 3;
      continue;
    }

    let j = lt + 1;
    let quote = null;
    while (j < len) {
      const ch = input[j];
      if (quote) { if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      j++;
    }
    if (j >= len) { out += input.slice(lt); break; } // unterminated tag — the rest is plain text

    const raw = input.slice(lt, j + 1);
    const nameMatch = TAG_NAME.exec(raw);
    const name = nameMatch?.[1].toLowerCase();

    if (name && RAW_TEXT_TAGS.has(name) && !raw.startsWith("</")) {
      const closeRe = new RegExp(`</${name}\\s*>`, "i");
      const closeMatch = closeRe.exec(input.slice(j + 1));
      i = closeMatch ? j + 1 + closeMatch.index + closeMatch[0].length : len;
      continue;
    }

    out += sanitizeTag(raw);
    i = j + 1;
  }
  return out;
}
