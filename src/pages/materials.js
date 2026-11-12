import { escapeHtml } from "../util/html.js";

const THEME_FILES = { azul: "/theme-azul.css", verde: "/theme-verde.css", roxo: "/theme-roxo.css" };

// Página pública com os materiais (campanhas ativas). Segurança: só sai daqui o que já é público
// na própria página /c/:slug antes do formulário — título, subtítulo, "o que você vai receber" e o
// link. O conteúdo liberado (contentHtml), leads, visitas, ids e configurações nunca entram.
export function publicMaterials(campaigns = []) {
  return campaigns
    .filter((campaign) => campaign?.active && /^[a-z0-9-]{3,60}$/.test(String(campaign.slug ?? "")))
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .map((campaign) => ({
      slug: campaign.slug,
      title: String(campaign.title ?? "").slice(0, 140),
      subtitle: String(campaign.subtitle ?? "").slice(0, 200),
      benefits: (Array.isArray(campaign.benefits) ? campaign.benefits : []).slice(0, 3).map((item) => String(item).slice(0, 100)),
      createdAt: campaign.createdAt ?? null,
    }));
}

const monthYear = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).replace(/\./g, "");
};
// iniciais da capa sem as palavras de ligação ("Leads que pagam" → LP, não LQ)
const SMALL_WORDS = new Set(["a", "o", "as", "os", "e", "de", "do", "da", "dos", "das", "que", "pra", "pro", "para", "com", "no", "na", "nos", "nas", "em", "um", "uma", "seu", "sua"]);
const initials = (title) => {
  const words = title.split(/\s+/).filter(Boolean);
  const main = words.filter((word) => !SMALL_WORDS.has(word.toLowerCase()));
  return (main.length ? main : words).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "M";
};
const DEFAULT_SUBTITLE = "O conteúdo completo do Reel, liberado na hora.";

function card(material, index) {
  const featured = index === 0;
  const benefits = material.benefits.length
    ? `<ul>${material.benefits.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  return `<a class="mt-card${featured ? " featured" : ""}" href="/c/${escapeHtml(material.slug)}" data-search="${escapeHtml(`${material.title} ${material.subtitle} ${material.benefits.join(" ")}`.toLowerCase())}">
    <div class="mt-cover" aria-hidden="true"><span>${escapeHtml(initials(material.title))}</span><i></i></div>
    <div class="mt-body">
      <div class="mt-meta"><span class="mt-tag">Material gratuito</span>${material.createdAt ? `<time datetime="${escapeHtml(material.createdAt)}">${escapeHtml(monthYear(material.createdAt))}</time>` : ""}</div>
      <h2>${escapeHtml(material.title)}</h2>
      <p>${escapeHtml(material.subtitle || DEFAULT_SUBTITLE)}</p>
      ${featured ? benefits : ""}
      <span class="mt-cta">Acessar material <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
    </div>
  </a>`;
}

export function renderMaterialsPage(campaigns, settings = {}, { origin = "" } = {}) {
  const materials = publicMaterials(campaigns);
  const brandName = String(settings.brandName || "Materiais").slice(0, 60);
  const handle = String(settings.brandHandle || "").replace(/^@/, "").slice(0, 60);
  const tagline = String(settings.brandTagline || "").slice(0, 140);
  const theme = THEME_FILES[settings.brandTemplate] || "/theme.css";
  const logo = /^https:\/\//i.test(String(settings.brandLogoUrl || "")) ? settings.brandLogoUrl : "";
  const title = `Materiais dos Reels · ${brandName}`;
  const description = tagline || "Todo o conteúdo prometido nos Reels, num lugar só: prompts, skills e passo a passo pra aplicar hoje.";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">${origin ? `<meta property="og:url" content="${escapeHtml(`${origin}/materiais`)}">` : ""}${logo ? `<meta property="og:image" content="${escapeHtml(logo)}">` : ""}
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="stylesheet" href="${escapeHtml(theme)}"><link rel="stylesheet" href="/materials.css">
</head><body class="mt-body-page">
<header class="mt-top">
  <a class="mt-brand" href="${handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : "#"}"${handle ? ' target="_blank" rel="noopener noreferrer"' : ""}>${logo ? `<img src="${escapeHtml(logo)}" alt="">` : `<span class="mt-mark">${escapeHtml(initials(brandName))}</span>`}<span><strong>${escapeHtml(brandName)}</strong>${handle ? `<small>@${escapeHtml(handle)}</small>` : ""}</span></a>
  ${handle ? `<a class="mt-follow" href="https://www.instagram.com/${encodeURIComponent(handle)}/" target="_blank" rel="noopener noreferrer">Seguir no Instagram</a>` : ""}
</header>
<main class="mt-main">
  <section class="mt-hero">
    <p class="mt-eyebrow">Materiais dos Reels</p>
    <h1>Tudo o que eu prometi nos vídeos, <span>num lugar só.</span></h1>
    <p class="mt-lead">${escapeHtml(description)}</p>
    <label class="mt-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="mt-search" type="search" placeholder="Buscar material…" autocomplete="off" aria-label="Buscar material"><span id="mt-count">${materials.length} ${materials.length === 1 ? "material" : "materiais"}</span></label>
  </section>
  ${materials.length ? `<section class="mt-grid" id="mt-grid">${materials.map(card).join("")}</section><p class="mt-empty" id="mt-empty" hidden>Nenhum material com esse termo.</p>` : '<p class="mt-empty">Nenhum material publicado ainda.</p>'}
</main>
<footer class="mt-foot"><span>${escapeHtml(brandName)}</span>${handle ? `<a href="https://www.instagram.com/${encodeURIComponent(handle)}/" target="_blank" rel="noopener noreferrer">@${escapeHtml(handle)}</a>` : ""}</footer>
<script src="/materials.js"></script>
</body></html>`;
}
