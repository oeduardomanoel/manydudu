const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "A", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "HR", "SPAN", "DIV"]);
const ALLOWED_HREF_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isSafeHref(value) {
  try {
    return ALLOWED_HREF_SCHEMES.has(new URL(String(value ?? ""), "https://sanitize.invalid").protocol);
  } catch {
    return false;
  }
}

function cleanNode(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE || !ALLOWED_TAGS.has(child.tagName)) {
      child.replaceWith(...child.childNodes);
      continue;
    }
    for (const attr of [...child.attributes]) {
      if (child.tagName === "A" && attr.name === "href") { if (!isSafeHref(attr.value)) child.removeAttribute("href"); continue; }
      child.removeAttribute(attr.name);
    }
    cleanNode(child);
  }
}

export function sanitizeFragment(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  cleanNode(wrapper);
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
  el.addEventListener("paste", (event) => {
    event.preventDefault();
    const clipboardHtml = event.clipboardData.getData("text/html");
    if (clipboardHtml) {
      document.execCommand("insertHTML", false, sanitizeFragment(clipboardHtml));
      return;
    }
    const plainText = event.clipboardData.getData("text/plain");
    const trimmed = plainText.trim();
    const selection = window.getSelection();
    const hasSelection = selection && !selection.isCollapsed && selection.rangeCount > 0 && el.contains(selection.anchorNode);
    if (hasSelection && /^(?:https?:\/\/|mailto:)\S+$/i.test(trimmed) && isSafeHref(trimmed)) {
      document.execCommand("createLink", false, trimmed);
      return;
    }
    document.execCommand("insertHTML", false, linkifyText(plainText));
  });
  el.addEventListener("input", (event) => {
    const isSpace = event.inputType === "insertText" && event.data === " ";
    const isNewline = event.inputType === "insertParagraph" || event.inputType === "insertLineBreak";
    if (!isSpace && !isNewline) return;
    try { linkifyWordBeforeCaret(el); } catch { /* best-effort, nunca quebra a digitação */ }
  });
  return {
    el,
    getHtml: () => sanitizeFragment(el.innerHTML),
    setHtml: (value) => { el.innerHTML = sanitizeFragment(value || "<p></p>"); },
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
    document.execCommand(command, false, value || undefined);
  });
}
