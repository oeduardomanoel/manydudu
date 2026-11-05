import { escapeHtml } from "../util/html.js";
import { DEFAULT_INTEREST_LABEL, DEFAULT_NICHES, isSafeCtaUrl } from "../domain/campaigns.js";

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

const DEFAULT_GATE_SUB = "Responda algumas perguntas rápidas e o conteúdo é liberado na hora.";

// O formulário vem inteiro no HTML (funciona sem JS); o /campaign.js transforma cada .gate-step
// numa tela, com barra de progresso — uma pergunta por vez no celular de quem chega pela DM.
export function renderGatePage(campaign, settings = {}, { preview = false } = {}) {
  const brand = resolveBrand(settings);
  const niches = campaign.niches?.length ? campaign.niches : DEFAULT_NICHES;
  const interestLabel = campaign.interestLabel || DEFAULT_INTEREST_LABEL;
  const benefits = Array.isArray(campaign.benefits) ? campaign.benefits.filter(Boolean) : [];
  return `<!doctype html><html lang="pt-BR"><head>${HEAD(campaign.title, brand.themeHref)}</head><body class="gate-body">
  <div class="gate-shell">
    <div class="gate-brand-pane"><p class="eyebrow">${escapeHtml(brand.name)}</p><p class="gate-marketing">${escapeHtml(brand.tagline)}</p>${brand.handle ? `<span class="gate-handle">@${escapeHtml(brand.handle)}</span>` : ""}</div>
    <div class="gate-card" id="gate-card">
      <div class="gate-intro">
        <p class="eyebrow">${eyebrow(brand)}</p>
        <h1>${escapeHtml(campaign.title)}</h1>
        <p class="gate-sub">${escapeHtml(campaign.subtitle || DEFAULT_GATE_SUB)}</p>
        ${benefits.length ? `<div class="gate-benefits"><p>O que você vai receber</p><ul>${benefits.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
      </div>
      <div class="gate-progress" id="gate-progress" hidden><div class="gate-progress-bar"><i></i></div><span aria-live="polite"></span></div>
      <form id="lead-form" class="gate-form"${preview ? ' data-preview="1"' : ""}>
        <div class="gate-step">
          <label for="lead-name">Como você se chama?</label>
          <input id="lead-name" name="name" required maxlength="120" autocomplete="name" autocapitalize="words" placeholder="Seu nome">
        </div>
        <div class="gate-step">
          <label for="lead-whatsapp">Qual o seu WhatsApp?</label>
          <input id="lead-whatsapp" name="whatsapp" type="tel" inputmode="tel" required maxlength="30" autocomplete="tel" placeholder="(11) 91234-5678">
          <small class="gate-help">Com DDD.</small>
        </div>
        <div class="gate-step">
          <label for="lead-email">E o seu melhor e-mail?</label>
          <input id="lead-email" name="email" type="email" inputmode="email" required maxlength="160" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="voce@email.com">
        </div>
        <fieldset class="gate-step gate-niches"><legend>Qual o seu nicho?</legend>
          <small class="gate-help">Pode marcar mais de um.</small>
          <div class="pill-group">${niches.map((niche) => `<label class="pill"><input type="checkbox" name="niches" value="${escapeHtml(niche)}"><span>${escapeHtml(niche)}</span></label>`).join("")}</div>
          <input name="nicheOther" class="niche-other" hidden maxlength="120" placeholder="Qual é o seu nicho?" aria-label="Qual é o seu nicho?">
        </fieldset>
        <div class="gate-step">
          <label for="lead-interest">${escapeHtml(interestLabel)}</label>
          <textarea id="lead-interest" name="automationInterest" required maxlength="600" placeholder="Escreva em poucas palavras"></textarea>
          <label class="gate-consent"><input type="checkbox" name="consent" required><span>Concordo em ser contatado(a) e que meus dados sejam usados pra esse fim.</span></label>
        </div>
        <input type="hidden" name="slug" value="${escapeHtml(campaign.slug)}">
        <label class="hp-field" aria-hidden="true">Empresa<input name="company" tabindex="-1" autocomplete="off"></label>
        <p class="form-error" id="form-error" role="alert"></p>
        <div class="gate-nav">
          <button class="gate-back" type="button" hidden>← Voltar</button>
          <button class="primary" type="submit">Quero acessar →</button>
        </div>
      </form>
    </div>
  </div>
  <script src="/campaign.js"></script>
  </body></html>`;
}

const stripTags = (html) => html.replace(/<[^>]*>/g, "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

// Os <h2> do conteúdo viram âncoras e, com 3 ou mais, um índice no topo — conteúdo longo
// (lista de prompts, passo a passo) fica navegável no celular.
function withTableOfContents(contentHtml) {
  const headings = [];
  const html = String(contentHtml ?? "").replace(/<h2>([\s\S]*?)<\/h2>/g, (match, inner) => {
    const text = stripTags(inner);
    if (!text) return match;
    headings.push(text);
    return `<h2 id="parte-${headings.length}">${inner}</h2>`;
  });
  const toc = headings.length >= 3
    ? `<nav class="gate-toc" aria-label="Nesta página"><p>Nesta página</p><ul>${headings.map((text, index) => `<li><a href="#parte-${index + 1}">${text}</a></li>`).join("")}</ul></nav>`
    : "";
  return { html, toc };
}

export function renderContentPage(campaign, settings = {}) {
  const brand = resolveBrand(settings);
  const { html, toc } = withTableOfContents(campaign.contentHtml);
  const cta = campaign.ctaLabel && isSafeCtaUrl(campaign.ctaUrl)
    ? `<a class="primary gate-cta" href="${escapeHtml(campaign.ctaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(campaign.ctaLabel)} →</a>` : "";
  const follow = brand.handle ? `<a class="gate-instagram" href="https://www.instagram.com/${encodeURIComponent(brand.handle)}/" target="_blank" rel="noopener">Seguir @${escapeHtml(brand.handle)} →</a>` : "";
  return `<!doctype html><html lang="pt-BR"><head>${HEAD(campaign.title, brand.themeHref)}</head><body class="gate-body">
  <div class="gate-shell gate-shell--content">
    <article class="gate-card gate-card--content">
      <p class="eyebrow">${eyebrow(brand)}</p>
      <span class="gate-unlocked">✓ Conteúdo liberado</span>
      <h1>${escapeHtml(campaign.title)}</h1>
      ${campaign.subtitle ? `<p class="gate-sub">${escapeHtml(campaign.subtitle)}</p>` : ""}
      ${toc}
      <div class="gate-content">${html}</div>
      ${cta || follow ? `<div class="gate-actions">${cta}${follow}</div>` : ""}
    </article>
  </div>
  <script src="/campaign.js"></script>
  </body></html>`;
}
