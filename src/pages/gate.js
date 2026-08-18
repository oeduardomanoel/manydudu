import { escapeHtml } from "../util/html.js";
import { DEFAULT_INTEREST_LABEL, DEFAULT_NICHES } from "../domain/campaigns.js";

const THEME_FILES = { azul: "/theme-azul.css", verde: "/theme-verde.css", roxo: "/theme-roxo.css" };
const DEFAULT_TAGLINE = "Automação que conversa, conteúdo que entrega.";
const DEFAULT_BRAND_NAME = "Minha Marca";

function resolveBrand(settings = {}) {
  return {
    name: settings.brandName || DEFAULT_BRAND_NAME,
    handle: settings.brandHandle || "",
    tagline: settings.brandTagline || DEFAULT_TAGLINE,
    themeHref: THEME_FILES[settings.brandTemplate] || "/theme.css",
  };
}

const HEAD = (title, themeHref) => `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="${escapeHtml(themeHref)}"><link rel="stylesheet" href="/campaign.css">`;

const eyebrow = (brand) => brand.handle ? `${escapeHtml(brand.name)} · @${escapeHtml(brand.handle)}` : escapeHtml(brand.name);

export function renderNotFound(settings = {}) {
  const brand = resolveBrand(settings);
  return `<!doctype html><html lang="pt-BR"><head>${HEAD("Conteúdo não encontrado", brand.themeHref)}</head><body class="gate-body">
  <div class="gate-shell"><div class="gate-card"><p class="eyebrow">${eyebrow(brand)}</p>
  <h1>Esse conteúdo não está mais disponível.</h1><p class="gate-sub">Confira o link ou volte para o Instagram.</p></div></div>
  </body></html>`;
}

export function renderGatePage(campaign, settings = {}) {
  const brand = resolveBrand(settings);
  const niches = campaign.niches?.length ? campaign.niches : DEFAULT_NICHES;
  const interestLabel = campaign.interestLabel || DEFAULT_INTEREST_LABEL;
  return `<!doctype html><html lang="pt-BR"><head>${HEAD(campaign.title, brand.themeHref)}</head><body class="gate-body">
  <div class="gate-shell">
    <div class="gate-brand-pane"><p class="eyebrow">${escapeHtml(brand.name)}</p><p class="gate-marketing">${escapeHtml(brand.tagline)}</p>${brand.handle ? `<span class="gate-handle">@${escapeHtml(brand.handle)}</span>` : ""}</div>
    <div class="gate-card">
      <p class="eyebrow">${eyebrow(brand)}</p>
      <h1>${escapeHtml(campaign.title)}</h1>
      <p class="gate-sub">Preencha os dados abaixo para liberar o conteúdo.</p>
      <form id="lead-form" class="gate-form">
        <label>Nome<input name="name" required maxlength="120" placeholder="Seu nome"></label>
        <label>WhatsApp<input name="whatsapp" required maxlength="30" placeholder="(11) 91234-5678"></label>
        <label>E-mail<input name="email" type="email" required maxlength="160" placeholder="voce@email.com"></label>
        <fieldset class="gate-niches"><legend>Qual seu nicho?</legend>
          <div class="pill-group">${niches.map((niche) => `<label class="pill"><input type="checkbox" name="niches" value="${escapeHtml(niche)}"><span>${escapeHtml(niche)}</span></label>`).join("")}</div>
          <input name="nicheOther" class="niche-other" hidden maxlength="120" placeholder="Qual é o seu nicho?">
        </fieldset>
        <label>${escapeHtml(interestLabel)}<textarea name="automationInterest" required maxlength="600" placeholder="Ex.: responder comentários e enviar material automaticamente"></textarea></label>
        <input type="hidden" name="slug" value="${escapeHtml(campaign.slug)}">
        <label class="hp-field" aria-hidden="true">Empresa<input name="company" tabindex="-1" autocomplete="off"></label>
        <button class="primary wide" type="submit">Quero acessar →</button>
        <p class="form-error" id="form-error" role="alert"></p>
      </form>
    </div>
  </div>
  <script src="/campaign.js"></script>
  </body></html>`;
}

export function renderContentPage(campaign, settings = {}) {
  const brand = resolveBrand(settings);
  return `<!doctype html><html lang="pt-BR"><head>${HEAD(campaign.title, brand.themeHref)}</head><body class="gate-body">
  <div class="gate-shell gate-shell--content">
    <div class="gate-card gate-card--content">
      <p class="eyebrow">${eyebrow(brand)}</p>
      <h1>${escapeHtml(campaign.title)}</h1>
      <div class="gate-content">${campaign.contentHtml}</div>
      ${brand.handle ? `<a class="gate-instagram" href="https://www.instagram.com/${encodeURIComponent(brand.handle)}/" target="_blank" rel="noopener">Seguir @${escapeHtml(brand.handle)} →</a>` : ""}
    </div>
  </div>
  </body></html>`;
}
