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

export function createEditor(el) {
  el.contentEditable = "true";
  el.addEventListener("paste", (event) => {
    event.preventDefault();
    const clipboardHtml = event.clipboardData.getData("text/html");
    if (clipboardHtml) {
      document.execCommand("insertHTML", false, sanitizeFragment(clipboardHtml));
    } else {
      document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    }
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
