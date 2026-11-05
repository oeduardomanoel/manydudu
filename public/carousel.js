import { DECORATIONS, getDecoration, drawDecorationOnCanvas, decorationToSvgMarkup } from "/carousel-decorations.js";

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = "manydudu_carousel_v2";
const WIDTH = 1080;
const HEIGHT = 1350;
const DECORATION_BASE_SIZE = 220;

const ACCENTS = { laranja: "#ff5a1f", azul: "#1f6aff", verde: "#0fae76", roxo: "#631fff" };
const ACCENT_TINTS = { laranja: "#fbe6d8", azul: "#dbe7ff", verde: "#d7f2e6", roxo: "#e8defd" };

const BACKGROUND_LABELS = { cream: "Creme", dark: "Escuro", duotone: "Duotone", paper: "Papel" };
const PALETTES = {
  cream: { ink: "#1c1a17", bodyInk: "#2c2822", muted: "#4a453d", card: "#ffffffb0" },
  dark: { ink: "#f5efe4", bodyInk: "#e7ded0", muted: "#b7ada0", card: "#ffffff14" },
  duotone: { ink: "#1c1a17", bodyInk: "#2c2822", muted: "#463c33", card: "#ffffffc2" },
  paper: { ink: "#1c1a17", bodyInk: "#2c2822", muted: "#4a453d", card: "#ffffffb0" },
};

// Pares de fonte com personalidades distintas — carregados sob demanda (a folha de
// estilo do Google Fonts só é injetada quando o par é escolhido pela primeira vez).
const FONT_PAIRINGS = {
  editorial: { label: "Editorial", display: "'Fraunces'", displayWeight: 800, displayItalic: true, body: "'Work Sans'",
    href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600;0,700;0,800;0,900;1,800&family=Work+Sans:wght@400;500;600;700;800&display=swap" },
  moderno: { label: "Moderno", display: "'Space Grotesk'", displayWeight: 700, displayItalic: false, body: "'Sora'",
    href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Sora:wght@400;500;600;700&display=swap" },
  classico: { label: "Clássico", display: "'Playfair Display'", displayWeight: 800, displayItalic: true, body: "'Source Sans 3'",
    href: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&family=Source+Sans+3:wght@400;500;600;700&display=swap" },
  impacto: { label: "Impacto", display: "'Archivo Black'", displayWeight: 400, displayItalic: false, body: "'Archivo'",
    href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700;800&display=swap" },
};

const SLIDE_LABELS = { cover: "Capa", content: "Conteúdo", comparison: "Comparação", mockup: "Mockup", cta: "Chamada final" };

const SLIDE_DEFAULTS = {
  cover: { eyebrow: "GUIA RÁPIDO", headline: "Como criar\num carrossel", headlineAccent: "com a sua marca.", subtext: "Sem precisar contratar designer." },
  content: { badge: "", heading: "O que muda", body: "- Cores da sua marca aplicadas sozinhas\n- Texto que você escreve na hora\n- PNG em alta pra postar direto" },
  comparison: { badgeTop: "PARTE 2", leftWord: "MANUAL", rightWord: "AUTOMÁTICO", note: "0 horas no Canva", badgeNote: "" },
  mockup: { heading: "O resultado", imageDataUrl: "", caption: "Exportado direto do painel" },
  cta: { heading: "Curtiu?", subtext: "Comenta aqui embaixo que eu te mando o passo a passo.", ctaText: "COMENTE CARROSSEL" },
};

const FIELD_SCHEMA = {
  cover: [
    { key: "eyebrow", label: "Selo pequeno (opcional)", type: "text", maxlength: 40 },
    { key: "headline", label: "Título principal (Enter quebra linha)", type: "textarea", maxlength: 120 },
    { key: "headlineAccent", label: "Linha final, na cor de destaque (opcional)", type: "text", maxlength: 60 },
    { key: "subtext", label: "Texto de apoio", type: "textarea", maxlength: 160 },
  ],
  content: [
    { key: "badge", label: "Selo pequeno (opcional, ex.: PARTE 2)", type: "text", maxlength: 24 },
    { key: "heading", label: "Título", type: "text", maxlength: 70 },
    { key: "body", label: "Texto (linha começando com \"- \" vira lista)", type: "textarea", maxlength: 500 },
  ],
  comparison: [
    { key: "badgeTop", label: "Selo pequeno (opcional)", type: "text", maxlength: 24 },
    { key: "leftWord", label: "Palavra da esquerda", type: "text", maxlength: 20 },
    { key: "rightWord", label: "Palavra da direita (cor de destaque)", type: "text", maxlength: 20 },
    { key: "note", label: "Linha de apoio (opcional)", type: "text", maxlength: 80 },
    { key: "badgeNote", label: "Selo final (opcional)", type: "text", maxlength: 40 },
  ],
  mockup: [
    { key: "heading", label: "Título", type: "text", maxlength: 70 },
    { key: "imageDataUrl", label: "Imagem (screenshot, foto...)", type: "image" },
    { key: "caption", label: "Legenda pequena (opcional)", type: "text", maxlength: 60 },
  ],
  cta: [
    { key: "heading", label: "Título", type: "text", maxlength: 70 },
    { key: "subtext", label: "Texto de apoio", type: "textarea", maxlength: 160 },
    { key: "ctaText", label: "Texto dentro do botão", type: "text", maxlength: 40 },
  ],
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* localStorage indisponível ou JSON corrompido — recomeça do zero */ }
  return { title: "Meu carrossel", accent: "laranja", background: "cream", fontPairing: "editorial", handle: "", slides: [{ type: "cover", ...SLIDE_DEFAULTS.cover }] };
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota cheia — segue só em memória */ }
}

let state = loadState();
let selectedIndex = 0;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text ?? "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let current = words[0];
    for (const word of words.slice(1)) {
      const attempt = `${current} ${word}`;
      if (ctx.measureText(attempt).width <= maxWidth) current = attempt;
      else { lines.push(current); current = word; }
    }
    lines.push(current);
  }
  return lines;
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, { align = "left", color } = {}) {
  if (color) ctx.fillStyle = color;
  ctx.textAlign = align;
  const lines = wrapLines(ctx, text, maxWidth);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function drawPill(ctx, text, x, y, { fill, textColor = "#fff", font = "700 22px 'Work Sans'", padX = 22, padY = 12, align = "left" } = {}) {
  if (!text) return { width: 0, height: 0 };
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;
  const width = textWidth + padX * 2;
  const height = padY * 2 + 22;
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  ctx.fillStyle = fill;
  roundRect(ctx, left, y, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + padX, y + height / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return { width, height, left };
}

// --- tipografia dependente do par de fonte escolhido ---------------------------------

const loadedFontHrefs = new Set();
function ensureFontPairingLoaded(id) {
  const pairing = FONT_PAIRINGS[id] || FONT_PAIRINGS.editorial;
  if (loadedFontHrefs.has(pairing.href)) return document.fonts.ready;
  loadedFontHrefs.add(pairing.href);
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = pairing.href;
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
    setTimeout(resolve, 2500); // rede lenta não pode travar o preview pra sempre
  }).then(() => document.fonts.ready);
}

function displayFont(theme, sizePx, { italic = false } = {}) {
  const pairing = FONT_PAIRINGS[theme.fontPairing] || FONT_PAIRINGS.editorial;
  return `${italic && pairing.displayItalic ? "italic " : ""}${pairing.displayWeight} ${sizePx}px ${pairing.display}`;
}

function bodyFont(theme, sizePx, weight = 500) {
  const pairing = FONT_PAIRINGS[theme.fontPairing] || FONT_PAIRINGS.editorial;
  return `${weight} ${sizePx}px ${pairing.body}`;
}

// Encolhe o texto até ele caber em maxLines — assim um título longo nunca estoura o
// slide, só reduz de tamanho ("encaixar" automático).
function fitDisplayLines(ctx, theme, text, maxWidth, maxSizePx, minSizePx, maxLines, { italic = false } = {}) {
  let size = maxSizePx;
  let lines = [String(text ?? "")];
  while (size > minSizePx) {
    ctx.font = displayFont(theme, size, { italic });
    lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines) break;
    size -= 4;
  }
  ctx.font = displayFont(theme, size, { italic });
  return { size, lines: lines.slice(0, maxLines) };
}

// --- fundo -----------------------------------------------------------------------------

function paintBackground(ctx, theme) {
  if (theme.background === "dark") {
    const gradient = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.05, 80, WIDTH * 0.5, HEIGHT * 0.5, HEIGHT * 0.9);
    gradient.addColorStop(0, "#221d17"); gradient.addColorStop(1, "#0f0d0a");
    ctx.fillStyle = gradient;
  } else if (theme.background === "duotone") {
    ctx.fillStyle = ACCENT_TINTS[theme.accent] || ACCENT_TINTS.laranja;
  } else {
    const gradient = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.05, 80, WIDTH * 0.5, HEIGHT * 0.5, HEIGHT * 0.9);
    gradient.addColorStop(0, "#faf3ea"); gradient.addColorStop(1, "#efe2d2");
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (theme.background === "paper") {
    ctx.save();
    ctx.fillStyle = `${theme.palette.ink}14`;
    for (let yy = 48; yy < HEIGHT; yy += 48) for (let xx = 48; xx < WIDTH; xx += 48) { ctx.beginPath(); ctx.arc(xx, yy, 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha = theme.background === "dark" ? 0.12 : 0.05;
  ctx.strokeStyle = theme.accentHex;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(WIDTH + 60, -60, 220 + i * 80, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

function paintChrome(ctx, theme, handle, slideIndex, slideCount) {
  ctx.fillStyle = theme.palette.ink;
  ctx.font = bodyFont(theme, 22, 600);
  ctx.textAlign = "left";
  if (handle) ctx.fillText(`@${handle}`, 64, 64);
  ctx.beginPath();
  ctx.fillStyle = theme.accentHex;
  ctx.arc(WIDTH - 74, 54, 16, 0, Math.PI * 2);
  ctx.fill();
  if (slideCount > 1) {
    const dotGap = 22;
    const totalWidth = (slideCount - 1) * dotGap;
    const startX = WIDTH / 2 - totalWidth / 2;
    const y = HEIGHT - 56;
    for (let i = 0; i < slideCount; i++) {
      ctx.beginPath();
      ctx.fillStyle = i === slideIndex ? theme.accentHex : `${theme.palette.muted}55`;
      ctx.arc(startX + i * dotGap, y, i === slideIndex ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// --- slides ------------------------------------------------------------------------------

function renderCover(ctx, slide, theme) {
  let y = 210;
  if (slide.eyebrow) {
    ctx.font = bodyFont(theme, 26, 700);
    ctx.fillStyle = theme.accentHex;
    ctx.textAlign = "left";
    ctx.save(); ctx.letterSpacing = "3px"; ctx.fillText(slide.eyebrow.toUpperCase(), 64, y); ctx.restore();
    y += 60;
  }
  const head = fitDisplayLines(ctx, theme, slide.headline, WIDTH - 128, 84, 48, 5);
  const headLh = head.size * 1.1;
  ctx.fillStyle = theme.palette.ink; ctx.textAlign = "left";
  head.lines.forEach((line, i) => ctx.fillText(line, 64, y + 20 + i * headLh));
  y = y + 20 + head.lines.length * headLh;
  if (slide.headlineAccent) {
    const accentFit = fitDisplayLines(ctx, theme, slide.headlineAccent, WIDTH - 128, head.size, 40, 3, { italic: true });
    const accentLh = accentFit.size * 1.1;
    ctx.fillStyle = theme.accentHex;
    accentFit.lines.forEach((line, i) => ctx.fillText(line, 64, y + 4 + i * accentLh));
    y = y + 4 + accentFit.lines.length * accentLh;
  }
  if (slide.subtext) {
    ctx.font = bodyFont(theme, 32, 500);
    drawWrapped(ctx, slide.subtext, 64, y + 56, WIDTH - 128, 42, { color: theme.palette.muted });
  }
}

function renderContent(ctx, slide, theme) {
  let y = 190;
  if (slide.badge) { drawPill(ctx, slide.badge.toUpperCase(), 64, y, { fill: theme.accentHex, font: bodyFont(theme, 24, 700) }); y += 90; }
  const head = fitDisplayLines(ctx, theme, slide.heading, WIDTH - 128, 64, 36, 3);
  const headLh = head.size * 1.12;
  ctx.fillStyle = theme.palette.ink; ctx.textAlign = "left";
  head.lines.forEach((line, i) => ctx.fillText(line, 64, y + 44 + i * headLh));
  y = y + 44 + head.lines.length * headLh + 40;
  ctx.font = bodyFont(theme, 34, 500);
  const lines = String(slide.body ?? "").split("\n");
  for (const line of lines) {
    const bullet = line.trim().startsWith("- ");
    const text = bullet ? line.trim().slice(2) : line;
    if (bullet) {
      ctx.beginPath(); ctx.fillStyle = theme.accentHex; ctx.arc(78, y - 12, 8, 0, Math.PI * 2); ctx.fill();
      y = drawWrapped(ctx, text, 108, y, WIDTH - 172, 46, { color: theme.palette.bodyInk });
    } else {
      y = drawWrapped(ctx, text, 64, y, WIDTH - 128, 46, { color: theme.palette.bodyInk });
    }
    y += 18;
  }
}

function renderComparison(ctx, slide, theme) {
  let y = 220;
  if (slide.badgeTop) { const pill = drawPill(ctx, slide.badgeTop.toUpperCase(), WIDTH / 2, y, { fill: theme.accentHex, align: "center" }); y += pill.height + 130; }
  else y += 70;
  const left = fitDisplayLines(ctx, theme, String(slide.leftWord ?? "").toUpperCase(), WIDTH - 160, 108, 56, 1);
  ctx.textAlign = "center"; ctx.fillStyle = theme.palette.ink;
  ctx.fillText(left.lines[0] || "", WIDTH / 2, y);
  y += 96;
  drawPill(ctx, "vs", WIDTH / 2, y, { fill: `${theme.palette.ink}2e`, textColor: theme.palette.ink, font: bodyFont(theme, 28, 700), align: "center" });
  y += 96;
  const right = fitDisplayLines(ctx, theme, String(slide.rightWord ?? "").toUpperCase(), WIDTH - 160, 108, 56, 1);
  ctx.textAlign = "center"; ctx.fillStyle = theme.accentHex;
  ctx.fillText(right.lines[0] || "", WIDTH / 2, y);
  y += 90;
  if (slide.note) { ctx.font = bodyFont(theme, 34, 600); ctx.fillStyle = theme.palette.bodyInk; ctx.textAlign = "center"; ctx.fillText(slide.note, WIDTH / 2, y); y += 60; }
  if (slide.badgeNote) drawPill(ctx, slide.badgeNote, WIDTH / 2, y, { fill: theme.accentHex, align: "center" });
}

function renderMockup(ctx, slide, theme, imageCache) {
  let y = 170;
  const head = fitDisplayLines(ctx, theme, slide.heading, WIDTH - 128, 60, 34, 2);
  const headLh = head.size * 1.1;
  ctx.fillStyle = theme.palette.ink; ctx.textAlign = "left";
  head.lines.forEach((line, i) => ctx.fillText(line, 64, y + 40 + i * headLh));
  y = y + 40 + head.lines.length * headLh;
  const frameY = y + 60, frameX = 90, frameW = WIDTH - 180, frameH = 880;
  ctx.save();
  roundRect(ctx, frameX, frameY, frameW, frameH, 28);
  ctx.fillStyle = theme.palette.card;
  ctx.strokeStyle = `${theme.accentHex}55`;
  ctx.lineWidth = 3;
  ctx.fill(); ctx.stroke();
  const image = imageCache.get(slide.imageDataUrl);
  if (image) {
    ctx.clip();
    const scale = Math.max(frameW / image.width, frameH / image.height);
    const drawW = image.width * scale, drawH = image.height * scale;
    ctx.drawImage(image, frameX + (frameW - drawW) / 2, frameY + (frameH - drawH) / 2, drawW, drawH);
  } else {
    ctx.fillStyle = theme.palette.muted;
    ctx.font = bodyFont(theme, 28, 500);
    ctx.textAlign = "center";
    ctx.fillText("Envie uma imagem ao lado →", frameX + frameW / 2, frameY + frameH / 2);
  }
  ctx.restore();
  if (slide.caption) {
    ctx.font = bodyFont(theme, 28, 600);
    ctx.fillStyle = theme.palette.muted;
    ctx.textAlign = "center";
    ctx.fillText(slide.caption, WIDTH / 2, frameY + frameH + 56);
  }
}

function renderCta(ctx, slide, theme) {
  let y = 420;
  const head = fitDisplayLines(ctx, theme, slide.heading, WIDTH - 160, 78, 44, 4);
  const headLh = head.size * 1.1;
  ctx.fillStyle = theme.palette.ink; ctx.textAlign = "center";
  head.lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, y + i * headLh));
  y += head.lines.length * headLh;
  if (slide.subtext) { ctx.font = bodyFont(theme, 32, 500); y = drawWrapped(ctx, slide.subtext, WIDTH / 2, y + 50, WIDTH - 220, 44, { color: theme.palette.muted, align: "center" }); }
  if (slide.ctaText) {
    const boxW = WIDTH - 200, boxH = 130, boxY = HEIGHT - 320;
    roundRect(ctx, 100, boxY, boxW, boxH, boxH / 2);
    ctx.fillStyle = theme.accentHex;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = bodyFont(theme, 44, 800);
    ctx.textAlign = "center";
    ctx.fillText(slide.ctaText.toUpperCase(), WIDTH / 2, boxY + boxH / 2 + 15);
  }
}

const RENDERERS = { cover: renderCover, content: renderContent, comparison: renderComparison, mockup: renderMockup, cta: renderCta };
const imageCache = new Map();

function ensureImageLoaded(dataUrl) {
  if (!dataUrl || imageCache.has(dataUrl)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imageCache.set(dataUrl, img); resolve(); };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

function buildTheme() {
  return {
    accentHex: ACCENTS[state.accent] || ACCENTS.laranja,
    accent: state.accent,
    background: state.background || "cream",
    palette: PALETTES[state.background] || PALETTES.cream,
    fontPairing: state.fontPairing || "editorial",
  };
}

function decorationColor(theme, tone) {
  if (tone === "accent") return theme.accentHex;
  if (tone === "white") return "#ffffff";
  if (tone === "muted") return theme.palette.muted;
  return theme.palette.ink;
}

async function renderSlideToCanvas(canvas, slide, index) {
  const ctx = canvas.getContext("2d");
  await ensureFontPairingLoaded(state.fontPairing);
  const theme = buildTheme();
  if (slide.type === "mockup" && slide.imageDataUrl) await ensureImageLoaded(slide.imageDataUrl);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  paintBackground(ctx, theme);
  (RENDERERS[slide.type] || renderContent)(ctx, slide, theme, imageCache);
  if (slide.decoration) {
    const entry = getDecoration(slide.decoration.id);
    if (entry) drawDecorationOnCanvas(ctx, entry, slide.decoration.x * WIDTH, slide.decoration.y * HEIGHT,
      DECORATION_BASE_SIZE * (slide.decoration.scale || 1), decorationColor(theme, slide.decoration.tone));
  }
  paintChrome(ctx, theme, state.handle, index, state.slides.length);
}

async function renderPreview() {
  const canvas = $("#carousel-canvas");
  if (!canvas) return;
  const slide = state.slides[selectedIndex];
  if (!slide) return;
  await renderSlideToCanvas(canvas, slide, selectedIndex);
}

// --- pickers globais (destaque, fundo, fonte) ------------------------------------------

function renderAccentPicker() {
  const container = $("#carousel-accent-picker");
  if (!container) return;
  container.innerHTML = Object.entries(ACCENTS).map(([key, hex]) =>
    `<button type="button" class="template-swatch${state.accent === key ? " active" : ""}" data-accent="${key}" style="--swatch:${hex}"></button>`).join("");
  container.querySelectorAll("[data-accent]").forEach((button) => button.addEventListener("click", () => {
    state.accent = button.dataset.accent; saveState(); renderAccentPicker(); renderPreview();
  }));
}

function renderBackgroundPicker() {
  const container = $("#carousel-background-picker");
  if (!container) return;
  container.innerHTML = Object.entries(BACKGROUND_LABELS).map(([key, label]) =>
    `<button type="button" class="carousel-chip${state.background === key ? " active" : ""}" data-bg="${key}">${label}</button>`).join("");
  container.querySelectorAll("[data-bg]").forEach((button) => button.addEventListener("click", () => {
    state.background = button.dataset.bg; saveState(); renderBackgroundPicker(); renderPreview();
  }));
}

function renderFontPicker() {
  const container = $("#carousel-font-picker");
  if (!container) return;
  container.innerHTML = Object.entries(FONT_PAIRINGS).map(([key, pairing]) =>
    `<button type="button" class="carousel-chip${state.fontPairing === key ? " active" : ""}" data-font="${key}">${pairing.label}</button>`).join("");
  container.querySelectorAll("[data-font]").forEach((button) => button.addEventListener("click", async () => {
    state.fontPairing = button.dataset.font; saveState(); renderFontPicker();
    await renderPreview();
  }));
}

// --- lista de slides ---------------------------------------------------------------------

function renderSlideList() {
  const container = $("#carousel-slide-list");
  if (!container) return;
  container.innerHTML = state.slides.map((slide, index) => `
    <div class="carousel-slide-item${index === selectedIndex ? " active" : ""}" data-index="${index}">
      <span>${index + 1}. ${SLIDE_LABELS[slide.type] || slide.type}</span>
      <div class="carousel-slide-actions">
        <button type="button" class="icon-btn" data-move="-1" data-index="${index}" title="Mover pra cima">↑</button>
        <button type="button" class="icon-btn" data-move="1" data-index="${index}" title="Mover pra baixo">↓</button>
        <button type="button" class="icon-btn" data-remove="${index}" title="Remover">×</button>
      </div>
    </div>`).join("");
  container.querySelectorAll("[data-index]:not([data-move])").forEach((item) => item.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    selectedIndex = Number(item.dataset.index);
    renderSlideList(); renderFields(); renderPreview();
  }));
  container.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.index), target = index + Number(button.dataset.move);
    if (target < 0 || target >= state.slides.length) return;
    [state.slides[index], state.slides[target]] = [state.slides[target], state.slides[index]];
    if (selectedIndex === index) selectedIndex = target; else if (selectedIndex === target) selectedIndex = index;
    saveState(); renderSlideList(); renderFields(); renderPreview();
  }));
  container.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => {
    if (state.slides.length <= 1) return;
    state.slides.splice(Number(button.dataset.remove), 1);
    selectedIndex = Math.max(0, Math.min(selectedIndex, state.slides.length - 1));
    saveState(); renderSlideList(); renderFields(); renderPreview();
  }));
}

// --- campos do slide selecionado + decoração --------------------------------------------

const DECORATION_GROUPS = [
  { category: "app", label: "APPS (ESTILO 3D)" },
  { category: "simbolo", label: "SÍMBOLOS" },
  { category: "mascote", label: "MASCOTES" },
];

function renderDecorationSection(container, slide) {
  const section = document.createElement("div");
  section.className = "carousel-decoration-section";
  const selectedEntry = slide.decoration ? getDecoration(slide.decoration.id) : null;
  const isApp = selectedEntry?.category === "app";
  const groupsHtml = DECORATION_GROUPS.map(({ category, label }) => {
    const items = DECORATIONS.filter((entry) => entry.category === category);
    const grid = items.map((entry) =>
      `<button type="button" class="carousel-deco-btn${slide.decoration?.id === entry.id ? " active" : ""}" data-deco="${entry.id}" title="${entry.label}">${decorationToSvgMarkup(entry)}</button>`).join("");
    return `<p class="hint" style="margin:10px 0 6px;text-transform:uppercase;letter-spacing:1px;font-size:9px">${label}</p><div class="carousel-deco-grid">${grid}</div>`;
  }).join("");
  section.innerHTML = `
    <p class="eyebrow" style="margin-top:22px">DECORAÇÃO</p>
    ${groupsHtml}
    ${slide.decoration ? `
      <div class="carousel-deco-controls">
        <label>Tamanho<input type="range" id="carousel-deco-scale" min="0.4" max="2.5" step="0.05" value="${slide.decoration.scale ?? 1}"></label>
        ${isApp ? "" : `<label>Cor<select id="carousel-deco-tone">
          <option value="accent"${slide.decoration.tone === "accent" ? " selected" : ""}>Destaque</option>
          <option value="ink"${slide.decoration.tone === "ink" ? " selected" : ""}>Escuro</option>
          <option value="muted"${slide.decoration.tone === "muted" ? " selected" : ""}>Suave</option>
          <option value="white"${slide.decoration.tone === "white" ? " selected" : ""}>Branco</option>
        </select></label>`}
        <button type="button" class="icon-btn" id="carousel-deco-remove">Remover</button>
      </div>
      <p class="hint" style="margin:8px 0 0">Arraste no preview pra posicionar.</p>`
      : `<p class="hint" style="margin:8px 0 0">Clique num ícone pra colocar no slide.</p>`}
  `;
  container.appendChild(section);
  section.querySelectorAll("[data-deco]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.deco;
    slide.decoration = slide.decoration?.id === id ? null : { id, x: 0.82, y: 0.16, scale: 1, tone: "accent" };
    saveState(); renderFields(); renderPreview();
  }));
  section.querySelector("#carousel-deco-scale")?.addEventListener("input", (event) => {
    slide.decoration.scale = Number(event.target.value); saveState(); renderPreview();
  });
  section.querySelector("#carousel-deco-tone")?.addEventListener("change", (event) => {
    slide.decoration.tone = event.target.value; saveState(); renderPreview();
  });
  section.querySelector("#carousel-deco-remove")?.addEventListener("click", () => {
    slide.decoration = null; saveState(); renderFields(); renderPreview();
  });
}

function renderFields() {
  const container = $("#carousel-fields");
  if (!container) return;
  const slide = state.slides[selectedIndex];
  if (!slide) { container.innerHTML = ""; return; }
  const schema = FIELD_SCHEMA[slide.type] || [];
  container.innerHTML = `<p class="eyebrow">EDITANDO</p><h3 style="margin:0 0 16px">${SLIDE_LABELS[slide.type]}</h3>` + schema.map((field) => {
    if (field.type === "image") {
      return `<label>${field.label}<input type="file" accept="image/png,image/jpeg,image/webp" data-field="${field.key}"></label>`;
    }
    const value = (slide[field.key] ?? "").toString().replace(/"/g, "&quot;");
    return field.type === "textarea"
      ? `<label>${field.label}<textarea data-field="${field.key}" maxlength="${field.maxlength}">${value}</textarea></label>`
      : `<label>${field.label}<input data-field="${field.key}" maxlength="${field.maxlength}" value="${value}"></label>`;
  }).join("");
  container.querySelectorAll("[data-field]").forEach((input) => {
    if (input.type === "file") {
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { slide[input.dataset.field] = reader.result; saveState(); renderPreview(); };
        reader.readAsDataURL(file);
      });
      return;
    }
    input.addEventListener("input", () => { slide[input.dataset.field] = input.value; saveState(); renderPreview(); });
  });
  renderDecorationSection(container, slide);
}

// --- arrastar a decoração direto no preview ------------------------------------------

function setupDecorationDrag(canvas) {
  let dragging = false;
  function toCanvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) * (WIDTH / rect.width), y: (clientY - rect.top) * (HEIGHT / rect.height) };
  }
  function hitDecoration(point) {
    const slide = state.slides[selectedIndex];
    if (!slide?.decoration) return false;
    const cx = slide.decoration.x * WIDTH, cy = slide.decoration.y * HEIGHT;
    const radius = (DECORATION_BASE_SIZE * (slide.decoration.scale || 1)) / 2 * 1.2;
    return Math.hypot(point.x - cx, point.y - cy) <= radius;
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (!hitDecoration(toCanvasPoint(event.clientX, event.clientY))) return;
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (event) => {
    const point = toCanvasPoint(event.clientX, event.clientY);
    const slide = state.slides[selectedIndex];
    if (!dragging || !slide?.decoration) { canvas.style.cursor = hitDecoration(point) ? "grab" : "default"; return; }
    slide.decoration.x = Math.min(0.96, Math.max(0.04, point.x / WIDTH));
    slide.decoration.y = Math.min(0.96, Math.max(0.04, point.y / HEIGHT));
    renderPreview();
  });
  function stopDrag() {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "default";
    saveState();
  }
  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);
  canvas.addEventListener("pointerleave", () => { if (!dragging) canvas.style.cursor = "default"; });
}

// --- exportar -----------------------------------------------------------------------------

async function downloadCanvasAsPng(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}

function slugify(value) {
  return String(value ?? "carrossel").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "carrossel";
}

async function initCarousel() {
  const root = $("#view-carousel");
  if (!root) return;
  await document.fonts.ready;
  const titleInput = $("#carousel-title");
  const handleInput = $("#carousel-handle");
  if (titleInput) { titleInput.value = state.title || ""; titleInput.addEventListener("input", () => { state.title = titleInput.value; saveState(); }); }
  if (handleInput) { handleInput.value = state.handle || ""; handleInput.addEventListener("input", () => { state.handle = handleInput.value.trim().replace(/^@/, ""); saveState(); renderPreview(); }); }

  try {
    const branding = await fetch("/api/branding").then((res) => res.ok ? res.json() : null);
    if (branding && !state.handle && branding.brandHandle) { state.handle = branding.brandHandle; if (handleInput) handleInput.value = branding.brandHandle; }
    if (branding?.brandTemplate && ACCENTS[branding.brandTemplate]) state.accent = state.accent || branding.brandTemplate;
  } catch { /* painel funciona mesmo sem conseguir buscar a marca */ }

  renderAccentPicker();
  renderBackgroundPicker();
  renderFontPicker();
  renderSlideList();
  renderFields();
  await renderPreview();
  setupDecorationDrag($("#carousel-canvas"));

  $("#carousel-add-slide")?.addEventListener("click", () => {
    const type = $("#carousel-add-type").value;
    state.slides.push({ type, ...SLIDE_DEFAULTS[type] });
    selectedIndex = state.slides.length - 1;
    saveState(); renderSlideList(); renderFields(); renderPreview();
  });

  $("#carousel-new")?.addEventListener("click", () => {
    if (!confirm("Isso apaga o carrossel atual e começa um novo. Continuar?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    selectedIndex = 0;
    renderAccentPicker(); renderBackgroundPicker(); renderFontPicker(); renderSlideList(); renderFields(); renderPreview();
    if (titleInput) titleInput.value = state.title;
    if (handleInput) handleInput.value = state.handle;
  });

  $("#carousel-download-one")?.addEventListener("click", async () => {
    const canvas = $("#carousel-canvas");
    await downloadCanvasAsPng(canvas, `${slugify(state.title)}-${selectedIndex + 1}.png`);
  });

  $("#carousel-download-all")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const offscreen = document.createElement("canvas");
    offscreen.width = WIDTH; offscreen.height = HEIGHT;
    for (let i = 0; i < state.slides.length; i++) {
      await renderSlideToCanvas(offscreen, state.slides[i], i);
      await downloadCanvasAsPng(offscreen, `${slugify(state.title)}-${i + 1}.png`);
    }
    button.disabled = false;
  });
}

initCarousel();
