const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "A", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "HR", "SPAN", "DIV", "PRE", "CODE", "IMG"]);
const ALLOWED_HREF_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isSafeHref(value) {
  try {
    return ALLOWED_HREF_SCHEMES.has(new URL(String(value ?? ""), "https://sanitize.invalid").protocol);
  } catch {
    return false;
  }
}

function isSafeImageSrc(value) {
  try {
    return new URL(String(value ?? "")).protocol === "https:";
  } catch {
    return false;
  }
}

// Tags fora da allowlist que carregam estrutura de bloco — em vez de só desembrulhar (e grudar
// tudo num parágrafo só), viram o equivalente permitido mais próximo.
const RENAME_TAGS = { H1: "H2", H4: "H3", H5: "H3", H6: "H3", SECTION: "DIV", ARTICLE: "DIV", HEADER: "DIV",
  FOOTER: "DIV", MAIN: "DIV", ASIDE: "DIV", FIGURE: "DIV", TABLE: "DIV", TBODY: "DIV", THEAD: "DIV", TR: "P", DT: "P", DD: "P" };
const BLOCK_TAG = /<(p|br|h2|h3|ul|ol|li|blockquote|div|hr|pre)\b/i;
const SEMANTIC_TAG = /<(h[1-6]|ul|ol|strong|b|em|i|blockquote)\b/i;
const MARKDOWN_HINT = /^\s*(#{1,6}\s|[-*•+]\s|\d+[.)]\s|>\s?|```|(-{3,}|\*{3,}|_{3,})\s*$)|\*\*[^*]+\*\*/m;

// innerText não serve aqui: o wrapper do sanitizeFragment está fora do documento, e aí <br> e
// blocos internos (o contentEditable cria <div>/<br> dentro do <pre>) não viram quebra de linha.
function preformattedText(node) {
  let text = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
    else if (child.nodeName === "BR") text += "\n";
    else if (child.nodeType === Node.ELEMENT_NODE) {
      const inner = preformattedText(child);
      text += /^(DIV|P|LI)$/.test(child.nodeName) && text && !text.endsWith("\n") ? `\n${inner}` : inner;
    }
  }
  return text;
}

function renameElement(element, tagName) {
  const replacement = document.createElement(tagName);
  replacement.append(...element.childNodes);
  element.replaceWith(replacement);
  return replacement;
}

function cleanChild(child) {
  if (child.nodeType === Node.TEXT_NODE) return;
  if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); return; }
  if (RENAME_TAGS[child.tagName]) child = renameElement(child, RENAME_TAGS[child.tagName]);
  if (child.tagName === "TD" || child.tagName === "TH") child.append(" ");
  // Google Docs embrulha o documento inteiro num <b style="font-weight:normal"> — manter viraria tudo negrito
  const fakeBold = child.tagName === "B" && /font-weight\s*:\s*(normal|[1-5]00)/i.test(child.getAttribute("style") || "");
  if (fakeBold || !ALLOWED_TAGS.has(child.tagName)) {
    const children = [...child.childNodes];
    child.replaceWith(...children);
    children.forEach(cleanChild);
    return;
  }
  if (child.tagName === "IMG" && !isSafeImageSrc(child.getAttribute("src"))) { child.remove(); return; }
  if (child.tagName === "PRE") {
    // bloco de prompt guarda só o texto (com as quebras de linha) — formatação de dentro não faz sentido ali
    const code = document.createElement("code");
    code.textContent = preformattedText(child).replace(/\n+$/, "");
    child.replaceChildren(code);
    for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
    return;
  }
  for (const attr of [...child.attributes]) {
    if (child.tagName === "IMG" && (attr.name === "src" || attr.name === "alt")) continue;
    if (child.tagName === "A" && attr.name === "href") { if (!isSafeHref(attr.value)) child.removeAttribute("href"); continue; }
    if (child.tagName === "A" && attr.name === "target" && attr.value === "_blank") continue;
    if (child.tagName === "OL" && attr.name === "start" && /^\d{1,4}$/.test(attr.value)) continue;
    child.removeAttribute(attr.name);
  }
  // target=_blank sem rel deixa a página aberta alcançar esta via window.opener
  if (child.tagName === "A" && child.getAttribute("target") === "_blank") child.setAttribute("rel", "noopener noreferrer");
  [...child.childNodes].forEach(cleanChild);
}

// <template> é inerte: o HTML colado não baixa imagem nem dispara onerror/onload antes da limpeza
// (numa <div> solta, o navegador já começa a carregar cada <img> no momento do innerHTML).
export function sanitizeFragment(html) {
  const wrapper = document.createElement("template");
  wrapper.innerHTML = html;
  [...wrapper.content.childNodes].forEach(cleanChild);
  return wrapper.innerHTML;
}

// Reconhece http(s) e mailto: soltos no meio de texto colado/digitado — mailto: só entra em jogo
// no auto-link de digitação/URL isolada, já que endereço de e-mail puro não bate com o padrão de URL.
const URL_PATTERN = /\b(?:https?:\/\/|mailto:)[^\s<>"']+/gi;
const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function linkifyText(text) {
  let out = "";
  let lastIndex = 0;
  let match;
  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text))) {
    let url = match[0].replace(/[.,;:!?)\]]+$/, "");
    out += escapeHtml(text.slice(lastIndex, match.index));
    if (isSafeHref(url)) out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>${escapeHtml(match[0].slice(url.length))}`;
    else out += escapeHtml(match[0]);
    lastIndex = match.index + match[0].length;
  }
  out += escapeHtml(text.slice(lastIndex));
  return out;
}

// Negrito/itálico de markdown só fora dos links — senão um "_" ou "*" dentro de uma URL quebraria o <a>.
function formatInline(text) {
  return linkifyText(text).split(/(<a [^>]*>.*?<\/a>)/).map((part, index) => index % 2 ? part : part
    .replace(/\*\*(?=\S)(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(?=\S)(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*(?=[^\s*])([^*]+?)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "$1")).join("");
}

// Texto puro colado (markdown, bloco de notas, terminal, chat de IA) vira blocos de verdade, igual o Notion faz:
// linha em branco separa parágrafo, quebra simples vira <br>, e #, -, 1., >, --- viram título/lista/citação/divisor.
export function plainTextToHtml(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let quote = [];
  let list = null;
  let fence = null;
  const flushParagraph = () => { if (paragraph.length) out.push(`<p>${paragraph.join("<br>")}</p>`); paragraph = []; };
  const flushQuote = () => { if (quote.length) out.push(`<blockquote>${quote.join("<br>")}</blockquote>`); quote = []; };
  const flushList = () => { if (list) out.push(`<${list.type}${list.start > 1 ? ` start="${list.start}"` : ""}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.type}>`); list = null; };
  const flushAll = () => { flushParagraph(); flushQuote(); flushList(); };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    // ``` vira bloco de prompt (com botão "Copiar" na página de entrega), preservando as linhas
    if (/^\s*```/.test(line)) {
      flushAll();
      if (fence) { out.push(`<pre><code>${fence.map(escapeHtml).join("\n")}</code></pre>`); fence = null; } else fence = [];
      continue;
    }
    if (fence) { fence.push(line); continue; }
    if (!line.trim()) {
      flushParagraph(); flushQuote();
      // lista separada por linha em branco ("1. a\n\n2. b") continua sendo uma lista só
      const next = lines.slice(index + 1).find((candidate) => candidate.trim());
      const nextType = next && (/^\s*\d+[.)]\s/.test(next) ? "ol" : /^\s*[-*•+]\s/.test(next) ? "ul" : null);
      if (list && nextType !== list.type) flushList();
      continue;
    }
    let match;
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushAll(); out.push("<hr>"); continue; }
    if ((match = line.match(/^\s*(#{1,6})\s+(.*)$/))) { flushAll(); const tag = match[1].length <= 2 ? "h2" : "h3"; out.push(`<${tag}>${formatInline(match[2])}</${tag}>`); continue; }
    if ((match = line.match(/^\s*>\s?(.*)$/))) { flushParagraph(); flushList(); quote.push(formatInline(match[1])); continue; }
    const listMatch = line.match(/^\s*(?:(\d+)[.)]|[-*•+])\s+(?:\[([ xX])\]\s+)?(.*)$/);
    if (listMatch) {
      flushParagraph(); flushQuote();
      const type = listMatch[1] ? "ol" : "ul";
      if (list?.type !== type) { flushList(); list = { type, items: [], start: Number(listMatch[1]) || 1 }; }
      const checkbox = listMatch[2] === undefined ? "" : listMatch[2] === " " ? "☐ " : "☑ ";
      list.items.push(checkbox + formatInline(listMatch[3]));
      continue;
    }
    flushQuote();
    if (list) flushList();
    paragraph.push(formatInline(line.trim()));
  }
  if (fence) out.push(`<pre><code>${fence.map(escapeHtml).join("\n")}</code></pre>`);
  flushAll();
  return out.join("") || "<p></p>";
}

// O HTML da área de transferência nem sempre ajuda: editor de código/terminal manda o markdown cru
// dentro de <div>/<span>, e alguns apps mandam um HTML sem nenhum bloco (tudo numa linha só).
// Nesses casos o texto puro, interpretado acima, fica bem mais fiel ao original.
function preferPlainText(cleanHtml, plainText) {
  if (!plainText.includes("\n")) return false;
  if (!BLOCK_TAG.test(cleanHtml)) return true;
  return MARKDOWN_HINT.test(plainText) && !SEMANTIC_TAG.test(cleanHtml);
}

// Atalhos de digitação do Notion: "# " título, "## " / "### " subtítulo, "- " lista, "1. " lista numerada, "> " citação.
const TYPING_SHORTCUTS = [
  [/^#{1,2}$/, "formatBlock", "h2"], [/^#{3,6}$/, "formatBlock", "h3"], [/^[-*•]$/, "insertUnorderedList"],
  [/^1[.)]$/, "insertOrderedList"], [/^>$/, "formatBlock", "blockquote"],
];

function applyTypingShortcut(el) {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0 || !el.contains(selection.anchorNode)) return;
  let block = selection.anchorNode;
  while (block.parentNode && block.parentNode !== el) block = block.parentNode;
  if (block.nodeType === Node.ELEMENT_NODE && /^(LI|UL|OL|H2|H3|BLOCKQUOTE)$/.test(block.tagName)) return;
  const prefix = document.createRange();
  prefix.setStart(block, 0);
  prefix.setEnd(selection.anchorNode, selection.anchorOffset);
  const typed = prefix.toString().replace(/ /g, " ");
  if (!typed.endsWith(" ")) return;
  const shortcut = TYPING_SHORTCUTS.find(([pattern]) => pattern.test(typed.slice(0, -1)));
  if (!shortcut) return;
  prefix.deleteContents();
  if (shortcut[1] === "formatBlock") {
    if (!block.textContent && block.nodeType === Node.ELEMENT_NODE) block.append(document.createElement("br"));
    document.execCommand(shortcut[1], false, shortcut[2]);
    return;
  }
  // insertUnorderedList dentro de um <p> gera <p><ul> no Chrome — troca o bloco pela lista na mão
  const list = document.createElement(shortcut[1] === "insertOrderedList" ? "ol" : "ul");
  const item = document.createElement("li");
  if (block.nodeType === Node.ELEMENT_NODE) item.append(...block.childNodes); else item.append(block.cloneNode());
  if (!item.textContent) item.replaceChildren(document.createElement("br"));
  list.append(item);
  block.replaceWith(list);
  const caret = document.createRange();
  caret.setStart(item, 0);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
}

// Depois de digitar espaço/Enter, olha a "palavra" que acabou de ser fechada e, se for uma URL,
// troca o texto puro por um <a> de verdade — sem precisar selecionar e clicar no botão de link.
function linkifyWordBeforeCaret(el) {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return;
  const node = selection.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return;
  const offset = selection.anchorOffset;
  const beforeDelimiter = node.textContent.slice(0, Math.max(0, offset - 1));
  const match = beforeDelimiter.match(/(?:https?:\/\/|mailto:)[^\s<>"']+$/i);
  if (!match || !isSafeHref(match[0])) return;
  const url = match[0];
  const start = beforeDelimiter.length - url.length;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + url.length);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = url;
  range.deleteContents();
  range.insertNode(a);
  const after = document.createRange();
  after.setStartAfter(a);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
}

export function createEditor(el) {
  el.contentEditable = "true";
  // Enter cria <p> (igual Notion) em vez do <div> padrão do contentEditable
  try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* navegador sem suporte */ }
  el.addEventListener("paste", (event) => {
    event.preventDefault();
    const clipboardHtml = event.clipboardData.getData("text/html");
    const plainText = event.clipboardData.getData("text/plain");
    const trimmed = plainText.trim();
    const selection = window.getSelection();
    const hasSelection = selection && !selection.isCollapsed && selection.rangeCount > 0 && el.contains(selection.anchorNode);
    if (hasSelection && /^(?:https?:\/\/|mailto:)\S+$/i.test(trimmed) && isSafeHref(trimmed)) {
      document.execCommand("createLink", false, trimmed);
      return;
    }
    const cleanHtml = clipboardHtml ? sanitizeFragment(clipboardHtml) : "";
    if (cleanHtml && !preferPlainText(cleanHtml, plainText)) {
      document.execCommand("insertHTML", false, cleanHtml);
      return;
    }
    // texto de uma linha só entra inline, no meio do parágrafo atual; várias linhas viram blocos
    document.execCommand("insertHTML", false, plainText.includes("\n") ? plainTextToHtml(plainText) : formatInline(plainText));
  });
  el.addEventListener("input", (event) => {
    const isSpace = event.inputType === "insertText" && event.data === " ";
    const isNewline = event.inputType === "insertParagraph" || event.inputType === "insertLineBreak";
    if (!isSpace && !isNewline) return;
    try { linkifyWordBeforeCaret(el); } catch { /* best-effort, nunca quebra a digitação */ }
    if (isSpace) try { applyTypingShortcut(el); } catch { /* idem */ }
  });
  return {
    el,
    getHtml: () => sanitizeFragment(el.innerHTML),
    setHtml: (value) => { el.innerHTML = sanitizeFragment(value || "<p><br></p>"); },
    focus: () => el.focus(),
  };
}

export function wireToolbar(toolbar, editor) {
  toolbar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-command]");
    if (!button) return;
    event.preventDefault();
    editor.focus();
    const { command, value } = button.dataset;
    if (command === "createLink") {
      const url = window.prompt("Link (https://...)");
      if (!url) return;
      document.execCommand("createLink", false, url);
      return;
    }
    if (command === "insertImage") {
      const url = window.prompt("Endereço da imagem (https://...)");
      if (!url) return;
      if (!isSafeImageSrc(url.trim())) { window.alert("Use um endereço de imagem que comece com https://"); return; }
      document.execCommand("insertImage", false, url.trim());
      return;
    }
    document.execCommand(command, false, value || undefined);
  });
}
