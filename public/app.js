import { createEditor, wireToolbar } from "/editor.js";
import { checkOnboarding } from "/onboarding.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const truncate = (value = "", length = 80) => value.length > length ? `${value.slice(0, length)}…` : value;
const contactLabel = (contact) => contact.username && contact.username !== "instagram" ? `@${contact.username}` : `Contato sem @ · ${contact.id.slice(-6)}`;
const state = { media: [], rules: [], filter: "REELS", selectedMedia: null, contacts: [], selectedContactId: null, moderation: [], campaigns: [], leads: [] };
const PIPELINE_STAGES = [["novo", "Novo"], ["contatado", "Contatado"], ["qualificado", "Qualificado"], ["cliente", "Cliente"], ["perdido", "Perdido"]];
let pipelineOrigin = "all";
let pipelineSearch = "";
let draggedPipelineKey = null;
let pipelineItemsCache = [];

function whatsappLink(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(`${dateStr}T23:59:59`) < new Date();
}

function scoreTier(score) {
  return score >= 70 ? "score-hot" : score >= 35 ? "score-warm" : "score-cold";
}
const campaignEditor = createEditor($("#campaign-editor"));
wireToolbar($("#editor-toolbar"), campaignEditor);

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )md_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function request(path, options) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a solicitação.");
  return data;
}

async function renderDashboard() {
  const dashboard = await request("/api/state");
  state.rules = dashboard.rules;
  checkOnboarding(dashboard.rules);
  const active = dashboard.rules.filter((rule) => rule.enabled).length;
  const sent = dashboard.activity.filter((event) => event.status === "sent").length;
  const handled = dashboard.activity.filter((event) => event.status !== "ignored").length;
  $("#active-count").textContent = active;
  $("#sent-count").textContent = sent;
  $("#response-rate").textContent = handled ? `${Math.round(sent / handled * 100)}%` : "—";
  $("#rule-total").textContent = `${dashboard.rules.length} ${dashboard.rules.length === 1 ? "regra" : "regras"}`;
  $("#connection").textContent = dashboard.configured ? "@eduardosantos.ia" : "configuração pendente";
  renderRules(dashboard.rules);
  renderActivity(dashboard.activity);
  renderKeywordSuggestions(dashboard.keywordSuggestions || []);
}

function renderKeywordSuggestions(suggestions) {
  $("#keyword-suggestions-total").textContent = `${suggestions.length} ${suggestions.length === 1 ? "sugestão" : "sugestões"}`;
  $("#keyword-suggestions-list").innerHTML = suggestions.length ? suggestions.map((item) => `<article class="rule">
    <div class="rule-icon">?</div><div><h3>${escapeHtml(truncate(item.sample, 60))}</h3><p>Comentado ${item.count} vezes sem nenhuma automação bater</p></div>
    <div class="rule-actions"><button class="edit-rule" data-suggest-keyword="${escapeHtml(item.text)}">Criar automação</button></div>
  </article>`).join("") : '<p class="empty">Nenhuma sugestão ainda — aparece quando um comentário se repete sem cair em nenhuma automação.</p>';
}

function renderRules(rules) {
  $("#rules").innerHTML = rules.length ? rules.map((rule) => `<article class="rule">
    <div class="rule-icon">${rule.followUpEnabled ? "⚡" : rule.mediaId ? "▣" : "↳"}</div><div><h3>${escapeHtml(rule.name)}${rule.followUpEnabled ? `<span class="delivery-badge">${rule.requireFollow ? "FOLLOW + LINK" : "LINK APÓS RESPOSTA"}</span>` : ""}</h3>
    <p>“${escapeHtml(rule.keyword)}” · ${rule.responseMode === "both" ? "pública + privada" : rule.responseMode === "private" ? "mensagem privada" : "resposta pública"}</p>
    <p>${rule.mediaId ? `Somente: ${escapeHtml(truncate(rule.mediaTitle || "Reel selecionado", 52))}` : "Todos os conteúdos"}</p><div class="journey-mini">${(rule.journey || []).map((step) => `<span title="${escapeHtml(step.summary)}">${escapeHtml(step.title)}</span>`).join("")}</div></div>
    <div class="rule-actions"><button class="edit-rule" data-edit="${rule.id}">Editar</button><button class="icon-btn ${rule.enabled ? "" : "off"}" data-toggle="${rule.id}" title="Ativar/desativar">●</button><button class="icon-btn" data-export="${rule.id}" title="Exportar pacote">⇩</button><button class="icon-btn" data-delete="${rule.id}" title="Excluir">×</button></div>
  </article>`).join("") : '<p class="empty">Nenhum fluxo ainda.<br>Escolha um Reel e crie a primeira palavra-chave.</p>';
}

function renderActivity(activity) {
  $("#activity").innerHTML = activity.length ? activity.slice(0, 8).map((event) => `<article class="event ${event.status}"><span class="dot"></span><div><strong>@${escapeHtml(event.username)}</strong><p>${escapeHtml(event.text)}</p><time>${new Date(event.at).toLocaleString("pt-BR")}</time></div></article>`).join("") : '<p class="empty">Os comentários processados aparecerão aqui.</p>';
}

async function loadMedia() {
  $("#media-grid").innerHTML = '<div class="media-loading">Sincronizando com @eduardosantos.ia…</div>';
  try {
    const result = await request("/api/media");
    state.media = result.media;
    renderMedia();
  } catch (error) {
    $("#media-grid").innerHTML = `<div class="media-error">${escapeHtml(error.message)}<br>Confira se o servidor foi reiniciado após a atualização.</div>`;
  }
}

async function loadContacts() {
  const result = await request("/api/contacts");
  state.contacts = result.contacts;
  renderContacts();
}

async function loadAnalytics() {
  const analytics = await request("/api/analytics");
  const stages = [
    ["Comentários capturados", analytics.total.captured], ["Primeiras DMs", analytics.total.dmSent],
    ["Respostas recebidas", analytics.total.replied], ["Materiais entregues", analytics.total.delivered]
  ];
  $("#funnel").innerHTML = stages.map(([label, value], index) => `<article><small>0${index + 1}</small><strong>${value}</strong><span>${label}</span>${index < stages.length - 1 ? '<i>→</i>' : ""}</article>`).join("");
  $("#analytics-period").textContent = `${analytics.total.deliveryRate}% de entrega`;
  $("#rule-metrics").innerHTML = analytics.rules.length ? analytics.rules.map((rule) => `<article><div><strong>${escapeHtml(rule.name)}</strong><small>${rule.enabled ? "ativa" : "pausada"}</small></div><span>${rule.captured} capturas</span><span>${rule.replied} respostas</span><b>${rule.deliveryRate}%</b></article>`).join("") : '<p class="empty">Crie uma automação para começar a medir o funil.</p>';
}

async function loadContentRoi() {
  const { items } = await request("/api/content-roi");
  $("#content-roi").innerHTML = items.length ? items.map((item) => `<article><div><strong>${escapeHtml(truncate(item.media?.caption || "Conteúdo removido", 60))}</strong><small>${item.media ? "" : `id: ${escapeHtml(item.mediaId)}`}</small></div><span>${item.total} ${item.total === 1 ? "contato" : "contatos"}</span><span>${item.byStage.cliente || 0} clientes</span><b>${item.conversionRate}%</b></article>`).join("") : '<p class="empty">Ainda não há contatos com origem em um conteúdo específico.</p>';
}

async function loadModeration() {
  $("#moderation-list").innerHTML = '<p class="empty">Sincronizando comentários...</p>';
  try { const result = await request("/api/moderation/comments"); state.moderation = result.comments; renderModeration(); }
  catch (error) { $("#moderation-list").innerHTML = `<div class="media-error">${escapeHtml(error.message)}</div>`; }
}

function renderModeration() {
  const query = $("#moderation-search").value.trim().toLowerCase();
  const filter = $("#moderation-filter").value;
  const comments = state.moderation.filter((comment) => (filter === "all" || (filter === "hidden") === Boolean(comment.hidden)) &&
    (!query || `${comment.text} ${comment.from?.username || ""}`.toLowerCase().includes(query))).slice(0, 100);
  $("#moderation-list").innerHTML = comments.length ? comments.map((comment) => `<article class="moderation-comment ${comment.hidden ? "is-hidden" : ""}" data-comment="${escapeHtml(comment.id)}"><img src="${escapeHtml(comment.mediaThumbnail)}" alt=""><div class="moderation-copy"><div><strong>@${escapeHtml(comment.from?.username || "instagram")}</strong><time>${comment.created_time ? new Date(comment.created_time).toLocaleString("pt-BR") : ""}</time></div><p>${escapeHtml(comment.text)}</p><small>${escapeHtml(truncate(comment.mediaCaption, 75))}</small><form class="comment-reply"><input name="message" maxlength="1000" required placeholder="Responder publicamente..."><button class="primary compact" type="submit">Responder</button></form></div><button class="hide-comment ${comment.hidden ? "active" : ""}" data-hide="${escapeHtml(comment.id)}">${comment.hidden ? "Restaurar" : "Ocultar"}</button></article>`).join("") : '<p class="empty">Nenhum comentário neste filtro.</p>';
}

function renderContacts(query = "") {
  const normalized = query.trim().toLowerCase();
  const contacts = state.contacts.filter((contact) => !normalized || [contact.username, ...(contact.tags || []), contact.history?.[0]?.text]
    .some((value) => String(value || "").toLowerCase().includes(normalized)));
  $("#contacts-list").innerHTML = contacts.length ? contacts.map((contact) => `<button class="contact-row ${contact.id === state.selectedContactId ? "active" : ""}" data-contact="${escapeHtml(contact.id)}"><span class="contact-avatar">${escapeHtml((contact.username && contact.username !== "instagram" ? contact.username : "IG").slice(0, 2).toUpperCase())}</span><span><strong>${escapeHtml(contactLabel(contact))}</strong><small>${escapeHtml(truncate(contact.history?.[0]?.text || "Interação registrada", 42))}</small></span><i>${contact.interactionCount}</i></button>`).join("") : '<p class="empty">Nenhum contato encontrado.</p>';
}

async function openContact(contactId) {
  const contact = await request(`/api/contacts/${contactId}`);
  state.selectedContactId = contactId;
  renderContacts($("#contact-search").value);
  const history = (contact.history || []).map((event) => `<article class="history-event ${event.type}"><span>${event.type === "comment" ? "COMENTÁRIO" : event.type === "postback" ? "BOTÃO" : event.type === "outgoing" ? "VOCÊ" : "DIRECT"}</span><p>${escapeHtml(event.text)}</p><time>${new Date(event.at).toLocaleString("pt-BR")}</time></article>`).join("");
  $("#contact-detail").innerHTML = `<div class="contact-title"><div><p class="eyebrow">CAIXA DE ENTRADA</p><h3>${escapeHtml(contactLabel(contact))}</h3></div><div class="contact-states"><span class="follow-state ${contact.follower ? "yes" : ""}">${contact.follower ? "✓ segue o perfil" : "status não verificado"}</span><button id="pause-contact" class="pause-button ${contact.automationPaused ? "paused" : ""}">${contact.automationPaused ? "▶ Retomar automação" : "Ⅱ Pausar automação"}</button></div></div><div class="tags">${(contact.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || '<small>Sem tags</small>'}</div><div class="history-list">${history || '<p class="empty">Sem histórico.</p>'}</div><form id="reply-form" class="reply-form"><textarea name="text" maxlength="1000" required placeholder="Escreva uma resposta manual..."></textarea><button class="primary compact" type="submit">Enviar Direct</button><small>Ao enviar, a automação desta pessoa será pausada.</small></form><form id="contact-form"><label>Tags separadas por vírgula<input name="tags" value="${escapeHtml((contact.tags || []).join(", "))}" placeholder="lead, material"></label><label>Nova nota<textarea name="note" placeholder="Ex.: pediu o guia de IA"></textarea></label><button class="primary compact" type="submit">Salvar contato</button></form>`;
  $("#pause-contact").addEventListener("click", async () => {
    await request(`/api/contacts/${contactId}/pause`, { method: "POST", body: JSON.stringify({ paused: !contact.automationPaused }) });
    await loadContacts(); await openContact(contactId);
  });
  $("#reply-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await request(`/api/contacts/${contactId}/messages`, { method: "POST", body: JSON.stringify({ text: form.get("text") }) });
    await loadContacts(); await openContact(contactId);
  });
  $("#contact-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request(`/api/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify({ tags: String(form.get("tags") || "").split(","), note: form.get("note") }) });
    await loadContacts();
    await openContact(contactId);
  });
}

async function loadCampaigns() {
  const result = await request("/api/campaigns");
  state.campaigns = result.campaigns;
  renderCampaigns();
}

function renderCampaigns() {
  $("#campaigns-list").innerHTML = state.campaigns.length ? state.campaigns.map((campaign) => `<article class="campaign-row">
    <div><h3>${escapeHtml(campaign.title)} <span class="campaign-status ${campaign.active ? "active" : "inactive"}">${campaign.active ? "ATIVA" : "PAUSADA"}</span></h3>
    <p><a href="/c/${escapeHtml(campaign.slug)}" target="_blank">manydudu.com/c/${escapeHtml(campaign.slug)}</a></p></div>
    <div class="rule-actions"><button class="edit-rule" data-edit-campaign="${escapeHtml(campaign.slug)}">Editar</button><button class="icon-btn" data-delete-campaign="${escapeHtml(campaign.slug)}" title="Excluir">×</button></div>
  </article>`).join("") : '<p class="empty">Nenhuma campanha ainda.<br>Crie uma para entregar conteúdo após capturar o lead.</p>';
}

function openCampaignDialog(campaign = null) {
  const form = $("#campaign-form");
  form.reset();
  form.dataset.slug = campaign?.slug || "";
  form.elements.title.value = campaign?.title || "";
  form.elements.slug.value = campaign?.slug || "";
  form.elements.slug.readOnly = Boolean(campaign);
  form.elements.slug.placeholder = campaign ? "" : "gerado a partir do título";
  form.elements.active.checked = campaign ? campaign.active : true;
  campaignEditor.setHtml(campaign?.contentHtml || "");
  $("#campaign-dialog-mode").textContent = campaign ? "EDITAR CAMPANHA" : "NOVA CAMPANHA";
  $("#save-campaign").textContent = campaign ? "Salvar alterações →" : "Criar campanha →";
  $("#campaign-form-error").textContent = "";
  $("#campaign-dialog").showModal();
}

async function loadLeads() {
  const result = await request("/api/leads");
  state.leads = result.leads;
  renderLeads();
}

function renderLeads() {
  $("#leads-total").textContent = `${state.leads.length} ${state.leads.length === 1 ? "lead" : "leads"}`;
  $("#leads-list").innerHTML = state.leads.length ? state.leads.map((lead) => `<article class="lead-row">
    <strong>${escapeHtml(lead.name)}</strong>
    <span>${escapeHtml(lead.whatsapp)} · ${escapeHtml(lead.email)} · campanha: ${escapeHtml(lead.campaignSlug)}</span>
    <span>${escapeHtml(lead.automationInterest)}</span>
    <div class="lead-niches">${lead.niches.map((niche) => `<span>${escapeHtml(niche === "Outro" && lead.nicheOther ? lead.nicheOther : niche)}</span>`).join("")}</div>
  </article>`).join("") : '<p class="empty">Nenhum lead capturado ainda.</p>';
}

const DM_EVENT_TYPES = new Set(["message", "postback", "outgoing"]);

function buildPipelineItems() {
  const contactItems = state.contacts
    .filter((contact) => (contact.history || []).some((event) => DM_EVENT_TYPES.has(event.type)))
    .map((contact) => ({
      key: `contact:${contact.id}`, kind: "contact", id: contact.id,
      label: contactLabel(contact),
      origin: "Instagram", originKey: "instagram",
      detail: contact.history.find((event) => DM_EVENT_TYPES.has(event.type))?.text || "Sem histórico ainda",
      stage: contact.stage || "novo",
      pipelineNote: contact.pipelineNote || "", nextActionAt: contact.nextActionAt || "",
      score: contact.score ?? 0,
      raw: contact,
    }));
  const leadItems = state.leads.map((lead) => {
    const campaign = state.campaigns.find((item) => item.slug === lead.campaignSlug);
    return {
      key: `lead:${lead.id}`, kind: "lead", id: lead.id,
      label: lead.name,
      origin: campaign?.title || lead.campaignSlug, originKey: lead.campaignSlug,
      detail: lead.automationInterest,
      stage: lead.stage || "novo",
      pipelineNote: lead.pipelineNote || "", nextActionAt: lead.nextActionAt || "",
      score: lead.score ?? 0,
      raw: lead,
    };
  });
  return [...contactItems, ...leadItems];
}

function renderPipelineFilters(items) {
  const origins = [["all", "Todas as origens"], ["instagram", "Instagram"]];
  const seen = new Set(["instagram"]);
  for (const item of items) {
    if (!seen.has(item.originKey)) { seen.add(item.originKey); origins.push([item.originKey, item.origin]); }
  }
  $("#pipeline-filters").innerHTML = origins.map(([key, label]) => `<button data-origin="${escapeHtml(key)}" class="${pipelineOrigin === key ? "active" : ""}">${escapeHtml(label)}</button>`).join("");
}

function renderPipelineBoard(items) {
  const query = pipelineSearch.trim().toLowerCase();
  const visible = items.filter((item) => (pipelineOrigin === "all" || item.originKey === pipelineOrigin) && (!query || item.label.toLowerCase().includes(query)));
  $("#pipeline-board").innerHTML = PIPELINE_STAGES.map(([key, label]) => {
    const cards = visible.filter((item) => item.stage === key);
    return `<div class="pipeline-column" data-stage="${key}">
      <div class="pipeline-column-head"><h3>${escapeHtml(label)}</h3><span>${cards.length}</span></div>
      <div class="pipeline-cards">${cards.length ? cards.map((item) => `<article class="pipeline-card" draggable="true" data-key="${escapeHtml(item.key)}">
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(truncate(item.detail || "", 60))}</small>
        <div class="card-badges"><span class="score-badge ${scoreTier(item.score)}" title="Score de lead quente">🔥 ${item.score}</span><span class="origin-badge">${escapeHtml(item.origin)}</span>${item.nextActionAt ? `<span class="next-action-badge ${isOverdue(item.nextActionAt) ? "overdue" : ""}">${new Date(`${item.nextActionAt}T00:00:00`).toLocaleDateString("pt-BR")}</span>` : ""}</div>
      </article>`).join("") : '<p class="empty">Vazio</p>'}</div>
    </div>`;
  }).join("");
}

function renderPipeline() {
  pipelineItemsCache = buildPipelineItems();
  renderPipelineFilters(pipelineItemsCache);
  renderPipelineBoard(pipelineItemsCache);
}

const HEALTH_LABELS = { ok: "Tudo certo", warn: "Atenção", critical: "Crítico" };

function setHealthField(prefix, label, statusKey) {
  $(`#health-${prefix}`).textContent = label;
  const dot = $(`#health-${prefix}-dot`);
  dot.className = `dot-${statusKey}`;
  dot.title = HEALTH_LABELS[statusKey] || statusKey;
}

async function loadHealth() {
  try {
    const report = await request("/api/health");
    setHealthField("token", report.token.daysLeft != null ? `${report.token.daysLeft} dias restantes` : report.token.configured ? "Validade desconhecida" : "Não configurado", report.token.status);
    setHealthField("webhook", report.webhook.configured ? "Configurado" : "Faltando credenciais", report.webhook.status);
    setHealthField("usage", report.apiUsage.percent != null ? `${report.apiUsage.percent}% de uso` : "Sem dados ainda", report.apiUsage.status);
    setHealthField("store", report.store.ok ? `${report.store.backend === "supabase" ? "Supabase" : "Arquivo local"} · ${report.store.latencyMs}ms` : `Erro: ${report.store.error}`, report.store.status);
  } catch (error) {
    ["token", "webhook", "usage", "store"].forEach((prefix) => setHealthField(prefix, "Erro ao carregar", "critical"));
  }
}

$("#health-refresh").addEventListener("click", loadHealth);
$("#backup-restore-btn").addEventListener("click", () => $("#backup-restore-input").click());
$("#backup-restore-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (!confirm("Isso substitui TODOS os dados atuais (automações, contatos, campanhas, leads) pelo conteúdo do arquivo. Continuar?")) return;
  try {
    const text = await file.text();
    await request("/api/backup/restore", { method: "POST", body: text });
    alert("Restaurado com sucesso. A página vai recarregar.");
    window.location.reload();
  } catch (error) {
    alert(error.message);
  }
});

let auditOffset = 0;
const AUDIT_PAGE_SIZE = 30;

async function loadAudit() {
  const status = $("#audit-status-filter").value;
  const params = new URLSearchParams({ limit: AUDIT_PAGE_SIZE, offset: auditOffset });
  if (status) params.set("status", status);
  const page = await request(`/api/activity?${params}`);
  $("#audit-total").textContent = `${page.total} eventos no total`;
  $("#audit-prev").disabled = auditOffset === 0;
  $("#audit-next").disabled = auditOffset + AUDIT_PAGE_SIZE >= page.total;
  $("#audit-list").innerHTML = page.items.length ? page.items.map((event) => `<article class="event ${escapeHtml(event.status || "")}">
    <span class="dot"></span>
    <div><strong>${escapeHtml(event.status || "—")}${event.reason ? ` · ${escapeHtml(event.reason)}` : ""}</strong>
    <p>${escapeHtml(truncate(event.text || event.rule || "", 90))}</p>
    <time>${event.at ? new Date(event.at).toLocaleString("pt-BR") : ""}</time>
    <details><summary>Ver evento bruto</summary><pre>${escapeHtml(JSON.stringify(event, null, 2))}</pre></details></div>
  </article>`).join("") : '<p class="empty">Nenhum evento nesse filtro.</p>';
}

$("#audit-refresh").addEventListener("click", () => { auditOffset = 0; loadAudit(); });
$("#audit-status-filter").addEventListener("change", () => { auditOffset = 0; loadAudit(); });
$("#audit-prev").addEventListener("click", () => { auditOffset = Math.max(0, auditOffset - AUDIT_PAGE_SIZE); loadAudit(); });
$("#audit-next").addEventListener("click", () => { auditOffset += AUDIT_PAGE_SIZE; loadAudit(); });

function openPipelineDetail(key) {
  const item = pipelineItemsCache.find((entry) => entry.key === key);
  if (!item) return;
  const whatsapp = item.kind === "lead" ? whatsappLink(item.raw.whatsapp)
    : item.raw.username && item.raw.username !== "instagram" ? `https://ig.me/m/${encodeURIComponent(item.raw.username)}` : null;
  const fields = item.kind === "lead"
    ? [["WhatsApp", escapeHtml(item.raw.whatsapp)], ["E-mail", `<a href="mailto:${escapeHtml(item.raw.email)}">${escapeHtml(item.raw.email)}</a>`], ["Campanha", escapeHtml(item.origin)], ["Capturado em", new Date(item.raw.createdAt).toLocaleString("pt-BR")]]
    : [["Instagram", escapeHtml(contactLabel(item.raw))], ["Segue o perfil", item.raw.follower ? "Sim" : "Não verificado"], ["Última interação", new Date(item.raw.lastInteractionAt).toLocaleString("pt-BR")]];
  const niches = item.kind === "lead" ? (item.raw.niches || []).map((niche) => niche === "Outro" && item.raw.nicheOther ? item.raw.nicheOther : niche) : [];
  const history = item.kind === "contact" ? (item.raw.history || []).slice(0, 15) : [];
  $("#pipeline-detail").innerHTML = `
    <div class="pipeline-detail-head"><span class="origin-badge">${escapeHtml(item.origin)}</span><span class="score-badge ${scoreTier(item.score)}" title="Score de lead quente">🔥 ${item.score}</span><h2>${escapeHtml(item.label)}</h2></div>
    <a id="whatsapp-action" href="${escapeHtml(whatsapp || "#")}" target="_blank" rel="noopener" ${whatsapp ? "" : "aria-disabled=\"true\" style=\"pointer-events:none;opacity:.4\""}>${item.kind === "lead" ? "Abrir no WhatsApp →" : "Abrir DM no Instagram →"}</a>
    <div class="pipeline-detail-fields">${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join("")}</div>
    ${niches.length ? `<div class="pipeline-detail-niches">${niches.map((niche) => `<span>${escapeHtml(niche)}</span>`).join("")}</div>` : ""}
    ${item.kind === "lead" ? `<p style="margin:-8px 0 16px;color:var(--muted);font-size:11px;line-height:1.5">${escapeHtml(item.raw.automationInterest)}</p>` : ""}
    ${history.length ? `<div class="pipeline-detail-history">${history.map((event) => `<article class="history-event ${event.type}"><span>${event.type === "comment" ? "COMENTÁRIO" : event.type === "postback" ? "BOTÃO" : event.type === "outgoing" ? "VOCÊ" : "DIRECT"}</span><p>${escapeHtml(event.text)}</p><time>${new Date(event.at).toLocaleString("pt-BR")}</time></article>`).join("")}</div>` : ""}
    <form id="pipeline-detail-form">
      <label>Estágio<select name="stage">${PIPELINE_STAGES.map(([key, label]) => `<option value="${key}" ${item.stage === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
      <label>Próxima ação (data)<input type="date" name="nextActionAt" value="${escapeHtml(item.nextActionAt || "")}"></label>
      <label>Nota<textarea name="pipelineNote" maxlength="500" placeholder="Ex.: ligar depois de amanhã, mandou dúvida sobre preço...">${escapeHtml(item.pipelineNote || "")}</textarea></label>
      <button class="primary wide" type="submit">Salvar →</button>
      <p class="form-error" id="pipeline-detail-error" role="alert"></p>
    </form>`;
  $("#pipeline-detail-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { stage: form.get("stage"), nextActionAt: form.get("nextActionAt") || "", pipelineNote: form.get("pipelineNote") || "" };
    try {
      await request(item.kind === "lead" ? `/api/leads/${item.id}` : `/api/contacts/${item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      Object.assign(item.raw, payload);
      $("#pipeline-dialog").close();
      renderPipeline();
    } catch (error) { $("#pipeline-detail-error").textContent = error.message; }
  });
  $("#pipeline-dialog").showModal();
}

function renderMedia() {
  const visible = state.filter === "ALL" ? state.media : state.media.filter((item) => item.media_product_type === state.filter);
  $("#media-grid").innerHTML = visible.length ? visible.map((item) => `<button class="media-card" data-media="${item.id}">
    <img src="${escapeHtml(item.thumbnail_url || item.media_url)}" alt="Capa do conteúdo" loading="lazy">
    <span class="media-type">${item.media_product_type === "REELS" ? "▶ REEL" : item.media_type}</span>
    <div class="media-meta"><strong>♡ ${Number(item.comments_count || 0).toLocaleString("pt-BR")}</strong><p>${escapeHtml(item.caption || "Sem legenda")}</p></div>
  </button>`).join("") : '<div class="media-loading">Nenhum conteúdo neste filtro.</div>';
}

async function openMedia(mediaId) {
  const media = state.media.find((item) => item.id === mediaId);
  if (!media) return;
  state.selectedMedia = media;
  $("#detail-title").textContent = `${Number(media.comments_count || 0).toLocaleString("pt-BR")} comentários`;
  $("#detail-preview").innerHTML = `<img src="${escapeHtml(media.thumbnail_url || media.media_url)}" alt="Capa do Reel"><div class="preview-caption">${escapeHtml(media.caption || "Sem legenda")}</div>`;
  $("#detail-comments").innerHTML = '<p class="empty">Buscando comentários…</p>';
  $("#media-dialog").showModal();
  try {
    const result = await request(`/api/media/${media.id}/comments`);
    $("#detail-comments").innerHTML = result.comments.length ? result.comments.map((comment) => `<article class="comment"><span class="comment-avatar">${escapeHtml((comment.from?.username || "IG").slice(0, 2).toUpperCase())}</span><div><strong>@${escapeHtml(comment.from?.username || "instagram")}</strong><p>${escapeHtml(comment.text)}</p><time>${comment.created_time ? new Date(comment.created_time).toLocaleString("pt-BR") : ""}</time></div></article>`).join("") : '<p class="empty">Este conteúdo ainda não tem comentários visíveis.</p>';
  } catch (error) {
    $("#detail-comments").innerHTML = `<div class="media-error">${escapeHtml(error.message)}</div>`;
  }
}

function openRuleDialog(media = null, rule = null) {
  const form = $("#rule-form");
  form.reset();
  form.dataset.ruleId = rule?.id || "";
  const scopedMedia = media || (rule?.mediaId ? { id: rule.mediaId, caption: rule.mediaTitle } : null);
  form.elements.mediaId.value = scopedMedia?.id || "";
  form.elements.mediaTitle.value = scopedMedia?.caption || "";
  $("#rule-scope strong").textContent = scopedMedia ? truncate(scopedMedia.caption || "Reel selecionado", 70) : "Todos os conteúdos";
  $("#rule-scope .scope-icon").textContent = scopedMedia ? "▣" : "◎";
  $("#clear-scope").hidden = !scopedMedia;
  for (const name of ["name", "keyword", "match", "reply", "responseMode", "followUpText", "followUpUrl", "followPrompt", "profileUrl", "followButtonTitle", "confirmFollowTitle", "deliveryStyle", "buttonTitle"]) {
    if (rule && form.elements[name]) form.elements[name].value = rule[name] ?? "";
  }
  form.elements.publicReplies.value = Array.isArray(rule?.publicReplies) ? rule.publicReplies.join("\n") : "";
  form.elements.followUpEnabled.checked = Boolean(rule?.followUpEnabled);
  form.elements.requireFollow.checked = Boolean(rule?.requireFollow);
  if (!rule) {
    form.elements.deliveryStyle.value = "button";
    form.elements.buttonTitle.value = "ACESSAR MATERIAL";
  }
  const hasDelivery = form.elements.followUpEnabled.checked;
  const requiresFollow = form.elements.requireFollow.checked;
  const usesButton = form.elements.deliveryStyle.value === "button";
  $("#delivery-fields").hidden = !hasDelivery;
  $("#follow-prompt-fields").hidden = !requiresFollow;
  $("#button-fields").hidden = !usesButton;
  form.elements.followUpText.required = hasDelivery;
  form.elements.followUpUrl.required = hasDelivery;
  form.elements.followPrompt.required = requiresFollow;
  form.elements.profileUrl.required = requiresFollow;
  form.elements.followButtonTitle.required = requiresFollow;
  form.elements.confirmFollowTitle.required = requiresFollow;
  form.elements.buttonTitle.required = usesButton;
  $("#rule-dialog-mode").textContent = rule ? "EDITAR AUTOMAÇÃO" : "NOVA AUTOMAÇÃO";
  $("#rule-dialog-title").textContent = rule ? "Ajuste seu fluxo" : "Quando alguém comentar...";
  $("#save-rule").textContent = rule ? "Salvar alterações →" : "Criar automação →";
  $("#form-error").textContent = "";
  $("#button-preview-label").textContent = form.elements.buttonTitle.value || "ACESSAR MATERIAL";
  syncResponseModeFields();
  syncPublicReplyCount();
  renderJourneyPreview();
  $("#media-dialog").close();
  $("#rule-dialog").showModal();
}

function renderJourneyPreview() {
  const form = $("#rule-form");
  const keyword = form.elements.keyword.value.trim() || "palavra-chave";
  const responseMode = form.elements.responseMode.value;
  const delivery = form.elements.followUpEnabled.checked;
  const steps = [["trigger", "Comentário", `Contém “${keyword}”`]];
  if (["public", "both"].includes(responseMode)) steps.push(["message", "Resposta pública", "Responder comentário"]);
  if (["private", "both"].includes(responseMode)) steps.push(["message", "Mensagem privada", "Enviar primeira DM"]);
  if (delivery) steps.push(["reply", "Confirmação", "Aguardar resposta no Direct"]);
  if (delivery && form.elements.requireFollow.checked) steps.push(["condition", "Segue o perfil?", "Verificar antes de entregar"]);
  if (delivery) steps.push(["delivery", "Entrega", form.elements.deliveryStyle.value === "button" ? "Botão com link" : "Link no texto"]);
  $("#journey-preview").innerHTML = steps.map(([type, title, summary], index) => `<article class="journey-node ${type}"><i>${index + 1}</i><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(summary)}</small></div></article>`).join('<span class="journey-arrow">→</span>');
}

function syncResponseModeFields() {
  const form = $("#rule-form");
  const mode = form.elements.responseMode.value;
  const combined = mode === "both";
  const publicOnly = mode === "public";
  $("#public-replies").hidden = !combined;
  form.elements.publicReplies.required = combined;
  $("#primary-reply-label").textContent = publicOnly ? "Resposta pública" : "Mensagem privada inicial";
  form.elements.followUpEnabled.disabled = publicOnly;
  form.elements.followUpEnabled.closest(".delivery-toggle").classList.toggle("is-disabled", publicOnly);
  if (publicOnly) {
    form.elements.followUpEnabled.checked = false;
    form.elements.requireFollow.checked = false;
    $("#delivery-fields").hidden = true;
    $("#follow-prompt-fields").hidden = true;
  }
}

function syncPublicReplyCount() {
  const field = $("#rule-form").elements.publicReplies;
  const count = field.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
  $("#public-reply-count").textContent = `${count}/10`;
  field.setCustomValidity(count > 10 ? "Use no máximo 10 respostas públicas, uma por linha." : "");
}

$("#new-rule").addEventListener("click", () => openRuleDialog());
$("#import-package").addEventListener("click", () => $("#import-package-input").click());
$("#import-package-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    await request("/api/automation-packages/import", { method: "POST", body: text });
    await renderDashboard();
  } catch (error) {
    alert(error.message);
  }
});
$("#keyword-suggestions-list").addEventListener("click", (event) => {
  const keyword = event.target.dataset.suggestKeyword;
  if (!keyword) return;
  openRuleDialog();
  const form = $("#rule-form");
  form.elements.keyword.value = keyword;
  form.elements.keyword.dispatchEvent(new Event("input", { bubbles: true }));
});
$("#automate-media").addEventListener("click", () => openRuleDialog(state.selectedMedia));
$("#clear-scope").addEventListener("click", () => {
  const form = $("#rule-form");
  form.elements.mediaId.value = "";
  form.elements.mediaTitle.value = "";
  $("#rule-scope strong").textContent = "Todos os conteúdos";
  $("#rule-scope .scope-icon").textContent = "◎";
  $("#clear-scope").hidden = true;
});
$("#rule-form").elements.followUpEnabled.addEventListener("change", (event) => {
  $("#delivery-fields").hidden = !event.target.checked;
  $("#rule-form").elements.followUpText.required = event.target.checked;
  $("#rule-form").elements.followUpUrl.required = event.target.checked;
  if (!event.target.checked) {
    $("#rule-form").elements.requireFollow.checked = false;
    $("#follow-prompt-fields").hidden = true;
    $("#rule-form").elements.followPrompt.required = false;
  }
});
$("#rule-form").elements.requireFollow.addEventListener("change", (event) => {
  $("#follow-prompt-fields").hidden = !event.target.checked;
  $("#rule-form").elements.followPrompt.required = event.target.checked;
  $("#rule-form").elements.profileUrl.required = event.target.checked;
  $("#rule-form").elements.followButtonTitle.required = event.target.checked;
  $("#rule-form").elements.confirmFollowTitle.required = event.target.checked;
});
$("#rule-form").elements.deliveryStyle.addEventListener("change", (event) => {
  const usesButton = event.target.value === "button";
  $("#button-fields").hidden = !usesButton;
  $("#rule-form").elements.buttonTitle.required = usesButton;
});
$("#rule-form").elements.buttonTitle.addEventListener("input", (event) => {
  $("#button-preview-label").textContent = event.target.value || "ACESSAR MATERIAL";
});
$("#rule-form").elements.responseMode.addEventListener("change", syncResponseModeFields);
$("#rule-form").elements.publicReplies.addEventListener("input", syncPublicReplyCount);
$("#rule-form").addEventListener("input", renderJourneyPreview);
$("#rule-form").addEventListener("change", renderJourneyPreview);
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
function switchView(view) {
  document.querySelectorAll(".view").forEach((el) => { el.hidden = el.id !== `view-${view}`; });
}
document.querySelectorAll("[data-scroll]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  switchView(button.dataset.view);
  $(`#${button.dataset.scroll}`).scrollIntoView({ behavior: "smooth" });
}));
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active"); state.filter = button.dataset.filter; renderMedia();
}));
$("#refresh-media").addEventListener("click", loadMedia);
$("#refresh-comments").addEventListener("click", loadModeration);
$("#moderation-search").addEventListener("input", renderModeration);
$("#moderation-filter").addEventListener("change", renderModeration);
$("#moderation-list").addEventListener("submit", async (event) => {
  if (!event.target.matches(".comment-reply")) return;
  event.preventDefault(); const card = event.target.closest("[data-comment]"); const form = new FormData(event.target);
  await request(`/api/moderation/comments/${card.dataset.comment}/reply`, { method: "POST", body: JSON.stringify({ message: form.get("message") }) });
  event.target.reset();
});
$("#moderation-list").addEventListener("click", async (event) => {
  const id = event.target.dataset.hide; if (!id) return;
  const comment = state.moderation.find((item) => item.id === id);
  await request(`/api/moderation/comments/${id}/hidden`, { method: "POST", body: JSON.stringify({ hidden: !comment.hidden }) });
  comment.hidden = !comment.hidden; renderModeration();
});
$("#contact-search").addEventListener("input", (event) => renderContacts(event.target.value));
$("#contacts-list").addEventListener("click", (event) => { const row = event.target.closest("[data-contact]"); if (row) openContact(row.dataset.contact); });
$("#media-grid").addEventListener("click", (event) => { const card = event.target.closest("[data-media]"); if (card) openMedia(card.dataset.media); });
$("#rule-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const ruleForm = event.currentTarget; const form = new FormData(ruleForm); $("#form-error").textContent = "";
  const payload = Object.fromEntries(form);
  payload.publicReplies = String(form.get("publicReplies") || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  payload.followUpEnabled = ruleForm.elements.followUpEnabled.checked;
  payload.requireFollow = ruleForm.elements.requireFollow.checked;
  const ruleId = ruleForm.dataset.ruleId;
  const path = ruleId ? `/api/rules/${ruleId}` : "/api/rules";
  try { await request(path, { method: ruleId ? "PATCH" : "POST", body: JSON.stringify(payload) }); ruleForm.reset(); delete ruleForm.dataset.ruleId; $("#rule-dialog").close(); await renderDashboard(); }
  catch (error) { $("#form-error").textContent = error.message; }
});
$("#rules").addEventListener("click", async (event) => {
  const edit = event.target.dataset.edit; const toggle = event.target.dataset.toggle; const remove = event.target.dataset.delete;
  if (edit) { const rule = state.rules.find((item) => item.id === edit); if (rule) openRuleDialog(null, rule); return; }
  const exportRuleId = event.target.dataset.export;
  if (exportRuleId) { window.open(`/api/rules/${exportRuleId}/export`, "_blank"); return; }
  if (toggle) await request(`/api/rules/${toggle}/toggle`, { method: "POST" });
  if (remove && confirm("Excluir esta automação?")) await request(`/api/rules/${remove}`, { method: "DELETE" });
  await renderDashboard();
});

$("#new-campaign").addEventListener("click", () => openCampaignDialog());
$("#campaigns-list").addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-campaign]")?.dataset.editCampaign;
  const remove = event.target.closest("[data-delete-campaign]")?.dataset.deleteCampaign;
  if (edit) { const campaign = state.campaigns.find((item) => item.slug === edit); if (campaign) openCampaignDialog(campaign); return; }
  if (remove && confirm("Excluir esta campanha? Os leads já capturados continuam salvos.")) {
    await request(`/api/campaigns/${remove}`, { method: "DELETE" });
    await loadCampaigns();
  }
});
$("#campaign-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $("#campaign-form-error").textContent = "";
  const payload = { title: form.elements.title.value, slug: form.elements.slug.value || undefined, active: form.elements.active.checked, contentHtml: campaignEditor.getHtml() };
  const slug = form.dataset.slug;
  try {
    await request(slug ? `/api/campaigns/${slug}` : "/api/campaigns", { method: slug ? "PATCH" : "POST", body: JSON.stringify(payload) });
    $("#campaign-dialog").close();
    await loadCampaigns();
  } catch (error) { $("#campaign-form-error").textContent = error.message; }
});
$("#logout").addEventListener("click", async () => { await request("/api/logout", { method: "POST" }); window.location.href = "/login.html"; });

$("#pipeline-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-origin]");
  if (!button) return;
  pipelineOrigin = button.dataset.origin;
  renderPipeline();
});
$("#pipeline-search").addEventListener("input", (event) => { pipelineSearch = event.target.value; renderPipelineBoard(pipelineItemsCache); });
$("#pipeline-board").addEventListener("click", (event) => {
  const card = event.target.closest(".pipeline-card");
  if (card) openPipelineDetail(card.dataset.key);
});
$("#pipeline-board").addEventListener("dragstart", (event) => {
  const card = event.target.closest(".pipeline-card");
  if (!card) return;
  draggedPipelineKey = card.dataset.key;
  card.classList.add("dragging");
});
$("#pipeline-board").addEventListener("dragend", (event) => {
  event.target.closest(".pipeline-card")?.classList.remove("dragging");
  draggedPipelineKey = null;
});
$("#pipeline-board").addEventListener("dragover", (event) => {
  const column = event.target.closest(".pipeline-column");
  if (!column) return;
  event.preventDefault();
  document.querySelectorAll(".pipeline-column").forEach((el) => el.classList.remove("drag-over"));
  column.classList.add("drag-over");
});
$("#pipeline-board").addEventListener("dragleave", (event) => {
  const column = event.target.closest(".pipeline-column");
  if (column && !column.contains(event.relatedTarget)) column.classList.remove("drag-over");
});
$("#pipeline-board").addEventListener("drop", async (event) => {
  const column = event.target.closest(".pipeline-column");
  document.querySelectorAll(".pipeline-column").forEach((el) => el.classList.remove("drag-over"));
  if (!column || !draggedPipelineKey) return;
  event.preventDefault();
  const stage = column.dataset.stage;
  const separatorIndex = draggedPipelineKey.indexOf(":");
  const kind = draggedPipelineKey.slice(0, separatorIndex);
  const id = draggedPipelineKey.slice(separatorIndex + 1);
  try {
    await request(kind === "contact" ? `/api/contacts/${id}` : `/api/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) });
    const record = (kind === "contact" ? state.contacts : state.leads).find((item) => item.id === id);
    if (record) record.stage = stage;
    renderPipeline();
  } catch (error) { alert(error.message); }
});

await Promise.all([renderDashboard(), loadMedia(), loadContacts(), loadAnalytics(), loadModeration(), loadCampaigns(), loadLeads(), loadHealth(), loadAudit(), loadContentRoi()]);
renderPipeline();
