import { escapeHtml } from "../util/html.js";
import { DEFAULT_INTEREST_LABEL, DEFAULT_NICHES } from "../domain/campaigns.js";

const HEAD = (title) => `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/campaign.css">`;

export function renderNotFound() {
  return `<!doctype html><html lang="pt-BR"><head>${HEAD("Conteúdo não encontrado")}</head><body class="gate-body">
  <div class="gate-shell"><div class="gate-card"><p class="eyebrow">EDUARDO SANTOS · @eduardosantos.ia</p>
  <h1>Esse conteúdo não está mais disponível.</h1><p class="gate-sub">Confira o link ou volte para o Instagram.</p></div></div>
  </body></html>`;
}

export function renderGatePage(campaign) {
  const niches = campaign.niches?.length ? campaign.niches : DEFAULT_NICHES;
  const interestLabel = campaign.interestLabel || DEFAULT_INTEREST_LABEL;
  return `<!doctype html><html lang="pt-BR"><head>${HEAD(campaign.title)}</head><body class="gate-body">
  <div class="gate-shell">
    <div class="gate-brand-pane"><p class="eyebrow">EDUARDO SANTOS</p><p class="gate-marketing">Automação que conversa,<br><em>conteúdo que entrega.</em></p><span class="gate-handle">@eduardosantos.ia</span></div>
    <div class="gate-card">
      <p class="eyebrow">EDUARDO SANTOS · @eduardosantos.ia</p>
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

export function renderContentPage(campaign) {
  return `<!doctype html><html lang="pt-BR"><head>${HEAD(campaign.title)}</head><body class="gate-body">
  <div class="gate-shell gate-shell--content">
    <div class="gate-card gate-card--content">
      <p class="eyebrow">EDUARDO SANTOS · @eduardosantos.ia</p>
      <h1>${escapeHtml(campaign.title)}</h1>
      <div class="gate-content">${campaign.contentHtml}</div>
      <a class="gate-instagram" href="https://www.instagram.com/eduardosantos.ia/" target="_blank" rel="noopener">Seguir @eduardosantos.ia →</a>
    </div>
  </div>
  </body></html>`;
}
