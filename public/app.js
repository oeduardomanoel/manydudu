import { createEditor, wireToolbar } from "/editor.js";
import { suggestReplies } from "/reply-suggestions.js";
import { checkOnboarding } from "/onboarding.js";
import "/carousel.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const truncate = (value = "", length = 80) => value.length > length ? `${value.slice(0, length)}…` : value;
const contactLabel = (contact) => contact.username ? `@${contact.username}` : `Perfil sem nome · ${contact.id.slice(-6)}`;
const initialsOf = (value) => (value || "IG").trim().slice(0, 2).toUpperCase();
// Só quem de fato conversou por Direct — comentário isolado (mesmo com resposta automática
// via outgoing_rule) não conta como contato de DM até a pessoa responder de volta.
const DM_EVENT_TYPES = new Set(["message", "postback", "outgoing"]);
const hasDmHistory = (contact) => (contact.history || []).some((event) => DM_EVENT_TYPES.has(event.type));
const THEME_FILES = { azul: "/theme-azul.css", verde: "/theme-verde.css", roxo: "/theme-roxo.css" };

function applyBranding(settings) {
  if (settings.brandName) {
    document.getElementById("page-title").textContent = `${settings.brandName} · Automação que conversa`;
    document.getElementById("brand-name").textContent = settings.brandName;
  }
  if (settings.brandLogoUrl) {
    let mark = document.getElementById("brand-mark");
    if (mark.tagName !== "IMG") {
      const img = document.createElement("img");
      img.id = "brand-mark"; img.className = "brand-mark"; img.alt = "";
      mark.replaceWith(img);
      mark = img;
    }
    mark.src = settings.brandLogoUrl;
  }
  document.getElementById("theme-link").href = THEME_FILES[settings.brandTemplate] || "/theme.css?v=4c370c8";
}
const state = { media: [], rules: [], filter: "REELS", selectedMedia: null, contacts: [], selectedContactId: null, moderation: [], campaigns: [], leads: [], settings: {} };
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
  $("#rule-total").textContent = `${active} de ${dashboard.rules.length} ${dashboard.rules.length === 1 ? "regra ativa" : "regras ativas"}`;
  $("#connection").textContent = dashboard.configured ? "Conectado ✓" : "configuração pendente";
  renderRules(dashboard.rules);
  state.activity = dashboard.activity;
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

// Cada evento do log vira uma frase de gente ("@ana recebeu o link de CRM") em vez do status técnico.
function describeEvent(event) {
  const who = event.username ? `<b>@${escapeHtml(event.username)}</b>` : "<b>alguém</b>";
  const rule = event.rule ? `<b>${escapeHtml(event.rule)}</b>` : "";
  const said = event.text ? `comentou “${escapeHtml(truncate(event.text, 60))}”` : "";
  switch (event.status) {
    case "sent": return ["out", "↗", `DM enviada pra ${who}`, [said, event.rule && `automação ${escapeHtml(event.rule)}`].filter(Boolean).join(" · ")];
    case "delivered": return ["ok", "✓", `${who} recebeu o link${rule ? ` de ${rule}` : ""}`, "depois de responder a DM"];
    case "waiting_follow": return ["wait", "◷", `${who} ainda não segue o perfil`, "pedido pra seguir enviado · aguardando"];
    case "public_failed": return ["bad", "!", `A resposta pública pra ${who} falhou`, event.error ? escapeHtml(truncate(event.error, 90)) : "a DM foi enviada normalmente"];
    case "failed": return ["bad", "!", `Falha ao responder ${who}`, escapeHtml(truncate(event.error || event.text || "", 90))];
    case "login_failed": return ["bad", "!", "Tentativa de login no painel recusada", event.user ? `usuário “${escapeHtml(event.user)}”` : ""];
    case "ignored":
      if (event.reason === "fatigue_guard") return ["muted", "↺", `Não reenviei pra ${who}`, "já recebeu essa mensagem nas últimas 24 h"];
      if (event.reason === "human_takeover") return ["muted", "‖", `Conversa com ${who} está com você`, "automação pausada pra esse contato"];
      return ["muted", "·", `${who} ${said || "comentou"}`, "nenhuma automação bateu com esse comentário"];
    default: return ["muted", "·", `${who}: ${escapeHtml(event.text || event.status)}`, ""];
  }
}

function renderActivity(activity) {
  // as respostas públicas da própria conta voltam pelo webhook como comentário "ignorado" — é só ruído aqui
  const ownHandle = (state.health?.token?.username || state.settings.brandHandle || "").toLowerCase();
  const events = activity.filter((event) => !(event.status === "ignored" && ownHandle && String(event.username || "").toLowerCase() === ownHandle));
  $("#activity").innerHTML = events.length ? events.slice(0, 7).map((event, index) => {
    const [tone, icon, title, detail] = describeEvent(event);
    const name = String(event.username || event.user || "?").replace(/^@/, "");
    const initials = name.replace(/[^a-zà-ú0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
    return `<article class="feed-event ${tone}" style="animation-delay:${index * 40}ms"><span class="feed-face" style="background:${faceGradient(name)}">${escapeHtml(initials)}<b>${icon}</b></span><div><p>${title}</p>${detail ? `<small>${detail}</small>` : ""}</div><time title="${escapeHtml(new Date(event.at).toLocaleString("pt-BR"))}">${relativeTime(event.at).replace(/^há /, "")}</time></article>`;
  }).join("") : '<p class="empty">Os comentários processados aparecerão aqui.</p>';
}

// cor estável por pessoa (mesmo @ = mesma cor), pra a lista não virar um bloco só
function faceGradient(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `linear-gradient(145deg,hsl(${hue} 70% 58%),hsl(${(hue + 30) % 360} 65% 26%))`;
}

async function loadMedia() {
  $("#media-grid").innerHTML = '<div class="media-loading">Sincronizando com o Instagram…</div>';
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
  // funil em barras: a largura mostra quanto sobra de cada etapa e o % é a passagem da etapa anterior
  const top = Math.max(1, stages[0][1]);
  $("#funnel").className = "funnel-bars";
  $("#funnel").innerHTML = stages.map(([label, value], index) => {
    const previous = index ? stages[index - 1][1] : null;
    const step = previous ? `${Math.round(value / previous * 100)}% da etapa anterior` : "ponto de partida";
    return `<div class="funnel-row"><span>${label}</span><div class="funnel-bar"><i style="width:${Math.max(value ? 2 : 0, Math.round(value / top * 100))}%"></i></div><b>${value.toLocaleString("pt-BR")}<em>${step}</em></b></div>`;
  }).join("");
  $("#analytics-period").textContent = `${analytics.total.deliveryRate}% de entrega`;
  renderKpis(analytics.kpis);
  $("#rule-metrics").innerHTML = analytics.rules.length ? analytics.rules.map((rule) => `<article><div><strong>${escapeHtml(rule.name)}</strong><small>${rule.enabled ? "ativa" : "pausada"}</small></div><span>${rule.captured} capturas</span><span>${rule.replied} respostas</span><b>${rule.deliveryRate}%</b></article>`).join("") : '<p class="empty">Crie uma automação para começar a medir o funil.</p>';
}

const ICONS = {
  dm: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  reply: '<path d="M9 17H5l-2 3V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5"/><path d="m14 18 2 2 5-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  lead: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11h5M19.5 8.5v5"/>',
  reel: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="m10.5 9 4 3-4 3z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
};
const chip = (name) => `<span class="ov-chip"><svg viewBox="0 0 24 24">${ICONS[name]}</svg></span>`;
const fmt = (value) => Number(value || 0).toLocaleString("pt-BR");

// curva suave com área embaixo — mesmo desenho dos cartões do mockup
function sparkline(series, { down = false, width = 96, height = 36 } = {}) {
  const max = Math.max(1, ...series);
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const points = series.map((value, index) => [index * step, height - 4 - value / max * (height - 10)]);
  let path = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]; const [x1, y1] = points[i]; const cx = (x0 + x1) / 2;
    path += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
  }
  const color = down ? "var(--danger)" : "var(--text)";
  const id = `sp${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".2"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${path} L${width} ${height} L0 ${height}Z" fill="url(#${id})"/><path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/><circle cx="${points.at(-1)[0]}" cy="${points.at(-1)[1]}" r="2.5" fill="${color}"/></svg>`;
}

function kpiDelta(value, previous, unit) {
  if (previous === null || previous === undefined || value === null) return { html: '<span class="ov-delta flat">novo</span>', note: "sem semana anterior pra comparar", down: false };
  const diff = unit === "pp" ? value - previous : previous ? Math.round((value - previous) / previous * 100) : null;
  if (diff === null) return { html: '<span class="ov-delta up">novo</span>', note: "nada na semana anterior", down: false };
  if (diff === 0) return { html: '<span class="ov-delta flat">= 0</span>', note: "igual à semana anterior", down: false };
  return { html: `<span class="ov-delta ${diff > 0 ? "up" : "down"}">${diff > 0 ? "↑" : "↓"} ${Math.abs(diff)}${unit === "pp" ? " p.p." : "%"}</span>`, note: "vs semana anterior", down: diff < 0 };
}

// os três cartões menores (últimos 7 dias); o cartão laranja do mês vem do /api/overview
function renderKpis(kpis) {
  if (!kpis) return;
  const cards = [["reply", "Taxa de resposta", kpis.responseRate, "pp"], ["link", "Links entregues", kpis.delivered, ""], ["lead", "Leads capturados", kpis.leads, ""]];
  $("#kpi-grid").innerHTML = cards.map(([icon, label, metric, unit]) => {
    const delta = kpiDelta(metric.value, metric.previous, unit);
    const value = metric.value === null ? "—" : unit === "pp" ? `${metric.value}<small>%</small>` : fmt(metric.value);
    return `<article class="ov-card ov-kpi"><span class="ov-kpi-label">${chip(icon)}${label}</span><strong>${value}</strong>
      <div class="ov-kpi-foot"><div>${delta.html}<em>${delta.note}</em></div>${sparkline(metric.series, { down: delta.down })}</div></article>`;
  }).join("");
  $("#kpis-coverage").textContent = kpis.complete ? "" : `Resposta, links e leads: últimos 7 dias. O log de atividade só guarda os eventos mais recentes, então resposta e links contam desde ${new Date(kpis.since).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}.`;
}

function relativeTime(iso) {
  if (!iso) return "nunca";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 48 * 60) return `há ${Math.round(minutes / 60)} h`;
  return `há ${Math.round(minutes / 1440)} dias`;
}

// Linha de saúde no topo da visão geral: o token morto de setembro passou semanas sem ninguém ver
// porque esse estado só existia na tela de Saúde.
function renderStatusStrip() {
  const report = state.health;
  const rows = [];
  if (report) {
    const { token, webhook } = report;
    const tokenText = !token.configured ? "não configurado" : token.expired ? "expirado — gere um novo" : token.valid === false ? "inválido" : token.daysLeft != null ? `${token.daysLeft} de 60 dias` : "válido";
    rows.push({ status: token.status, label: "Token do Instagram", text: tokenText, view: "health", meter: token.daysLeft != null ? Math.min(100, token.daysLeft / 60 * 100) : null });
    const silentHours = webhook.lastEventAt ? (Date.now() - Date.parse(webhook.lastEventAt)) / 3_600_000 : Infinity;
    rows.push({ status: !webhook.configured ? "critical" : silentHours > 48 ? "warn" : "ok", label: "Webhook", text: webhook.configured ? `último evento ${relativeTime(webhook.lastEventAt)}` : "faltando credenciais", view: "health" });
    rows.push({ status: report.store.status === "ok" && report.store.latencyMs > 700 ? "warn" : report.store.status, label: "Banco de dados", text: report.store.ok ? `${report.store.latencyMs} ms${report.store.latencyMs > 700 ? " · lento" : ""}` : report.store.error || "erro", view: "health" });
  }
  if (state.postsQuota?.total) rows.push({ status: state.postsQuota.used / state.postsQuota.total > .8 ? "warn" : "ok", label: "Cota de publicação", text: `${state.postsQuota.used} de ${state.postsQuota.total} em 24 h`, view: "publish", meter: state.postsQuota.used / state.postsQuota.total * 100 });
  $("#status-strip").innerHTML = rows.length ? rows.map((row) => `<button type="button" class="ov-health-row ${row.status === "ok" ? "" : row.status}" data-go-view="${row.view}"><i></i>${escapeHtml(row.label)}<span>${escapeHtml(row.text)}</span></button>${row.meter != null ? `<div class="ov-meter ${row.meter < 20 && row.label.startsWith("Token") ? "warn" : ""}"><i style="width:${Math.max(2, Math.round(row.meter))}%"></i></div>` : ""}`).join("") : '<p class="empty">Verificando…</p>';
  const healthStatus = report ? [report.token.status, report.webhook.status, report.store.status] : [];
  const dot = $("#nav-health-dot");
  dot.hidden = !report;
  dot.className = `nav-dot ${healthStatus.includes("critical") ? "critical" : healthStatus.includes("warn") ? "warn" : "ok"}`;
  renderNotices();
}

// Sino do topo: só o que pede uma ação sua agora.
function renderNotices() {
  const notices = [];
  const report = state.health;
  if (report?.token && (report.token.expired || report.token.valid === false)) notices.push(["critical", "!", "O token do Instagram parou de funcionar", "nenhuma automação responde até trocar", "health"]);
  else if (report?.token?.daysLeft != null && report.token.daysLeft < 10) notices.push(["warn", "!", `O token vence em ${report.token.daysLeft} dias`, "a renovação automática deve resolver — confira em Saúde", "health"]);
  const failed = (state.posts || []).filter((post) => post.status === "failed");
  if (failed.length) notices.push(["critical", "!", `${failed.length} Reel${failed.length > 1 ? "s" : ""} falhou ao publicar`, truncate(failed[0].caption || failed[0].fileName, 60), "publish"]);
  const waiting = state.overview?.waitingFollowToday || 0;
  if (waiting) notices.push(["warn", "…", `${waiting} pessoa${waiting > 1 ? "s" : ""} esperando seguir o perfil`, "hoje · o link sai quando seguirem", "dashboard"]);
  const untouched = (state.leads || []).filter((lead) => !lead.stage || lead.stage === "novo").length;
  if (untouched) notices.push(["ok", "+", `${untouched} lead${untouched > 1 ? "s" : ""} ainda sem contato`, "estágio Novo no pipeline", "pipeline"]);
  const colors = { critical: "var(--danger)", warn: "var(--yellow)", ok: "var(--green)" };
  $("#bell-list").innerHTML = notices.length ? notices.map(([tone, icon, title, detail, view]) => `<button type="button" class="top-notice" data-go-view="${view}"><i style="background:color-mix(in srgb,${colors[tone]} 14%,transparent);color:${colors[tone]}">${icon}</i><span>${escapeHtml(title)}<small>${escapeHtml(detail)}</small></span></button>`).join("") : '<p class="top-pop-empty">Nada pedindo sua atenção agora.</p>';
  $("#bell-count").hidden = !notices.length;
  $("#bell-count").textContent = notices.length;
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
  $("#moderation-list").innerHTML = comments.length ? comments.map((comment) => `<article class="moderation-comment ${comment.hidden ? "is-hidden" : ""}" data-comment="${escapeHtml(comment.id)}"><img src="${escapeHtml(comment.mediaThumbnail)}" alt=""><div class="moderation-copy"><div><strong>${comment.from?.username ? `@${escapeHtml(comment.from.username)}` : "Perfil sem nome"}</strong><time>${comment.created_time ? new Date(comment.created_time).toLocaleString("pt-BR") : ""}</time></div><p>${escapeHtml(comment.text)}</p><small>${escapeHtml(truncate(comment.mediaCaption, 75))}</small><form class="comment-reply"><input name="message" maxlength="1000" required placeholder="Responder publicamente..."><button class="primary compact" type="submit">Responder</button></form></div><button class="hide-comment ${comment.hidden ? "active" : ""}" data-hide="${escapeHtml(comment.id)}">${comment.hidden ? "Restaurar" : "Ocultar"}</button></article>`).join("") : '<p class="empty">Nenhum comentário neste filtro.</p>';
}

function renderContacts(query = "") {
  const normalized = query.trim().toLowerCase();
  const contacts = state.contacts.filter(hasDmHistory).filter((contact) => !normalized || [contact.username, ...(contact.tags || []), contact.history?.[0]?.text]
    .some((value) => String(value || "").toLowerCase().includes(normalized)));
  $("#contacts-list").innerHTML = contacts.length ? contacts.map((contact) => `<button class="contact-row ${contact.id === state.selectedContactId ? "active" : ""}" data-contact="${escapeHtml(contact.id)}"><span class="contact-avatar">${escapeHtml(initialsOf(contact.username))}</span><span><strong>${escapeHtml(contactLabel(contact))}</strong><small>${escapeHtml(truncate(contact.history?.[0]?.text || "Interação registrada", 42))}</small></span><i>${contact.interactionCount}</i></button>`).join("") : '<p class="empty">Nenhum contato entrou em contato pela DM ainda.</p>';
}

const OUTGOING_EVENT_TYPES = new Set(["outgoing", "outgoing_rule"]);
const BUBBLE_LABELS = { comment: "Comentário público", postback: "Botão", purchase: "Pagamento", outgoing: "Você", outgoing_rule: "Você" };

function bubbleHtml(event) {
  const isOut = OUTGOING_EVENT_TYPES.has(event.type);
  const isPurchase = event.type === "purchase";
  const cls = isPurchase ? "chat-bubble purchase" : isOut ? "chat-bubble out" : "chat-bubble in";
  return `<div class="${cls}"><span class="chat-bubble-meta">${BUBBLE_LABELS[event.type] || "Direct"}</span><p>${escapeHtml(event.text)}</p><time>${new Date(event.at).toLocaleString("pt-BR")}</time></div>`;
}

async function openContact(contactId) {
  const contact = await request(`/api/contacts/${contactId}`);
  state.selectedContactId = contactId;
  renderContacts($("#contact-search").value);
  const history = (contact.history || []).slice().reverse().map(bubbleHtml).join("");
  $("#contact-detail").innerHTML = `<div class="contact-title"><div><p class="eyebrow">CAIXA DE ENTRADA</p><h3>${escapeHtml(contactLabel(contact))}</h3></div><div class="contact-states"><span class="follow-state ${contact.follower ? "yes" : ""}">${contact.follower ? "✓ segue o perfil" : "status não verificado"}</span><button id="mark-paid-open" class="pause-button" type="button">💰 Marcar como pago</button><button id="pause-contact" class="pause-button ${contact.automationPaused ? "paused" : ""}">${contact.automationPaused ? "▶ Retomar automação" : "Ⅱ Pausar automação"}</button></div></div><div class="tags">${(contact.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || '<small>Sem tags</small>'}</div><div class="chat-thread" id="chat-thread">${history || '<p class="empty">Sem histórico.</p>'}</div><form id="reply-form" class="reply-form"><textarea name="text" maxlength="1000" required placeholder="Escreva uma resposta manual..."></textarea><button class="primary compact" type="submit">Enviar Direct</button><small>Ao enviar, a automação desta pessoa será pausada.</small></form><form id="contact-form"><label>Tags separadas por vírgula<input name="tags" value="${escapeHtml((contact.tags || []).join(", "))}" placeholder="lead, material"></label><label>Nova nota<textarea name="note" placeholder="Ex.: pediu o guia de IA"></textarea></label><button class="primary compact" type="submit">Salvar contato</button></form>`;
  const thread = $("#chat-thread"); thread.scrollTop = thread.scrollHeight;
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
  $("#mark-paid-open").addEventListener("click", () => openMarkPaidDialog(contactId, contactLabel(contact)));
}

function openMarkPaidDialog(contactId, label) {
  const form = $("#mark-paid-form");
  form.reset();
  form.dataset.contactId = contactId;
  $("#mark-paid-title").textContent = label;
  $("#mark-paid-error").textContent = "";
  $("#mark-paid-dialog").showModal();
}

$("#mark-paid-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const contactId = event.currentTarget.dataset.contactId;
  const value = Number(new FormData(event.currentTarget).get("value"));
  const errorEl = $("#mark-paid-error");
  errorEl.textContent = "";
  try {
    await request(`/api/contacts/${contactId}/mark-paid`, { method: "POST", body: JSON.stringify({ value, currency: "BRL" }) });
    $("#mark-paid-dialog").close();
    await openContact(contactId);
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

async function loadCampaigns() {
  const result = await request("/api/campaigns");
  state.campaigns = result.campaigns;
  renderCampaigns();
}

const campaignUrl = (slug) => `${window.location.origin}/c/${slug}`;
const campaignTitle = (slug) => state.campaigns.find((item) => item.slug === slug)?.title || slug;
const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "";
// mesma lista padrão do servidor (DEFAULT_NICHES) — sem o "Outro", que o servidor sempre acrescenta no fim
const DEFAULT_CAMPAIGN_NICHES = ["Estética", "Saúde e bem-estar", "Educação", "Imobiliário", "Coach / Mentoria", "E-commerce", "Serviços locais"];
let leadsFilter = "";
let campaignNiches = [];
let campaignPreviewView = "form";
let campaignPreviewTimer = null;

function renderCampaigns() {
  const leadCounts = state.leads.reduce((counts, lead) => counts.set(lead.campaignSlug, (counts.get(lead.campaignSlug) || 0) + 1), new Map());
  $("#campaigns-list").innerHTML = state.campaigns.length ? state.campaigns.map((campaign) => {
    const leads = leadCounts.get(campaign.slug) || 0;
    const visits = Number(campaign.visits) || 0;
    // visitas só começaram a ser contadas agora: lead antigo sem visita registrada não pode virar "conversão de 100%+"
    const conversion = visits >= leads && visits > 0 ? `${(leads / visits * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
    const slug = escapeHtml(campaign.slug);
    return `<article class="campaign-card${campaign.active ? "" : " paused"}">
    <div class="campaign-card-top"><div><h3>${escapeHtml(campaign.title)}</h3>
    <a href="/c/${slug}" target="_blank" rel="noopener">${escapeHtml(campaignUrl(campaign.slug).replace(/^https?:\/\//, ""))}</a></div>
    <span class="campaign-status ${campaign.active ? "active" : "inactive"}">${campaign.active ? "ATIVA" : "PAUSADA"}</span></div>
    <div class="campaign-stats"><div><span>Visitas</span><b>${visits.toLocaleString("pt-BR")}</b></div><div><span>Leads</span><b><button type="button" class="link-btn" data-campaign-leads="${slug}" title="Ver os leads dessa campanha">${leads}</button></b></div><div><span>Conversão</span><b class="accent">${conversion}</b></div></div>
    <div class="campaign-card-actions"><button class="edit-rule" data-copy-campaign="${slug}">Copiar link</button><button class="edit-rule" data-edit-campaign="${slug}">Editar</button><button class="icon-btn" data-delete-campaign="${slug}" title="Excluir">×</button><small>criada em ${escapeHtml(formatDate(campaign.createdAt))}</small></div>
  </article>`;
  }).join("") : '<p class="empty">Nenhuma campanha ainda.<br>Crie uma para entregar conteúdo após capturar o lead.</p>';
  renderLeadsFilter();
}

function renderNicheChips() {
  $("#niche-chip-list").innerHTML = campaignNiches.map((niche, index) => `<span class="chip">${escapeHtml(niche)}<button type="button" data-remove-niche="${index}" aria-label="Remover ${escapeHtml(niche)}">×</button></span>`).join("")
    + '<span class="chip chip-fixed" title="Sempre aparece no fim">Outro</span>';
}

function addNiches(raw) {
  for (const niche of String(raw).split(",").map((item) => item.trim().slice(0, 40)).filter(Boolean)) {
    if (niche.toLowerCase() === "outro" || campaignNiches.some((item) => item.toLowerCase() === niche.toLowerCase())) continue;
    if (campaignNiches.length >= 11) { $("#campaign-form-error").textContent = "Use no máximo 11 opções de nicho (mais o \"Outro\")."; break; }
    campaignNiches.push(niche);
  }
  renderNicheChips();
}

function switchCampaignTab(tab) {
  document.querySelectorAll("[data-campaign-tab]").forEach((button) => {
    const active = button.dataset.campaignTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-campaign-panel]").forEach((panel) => { panel.hidden = panel.dataset.campaignPanel !== tab; });
  // a prévia acompanha a aba: formulário mostra o formulário, entrega mostra a página final
  if (tab !== "basico") setCampaignPreviewView(tab === "entrega" ? "content" : "form");
}

function campaignPayload() {
  const form = $("#campaign-form");
  return {
    title: form.elements.title.value, slug: form.elements.slug.value || undefined, active: form.elements.active.checked,
    contentHtml: campaignEditor.getHtml(), interestLabel: form.elements.interestLabel.value, niches: campaignNiches,
    subtitle: form.elements.subtitle.value,
    benefits: form.elements.benefits.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    ctaLabel: form.elements.ctaLabel.value, ctaUrl: form.elements.ctaUrl.value,
  };
}

async function refreshCampaignPreview() {
  if (!$("#campaign-dialog").open) return;
  const status = $("#campaign-preview-status");
  try {
    const { html } = await request("/api/campaigns/preview", { method: "POST", body: JSON.stringify({ ...campaignPayload(), view: campaignPreviewView }) });
    $("#campaign-preview-frame").srcdoc = html;
    status.textContent = "";
  } catch (error) { status.textContent = `· ${error.message}`; }
}

function scheduleCampaignPreview() {
  clearTimeout(campaignPreviewTimer);
  campaignPreviewTimer = setTimeout(refreshCampaignPreview, 500);
}

function setCampaignPreviewView(view) {
  if (campaignPreviewView === view) return;
  campaignPreviewView = view;
  document.querySelectorAll("[data-preview-view]").forEach((button) => button.classList.toggle("active", button.dataset.previewView === view));
  scheduleCampaignPreview();
}

function openCampaignDialog(campaign = null) {
  const form = $("#campaign-form");
  form.reset();
  form.dataset.slug = campaign?.slug || "";
  form.elements.title.value = campaign?.title || "";
  form.elements.slug.value = campaign?.slug || "";
  form.elements.slug.readOnly = Boolean(campaign);
  form.elements.slug.placeholder = campaign ? "" : "gerado a partir do título";
  $("#campaign-slug-prefix").textContent = `${window.location.host}/c/`;
  form.elements.active.checked = campaign ? campaign.active : true;
  form.elements.subtitle.value = campaign?.subtitle || "";
  form.elements.benefits.value = (campaign?.benefits || []).join("\n");
  form.elements.interestLabel.value = campaign?.interestLabel || "";
  form.elements.ctaLabel.value = campaign?.ctaLabel || "";
  form.elements.ctaUrl.value = campaign?.ctaUrl || "";
  campaignNiches = (campaign?.niches?.length ? campaign.niches : DEFAULT_CAMPAIGN_NICHES).filter((niche) => niche.toLowerCase() !== "outro");
  renderNicheChips();
  campaignEditor.setHtml(campaign?.contentHtml || "");
  $("#campaign-dialog-mode").textContent = campaign ? "EDITAR CAMPANHA" : "NOVA CAMPANHA";
  $("#save-campaign").textContent = campaign ? "Salvar alterações →" : "Criar campanha →";
  $("#campaign-form-error").textContent = "";
  switchCampaignTab("basico");
  campaignPreviewView = "form";
  document.querySelectorAll("[data-preview-view]").forEach((button) => button.classList.toggle("active", button.dataset.previewView === "form"));
  $("#campaign-dialog").showModal();
  refreshCampaignPreview();
}

async function loadLeads() {
  const result = await request("/api/leads");
  state.leads = result.leads;
  renderLeads();
  renderCampaigns();
  // leads que ainda ninguém abordou — a próxima ação de quem vende
  const untouched = state.leads.filter((lead) => !lead.stage || lead.stage === "novo").length;
  $("#nav-badge-leads").hidden = !untouched;
  $("#nav-badge-leads").textContent = untouched;
  $("#nav-badge-leads").title = `${untouched} lead${untouched === 1 ? "" : "s"} ainda no estágio Novo`;
}

function renderLeadsFilter() {
  const select = $("#leads-filter");
  const slugs = [...new Set([...state.campaigns.map((campaign) => campaign.slug), ...state.leads.map((lead) => lead.campaignSlug)])];
  if (leadsFilter && !slugs.includes(leadsFilter)) leadsFilter = "";
  select.innerHTML = `<option value="">Todas as campanhas</option>${slugs.map((slug) => `<option value="${escapeHtml(slug)}">${escapeHtml(campaignTitle(slug))}</option>`).join("")}`;
  select.value = leadsFilter;
}

const filteredLeads = () => leadsFilter ? state.leads.filter((lead) => lead.campaignSlug === leadsFilter) : state.leads;

function renderLeads() {
  const leads = filteredLeads();
  $("#leads-total").textContent = `${leads.length} ${leads.length === 1 ? "lead" : "leads"}`;
  $("#leads-list").innerHTML = leads.length ? leads.map((lead) => {
    const whatsapp = whatsappLink(lead.whatsapp);
    return `<article class="lead-row">
    <div class="lead-row-head"><strong>${escapeHtml(lead.name)}</strong><time>${escapeHtml(formatDate(lead.createdAt))}</time></div>
    <span>${whatsapp ? `<a href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener">${escapeHtml(lead.whatsapp)}</a>` : escapeHtml(lead.whatsapp)} · ${escapeHtml(lead.email)} · ${escapeHtml(campaignTitle(lead.campaignSlug))}</span>
    <span>${escapeHtml(lead.automationInterest)}</span>
    <div class="lead-niches">${lead.niches.map((niche) => `<span>${escapeHtml(niche === "Outro" && lead.nicheOther ? lead.nicheOther : niche)}</span>`).join("")}</div>
  </article>`;
  }).join("") : `<p class="empty">${leadsFilter ? "Nenhum lead nessa campanha ainda." : "Nenhum lead capturado ainda."}</p>`;
}

// Excel em português abre ";" como separador de colunas; o BOM faz ele ler os acentos certo.
function exportLeadsCsv() {
  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = ["Data", "Nome", "WhatsApp", "E-mail", "Campanha", "Nicho", "Resposta", "Etapa"];
  const rows = filteredLeads().map((lead) => [
    lead.createdAt ? new Date(lead.createdAt).toLocaleString("pt-BR") : "", lead.name, lead.whatsapp, lead.email, campaignTitle(lead.campaignSlug),
    lead.niches.map((niche) => niche === "Outro" && lead.nicheOther ? lead.nicheOther : niche).join(", "), lead.automationInterest, lead.stage || "novo",
  ]);
  const csv = [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  link.download = `leads-${leadsFilter || "todas"}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function buildPipelineItems() {
  const contactItems = state.contacts
    .filter(hasDmHistory)
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
        <div class="pipeline-card-top">
          <span class="pipeline-card-avatar avatar-${item.kind}">${escapeHtml(item.kind === "lead" ? initialsOf(item.label) : initialsOf(item.raw.username))}</span>
          <strong>${escapeHtml(item.label)}</strong>
          <span class="score-badge ${scoreTier(item.score)}" title="Score de lead quente">🔥 ${item.score}</span>
        </div>
        <small>${escapeHtml(truncate(item.detail || "", 60))}</small>
        <div class="card-badges">${item.kind === "lead" ? `<span class="origin-badge">${escapeHtml(item.origin)}</span>` : ""}${item.nextActionAt ? `<span class="next-action-badge ${isOverdue(item.nextActionAt) ? "overdue" : ""}">${new Date(`${item.nextActionAt}T00:00:00`).toLocaleDateString("pt-BR")}</span>` : ""}</div>
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
    state.health = report;
    renderStatusStrip();
    renderTopbar();
    if (state.activity) renderActivity(state.activity);
    const { token } = report;
    const tokenLabel = !token.configured ? "Não configurado"
      : token.expired ? "Expirado — gere um novo"
      : token.valid === false ? "Inválido"
      : token.daysLeft != null ? `${token.daysLeft} dias restantes`
      : token.valid ? `Válido${token.username ? ` · @${token.username}` : ""}` : "Validade desconhecida";
    setHealthField("token", tokenLabel, token.status);
    $("#health-token").title = token.error || "";
    setHealthField("webhook", report.webhook.configured ? "Configurado" : "Faltando credenciais", report.webhook.status);
    setHealthField("usage", report.apiUsage.percent != null ? `${report.apiUsage.percent}% de uso` : "Sem dados ainda", report.apiUsage.status);
    setHealthField("store", report.store.ok ? `${report.store.backend === "supabase" ? "Supabase" : "Arquivo local"} · ${report.store.latencyMs}ms` : `Erro: ${report.store.error}`, report.store.status);
  } catch (error) {
    ["token", "webhook", "usage", "store"].forEach((prefix) => setHealthField(prefix, "Erro ao carregar", "critical"));
  }
}

async function loadWebhookSettings() {
  const settings = await request("/api/settings");
  state.settings = settings;
  $("#webhook-form").elements.outboundWebhookUrl.value = settings.outboundWebhookUrl || "";
  $("#capi-form").elements.metaPixelId.value = settings.metaPixelId || "";
  $("#capi-form").elements.metaCapiToken.value = settings.metaCapiToken || "";
  $("#brand-form").elements.brandName.value = settings.brandName || "";
  $("#brand-form").elements.brandHandle.value = settings.brandHandle || "";
  $("#brand-form").elements.brandTagline.value = settings.brandTagline || "";
  document.querySelectorAll("#brand-template-picker [data-template]").forEach((button) => {
    button.classList.toggle("active", (settings.brandTemplate || "laranja") === button.dataset.template);
  });
  if (settings.brandLogoUrl) $("#brand-logo-preview").src = settings.brandLogoUrl;
  applyBranding(settings);
  if (state.activity) renderActivity(state.activity);
  $("#goals-form").elements.dmDailyGoal.value = settings.dmDailyGoal || "";
  $("#goals-form").elements.leadMonthlyGoal.value = settings.leadMonthlyGoal || "";
  renderTopbar();
  if (state.overview) renderOverview();
}

$("#webhook-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#webhook-status");
  status.textContent = "";
  const url = event.currentTarget.elements.outboundWebhookUrl.value.trim();
  try {
    await request("/api/settings", { method: "PATCH", body: JSON.stringify({ outboundWebhookUrl: url }) });
    status.style.color = "var(--green)";
    status.textContent = "Salvo ✓";
  } catch (error) {
    status.style.color = "var(--danger)";
    status.textContent = error.message;
  }
});
$("#webhook-test").addEventListener("click", async () => {
  const status = $("#webhook-status");
  status.textContent = "Enviando...";
  status.style.color = "var(--muted)";
  try {
    await request("/api/settings/test-webhook", { method: "POST" });
    status.style.color = "var(--green)";
    status.textContent = "Recebido ✓";
  } catch (error) {
    status.style.color = "var(--danger)";
    status.textContent = error.message;
  }
});

$("#capi-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#capi-status");
  status.textContent = "";
  const { metaPixelId, metaCapiToken } = event.currentTarget.elements;
  try {
    await request("/api/settings", { method: "PATCH", body: JSON.stringify({ metaPixelId: metaPixelId.value.trim(), metaCapiToken: metaCapiToken.value.trim() }) });
    status.style.color = "var(--green)";
    status.textContent = "Salvo ✓";
  } catch (error) {
    status.style.color = "var(--danger)";
    status.textContent = error.message;
  }
});

let selectedBrandTemplate = "laranja";
let pendingBrandLogoUrl = null;
document.getElementById("brand-template-picker").addEventListener("click", (event) => {
  const button = event.target.closest("[data-template]");
  if (!button) return;
  selectedBrandTemplate = button.dataset.template;
  document.querySelectorAll("#brand-template-picker [data-template]").forEach((el) => el.classList.toggle("active", el === button));
});
$("#brand-logo-btn").addEventListener("click", () => $("#brand-logo-input").click());
$("#brand-logo-input").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 200_000) { $("#brand-status").textContent = "Logo muito grande — até 200KB."; event.target.value = ""; return; }
  const reader = new FileReader();
  reader.onload = () => { pendingBrandLogoUrl = reader.result; $("#brand-logo-preview").src = pendingBrandLogoUrl; };
  reader.readAsDataURL(file);
});
$("#brand-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#brand-status");
  status.textContent = "";
  const { brandName, brandHandle, brandTagline } = event.currentTarget.elements;
  const payload = { brandName: brandName.value.trim(), brandHandle: brandHandle.value.trim(), brandTagline: brandTagline.value.trim(), brandTemplate: selectedBrandTemplate };
  if (pendingBrandLogoUrl) payload.brandLogoUrl = pendingBrandLogoUrl;
  try {
    const saved = await request("/api/settings", { method: "PATCH", body: JSON.stringify(payload) });
    pendingBrandLogoUrl = null;
    state.settings = { ...state.settings, ...saved };
    applyBranding(saved);
    status.style.color = "var(--green)";
    status.textContent = "Salvo ✓";
  } catch (error) {
    status.style.color = "var(--danger)";
    status.textContent = error.message;
  }
});

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
    : item.raw.username ? `https://ig.me/m/${encodeURIComponent(item.raw.username)}` : null;
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
    ${history.length ? `<div class="pipeline-detail-history">${history.map((event) => `<article class="history-event ${OUTGOING_EVENT_TYPES.has(event.type) ? "outgoing" : ""}"><span>${event.type === "comment" ? "COMENTÁRIO" : event.type === "postback" ? "BOTÃO" : event.type === "purchase" ? "PAGAMENTO" : OUTGOING_EVENT_TYPES.has(event.type) ? "VOCÊ" : "DIRECT"}</span><p>${escapeHtml(event.text)}</p><time>${new Date(event.at).toLocaleString("pt-BR")}</time></article>`).join("")}</div>` : ""}
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
    $("#detail-comments").innerHTML = result.comments.length ? result.comments.map((comment) => `<article class="comment"><span class="comment-avatar">${escapeHtml(initialsOf(comment.from?.username))}</span><div><strong>${comment.from?.username ? `@${escapeHtml(comment.from.username)}` : "Perfil sem nome"}</strong><p>${escapeHtml(comment.text)}</p><time>${comment.created_time ? new Date(comment.created_time).toLocaleString("pt-BR") : ""}</time></div></article>`).join("") : '<p class="empty">Este conteúdo ainda não tem comentários visíveis.</p>';
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
  autoFilled.clear();
  suggestionSeed = 0;
  if (!rule) {
    // quase toda automação usa resposta pública + DM — começa por ela
    form.elements.responseMode.value = "both";
    form.elements.deliveryStyle.value = "button";
    form.elements.buttonTitle.value = "ACESSAR MATERIAL";
    const handle = state.settings.brandHandle;
    if (handle) {
      form.elements.profileUrl.value = `https://www.instagram.com/${handle}/`;
      form.elements.followPrompt.value = `Ainda falta um passo: siga @${handle} e depois toque em JÁ SEGUI ✨`;
    }
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

// Sugestões automáticas: só preenchem campo vazio ou que ainda tem o texto que elas mesmas
// colocaram — o que a pessoa escreveu à mão nunca é sobrescrito sem confirmação.
const autoFilled = new Map();
let suggestionSeed = 0;

function applyReplySuggestions({ force = false } = {}) {
  const form = $("#rule-form");
  const keyword = form.elements.keyword.value.trim();
  if (!keyword) return;
  const suggestions = suggestReplies(keyword, { followUp: form.elements.followUpEnabled.checked, seed: suggestionSeed });
  const values = { reply: suggestions.reply, publicReplies: suggestions.publicReplies.join("\n"), followUpText: suggestions.followUpText };
  const replaceable = (name) => !form.elements[name].value.trim() || form.elements[name].value === autoFilled.get(name);
  let names = Object.keys(values).filter(replaceable);
  if (force && !names.length) {
    if (!confirm("Você já escreveu as mensagens. Trocar todas pelas sugestões?")) return;
    names = Object.keys(values);
  }
  for (const name of names) {
    form.elements[name].value = values[name];
    autoFilled.set(name, values[name]);
  }
  syncPublicReplyCount();
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
$("#rule-form").elements.keyword.addEventListener("input", () => applyReplySuggestions());
$("#rule-form").elements.followUpEnabled.addEventListener("change", () => applyReplySuggestions());
$("#suggest-replies").addEventListener("click", () => {
  if (!$("#rule-form").elements.keyword.value.trim()) { $("#form-error").textContent = "Digite a palavra-chave primeiro."; return; }
  suggestionSeed += 1;
  applyReplySuggestions({ force: true });
});
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
  ($(`#${button.dataset.scroll}`) || $("#top")).scrollIntoView({ behavior: "smooth" });
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
async function resyncUsernames(button, statusEl) {
  button.disabled = true; statusEl.textContent = "Buscando nomes reais na API da Meta... pode levar um tempo.";
  try {
    const result = await request("/api/contacts/resync-usernames", { method: "POST" });
    statusEl.textContent = `${result.cleaned} nome(s) genérico(s) corrigido(s), ${result.resolved} de ${result.attempted} tentativa(s) resolvida(s) com nome real.`;
    await loadContacts();
    renderPipeline();
    if (state.selectedContactId) await openContact(state.selectedContactId);
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
$("#resync-usernames").addEventListener("click", (event) => resyncUsernames(event.currentTarget, $("#resync-status")));
$("#pipeline-resync-usernames").addEventListener("click", (event) => resyncUsernames(event.currentTarget, $("#pipeline-resync-status")));
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
  const copy = event.target.closest("[data-copy-campaign]");
  const showLeads = event.target.closest("[data-campaign-leads]")?.dataset.campaignLeads;
  if (edit) { const campaign = state.campaigns.find((item) => item.slug === edit); if (campaign) openCampaignDialog(campaign); return; }
  if (copy) {
    try { await navigator.clipboard.writeText(campaignUrl(copy.dataset.copyCampaign)); copy.textContent = "Copiado ✓"; }
    catch { window.prompt("Copie o link:", campaignUrl(copy.dataset.copyCampaign)); }
    setTimeout(() => { copy.textContent = "Copiar link"; }, 1800);
    return;
  }
  if (showLeads) { leadsFilter = showLeads; renderLeadsFilter(); renderLeads(); $("#leads").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (remove && confirm("Excluir esta campanha? Os leads já capturados continuam salvos.")) {
    await request(`/api/campaigns/${remove}`, { method: "DELETE" });
    await loadCampaigns();
  }
});
$("#leads-filter").addEventListener("change", (event) => { leadsFilter = event.target.value; renderLeads(); });
$("#export-leads").addEventListener("click", exportLeadsCsv);
document.querySelector(".campaign-tabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-campaign-tab]")?.dataset.campaignTab;
  if (tab) switchCampaignTab(tab);
});
document.querySelector(".preview-toggle").addEventListener("click", (event) => {
  const view = event.target.closest("[data-preview-view]")?.dataset.previewView;
  if (view) setCampaignPreviewView(view);
});
$("#niche-input").addEventListener("keydown", (event) => {
  const input = event.currentTarget;
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    if (input.value.trim()) { addNiches(input.value); input.value = ""; scheduleCampaignPreview(); }
  } else if (event.key === "Backspace" && !input.value && campaignNiches.length) {
    campaignNiches.pop(); renderNicheChips(); scheduleCampaignPreview();
  }
});
$("#niche-input").addEventListener("paste", (event) => {
  const text = event.clipboardData.getData("text/plain");
  if (!/[,\n]/.test(text)) return;
  event.preventDefault();
  addNiches(text.replace(/\r?\n/g, ","));
  scheduleCampaignPreview();
});
$("#niche-input").addEventListener("blur", (event) => {
  if (!event.currentTarget.value.trim()) return;
  addNiches(event.currentTarget.value); event.currentTarget.value = ""; scheduleCampaignPreview();
});
$("#niche-chips").addEventListener("click", (event) => {
  const index = event.target.closest("[data-remove-niche]")?.dataset.removeNiche;
  if (index !== undefined) { campaignNiches.splice(Number(index), 1); renderNicheChips(); scheduleCampaignPreview(); return; }
  $("#niche-input").focus();
});
$("#niche-defaults").addEventListener("click", () => { campaignNiches = [...DEFAULT_CAMPAIGN_NICHES]; renderNicheChips(); scheduleCampaignPreview(); });
// o editor fica dentro do form, então o "input" dele também chega aqui
$("#campaign-form").addEventListener("input", scheduleCampaignPreview);
// validação fica com o servidor: com abas, o navegador tentaria focar um campo obrigatório escondido e travaria o envio sem mensagem
$("#campaign-form").noValidate = true;
$("#campaign-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  $("#campaign-form-error").textContent = "";
  const pending = $("#niche-input").value.trim();
  if (pending) { addNiches(pending); $("#niche-input").value = ""; }
  const slug = form.dataset.slug;
  try {
    await request(slug ? `/api/campaigns/${slug}` : "/api/campaigns", { method: slug ? "PATCH" : "POST", body: JSON.stringify(campaignPayload()) });
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

// ── Visão geral (v3) ────────────────────────────────────────────────────────
const RULE_COLORS = ["var(--cyan)", "#ffc54f", "#6b95ff", "#b294ff", "#4fe0a0", "#ff7aa8"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
let overviewRange = "14d";
let overviewRule = "";

const parseDay = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d); };
const dayLabel = (day) => { const date = parseDay(day); return `${WEEKDAYS[date.getDay()]} ${date.getDate()}`; };
const shortDate = (day) => parseDay(day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function countUp(element, target, suffix = "") {
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / 1000);
    element.textContent = `${fmt(Math.round(target * (1 - Math.pow(1 - progress, 4))))}${suffix}`;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function loadOverview() {
  const params = new URLSearchParams({ range: overviewRange });
  if (overviewRule) params.set("rule", overviewRule);
  state.overview = await request(`/api/overview?${params}`);
  renderOverview();
}

function renderOverview() {
  const data = state.overview;
  if (!data) return;
  const hour = new Date().getHours();
  const firstName = String(state.settings.brandName || "").trim().split(/\s+/)[0];
  $("#ov-greeting").textContent = `${hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"}${firstName ? `, ${firstName}` : ""}`;
  renderOverviewSummary();

  // cartão do mês
  const { month, goals } = data;
  const monthGoal = goals.dmDaily ? goals.dmDaily * month.daysInMonth : 0;
  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const change = month.previousSent ? Math.round((month.sent - month.previousSent) / month.previousSent * 100) : null;
  $("#ov-kpi-month").innerHTML = `<span class="ov-kpi-label">${chip("dm")}DMs enviadas · ${monthName}</span>
    <strong id="ov-month-value">0</strong>
    <span class="ov-meta-line">${change === null ? (data.monthComplete ? '<span class="ov-delta">mês em curso</span>' : `<span class="ov-delta">parcial</span>contagem completa desde ${shortDate(data.trackedSince)}`) :`<span class="ov-delta">${change >= 0 ? "↑" : "↓"} ${Math.abs(change)}%</span>vs o mês passado no mesmo ponto`}</span>
    <div class="ov-progress"><i id="ov-month-progress"></i></div>
    <div class="ov-progress-labels">${monthGoal ? `<span>${Math.round(month.sent / monthGoal * 100)}% da meta</span><span>meta ${fmt(monthGoal)}</span>` : `<span>dia ${month.day} de ${month.daysInMonth}</span><button type="button" data-go-view="health" data-scroll-to="goals-section">definir meta</button>`}</div>`;
  countUp($("#ov-month-value"), month.sent);
  requestAnimationFrame(() => { $("#ov-month-progress").style.width = `${Math.min(100, monthGoal ? month.sent / monthGoal * 100 : month.day / month.daysInMonth * 100)}%`; });

  // resumo do dia na barra lateral
  const dayGoal = goals.dmDaily;
  $("#today-summary").textContent = dayGoal ? `${fmt(data.today.sent)} DMs · ${Math.round(data.today.sent / dayGoal * 100)}% da meta` : `${fmt(data.today.sent)} DMs enviadas`;
  $("#today-ring").style.strokeDashoffset = 100.5 * (1 - Math.min(1, dayGoal ? data.today.sent / dayGoal : data.today.sent ? 1 : 0));

  renderOverviewChart();
  renderOverviewRanking();
  renderOverviewGoal();
  renderOverviewQueue();
  renderNotices();
  const active = state.rules.filter((rule) => rule.enabled).length;
  $("#nav-badge-rules").hidden = !active;
  $("#nav-badge-rules").textContent = active;
}

// a fila de Reels chega por outra requisição — o resumo é redesenhado quando ela chegar
function renderOverviewSummary() {
  const data = state.overview;
  if (!data) return;
  const reelsToday = (state.posts || []).filter((post) => post.status === "scheduled" && new Date(post.scheduledAt).toDateString() === new Date().toDateString()).length;
  $("#ov-summary").innerHTML = [
    ["var(--cyan)", `${fmt(data.today.sent)} DM${data.today.sent === 1 ? "" : "s"}`, `enviada${data.today.sent === 1 ? "" : "s"} desde a meia-noite`],
    ["var(--yellow)", `${data.waitingFollowToday} pessoa${data.waitingFollowToday === 1 ? "" : "s"}`, "aguardando seguir"],
    ["#6b95ff", `${reelsToday} Reel${reelsToday === 1 ? "" : "s"}`, `agendado${reelsToday === 1 ? "" : "s"} pra hoje`],
  ].map(([color, strong, text]) => `<span><i style="background:${color}"></i><b>${strong}</b> ${text}</span>`).join("");
}

function renderOverviewChart() {
  const data = state.overview;
  const points = data.series;
  const weekly = data.range === "13w";
  // a meta é da conta inteira — com uma automação filtrada ela não serve de régua
  const target = data.goals.dmDaily && !overviewRule ? data.goals.dmDaily * (weekly ? 7 : 1) : 0;
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const best = points.reduce((top, point) => point.value > top.value ? point : top, points[0]);
  const hits = target ? points.filter((point) => point.value >= target).length : 0;
  const unit = weekly ? "semana" : "dia";
  $("#ov-chart-title-goal").textContent = target ? "contra a meta" : "por " + unit;
  $("#ov-chart-sub").innerHTML = overviewRule ? "Só a automação selecionada · a meta da conta não vale pra uma automação sozinha" : target ? `${overviewRule ? "Automação selecionada" : "Toda automação"} — <b style="color:var(--cyan);font-weight:500">laranja</b> quando o ${unit} bateu a meta` : `${overviewRule ? "Automação selecionada" : "Toda automação"} · defina uma meta pra ver quais ${unit}s bateram`;
  const filters = [`<button type="button" class="${overviewRule ? "" : "on"}" data-ov-rule="">Todas</button>`].concat(data.ranking.slice(0, 4).map((rule, index) => `<button type="button" class="${overviewRule === rule.id ? "on" : ""}" data-ov-rule="${escapeHtml(rule.id)}"><i style="background:${RULE_COLORS[index]}"></i>${escapeHtml(truncate(rule.name, 14))}</button>`));
  $("#ov-chart-stats").innerHTML = `<div><small>Enviadas</small><span class="big" id="ov-total">0</span></div>
    ${target ? `<div><small>Bateu a meta</small><b>${hits} <em>de ${points.length} ${unit}s</em></b></div><div><small><span class="dash"></span>Meta</small><b>${fmt(target)} <em>por ${unit}</em></b></div>` : overviewRule ? "" : `<div><small>Meta</small><button type="button" class="link" data-go-view="health" data-scroll-to="goals-section">definir meta</button></div>`}
    ${best?.value ? `<div><small>Melhor ${unit}</small><b>${fmt(best.value)} <em>· ${weekly ? `até ${shortDate(best.day)}` : dayLabel(best.day)}</em></b></div>` : ""}
    <div class="ov-filters">${filters.join("")}</div>`;
  countUp($("#ov-total"), total);
  const tracked = data.trackedSince;
  $("#ov-legend-note").textContent = tracked && tracked > points[0].day ? `contagem completa desde ${shortDate(tracked)} — antes disso os números são parciais` : "passe o mouse num ponto pra ver os detalhes";

  const svg = $("#ov-chart");
  if (!points.some((point) => point.value) && !target) {
    svg.innerHTML = "";
    svg.parentElement.querySelector(".ov-tip").classList.remove("show");
    svg.style.display = "none";
    if (!$("#ov-empty-chart")) svg.insertAdjacentHTML("afterend", '<div class="ov-empty-chart" id="ov-empty-chart">Nenhuma DM nesse período ainda.</div>');
    return;
  }
  svg.style.display = "";
  $("#ov-empty-chart")?.remove();
  const W = 900; const H = 280; const left = 44; const bottom = 30; const top = 16;
  const max = Math.max(10, Math.ceil(Math.max(...points.map((point) => point.value), target) * 1.18 / 10) * 10);
  const y = (value) => top + (H - bottom - top) * (1 - value / max);
  const step = (W - left - 70) / Math.max(1, points.length - 1);
  const every = points.length > 20 ? 3 : 1;
  let out = '<defs><linearGradient id="ov-ember" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="var(--blue)" stop-opacity=".15"/><stop offset=".6" stop-color="var(--blue)"/><stop offset="1" stop-color="var(--cyan)"/></linearGradient><linearGradient id="ov-grey" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#6c665f" stop-opacity=".1"/><stop offset="1" stop-color="#8b847d"/></linearGradient><filter id="ov-glow"><feGaussianBlur stdDeviation="3"/></filter></defs>';
  for (let i = 0; i <= 5; i += 1) {
    const value = max / 5 * i; const yy = y(value);
    out += `<line x1="${left}" x2="${W}" y1="${yy}" y2="${yy}" stroke="#ffffff0b"/><text x="0" y="${yy + 4}" fill="var(--quiet)" font-size="11" font-family="Sora">${fmt(Math.round(value))}</text>`;
  }
  if (target) {
    const ty = y(target);
    out += `<line x1="${left}" x2="${W}" y1="${ty}" y2="${ty}" stroke="var(--cyan)" stroke-opacity=".6" stroke-dasharray="5 6"/><rect x="${left - 4}" y="${ty - 11}" width="${Math.max(40, String(target).length * 8 + 16)}" height="22" rx="7" fill="var(--cyan)"/><text x="${left - 4 + Math.max(40, String(target).length * 8 + 16) / 2}" y="${ty + 4}" fill="#fff" font-size="11" font-weight="600" text-anchor="middle" font-family="Sora">${fmt(target)}</text>`;
  }
  points.forEach((point, i) => {
    const x = left + 26 + i * step; const yy = y(point.value); const current = i === points.length - 1;
    const hit = target ? point.value >= target : point.value > 0;
    const width = hit || current ? 5 : 3.5;
    const delay = (i * (points.length > 20 ? .015 : .035)).toFixed(3);
    out += `<rect class="col-hit" data-i="${i}" data-y="${yy}" x="${x - step / 2}" y="${top}" width="${step}" height="${H - bottom - top}" rx="10"/>`;
    if (point.value) out += `<rect class="stem" style="animation-delay:${delay}s" x="${x - width / 2}" y="${yy}" width="${width}" height="${H - bottom - yy}" rx="${width / 2}" fill="${current ? "#fff" : hit ? "url(#ov-ember)" : "url(#ov-grey)"}" pointer-events="none"/>`;
    if (hit && !current && point.value) out += `<circle cx="${x}" cy="${yy}" r="9" fill="var(--cyan)" opacity=".4" filter="url(#ov-glow)" pointer-events="none"/>`;
    out += `<circle class="dot" style="animation-delay:${(Number(delay) + .35).toFixed(3)}s" cx="${x}" cy="${yy}" r="${current ? 7 : point.value ? 6 : 3}" fill="${current ? "#fff" : hit ? "var(--cyan)" : "#8b847d"}" stroke="${current ? "#ffffff44" : "none"}" stroke-width="${current ? 8 : 0}" pointer-events="none"/>`;
    if (i % every === 0 || current) out += `<text x="${x}" y="${H - 9}" fill="${current ? "var(--cyan)" : "var(--muted)"}" font-weight="${current ? 600 : 400}" font-size="11" text-anchor="middle" font-family="Sora">${weekly ? shortDate(point.day) : current && !weekly ? "Hoje" : dayLabel(point.day)}</text>`;
  });
  svg.innerHTML = out;
}

function showOverviewTip(event) {
  const hit = event.target.closest(".col-hit");
  const tip = $("#ov-tip");
  if (!hit || !state.overview) { tip.classList.remove("show"); return; }
  const data = state.overview; const point = data.series[Number(hit.dataset.i)];
  const weekly = data.range === "13w";
  // a meta é da conta inteira — com uma automação filtrada ela não serve de régua
  const target = data.goals.dmDaily && !overviewRule ? data.goals.dmDaily * (weekly ? 7 : 1) : 0;
  const rule = overviewRule ? data.rules.find((item) => item.id === overviewRule) : null;
  const title = weekly ? `${shortDate(point.start)} a ${shortDate(point.day)}` : `${dayLabel(point.day)}${Number(hit.dataset.i) === data.series.length - 1 ? " · hoje" : ""}`;
  const diff = point.value - target;
  tip.innerHTML = `<strong>${title}<span>${fmt(point.value)} DMs</span></strong>${rule ? `<div><i style="background:var(--cyan)"></i>${escapeHtml(rule.name)}<b>${fmt(point.value)}</b></div>` : ""}${target ? `<div class="verdict" style="color:${diff >= 0 ? "var(--green)" : "var(--muted)"}">${diff >= 0 ? `${fmt(diff)} acima da meta` : `${fmt(-diff)} abaixo da meta`}</div>` : ""}`;
  tip.classList.add("show");
  const wrap = $("#ov-chart-wrap").getBoundingClientRect(); const box = hit.getBoundingClientRect();
  const dotY = Number(hit.dataset.y) * wrap.height / 280;
  const above = dotY - tip.offsetHeight - 16;
  tip.style.left = `${Math.min(wrap.width - tip.offsetWidth / 2, Math.max(tip.offsetWidth / 2, box.left - wrap.left + box.width / 2))}px`;
  tip.style.top = `${above >= 0 ? above : dotY + 18}px`;
}

function renderOverviewRanking() {
  const ranking = state.overview.ranking;
  $("#ov-rank").innerHTML = ranking.length ? ranking.map((rule, index) => {
    const color = RULE_COLORS[index % RULE_COLORS.length];
    const max = Math.max(1, ...rule.series); const step = 76 / (rule.series.length - 1);
    const points = rule.series.map((value, i) => `${(i * step).toFixed(1)},${(24 - value / max * 20).toFixed(1)}`).join(" ");
    const tag = String(rule.keyword || rule.name).replace(/[^a-zà-ú0-9]/gi, "").slice(0, 3).toUpperCase() || "—";
    return `<button type="button" class="ov-rank-row" data-edit="${escapeHtml(rule.id)}" title="Editar automação"><span class="kw" style="background:color-mix(in srgb,${color} 14%,transparent);color:${color}">${escapeHtml(tag)}</span><span class="name"><span>${escapeHtml(rule.name)}</span><small>palavra “${escapeHtml(rule.keyword)}”</small></span><svg viewBox="0 0 76 26"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg><b>${fmt(rule.sent)}</b></button>`;
  }).join("") : '<p class="empty">Nenhuma automação mandou DM nos últimos 14 dias.</p>';
}

function renderOverviewGoal() {
  const { month, goals } = state.overview;
  const card = $("#ov-goal");
  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const head = `<div class="ov-card-head"><span class="q">${chip("target")}<h2>Meta de leads · ${monthName}</h2></span><button type="button" class="ov-round" data-go-view="health" data-scroll-to="goals-section" title="Ajustar meta"><svg viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></svg></button></div>`;
  if (!goals.leadMonthly) {
    card.innerHTML = `${head}<div class="ov-goal-empty">${fmt(month.leads)} lead${month.leads === 1 ? "" : "s"} neste mês. Defina uma meta mensal pra acompanhar o ritmo.<br><button type="button" class="ov-btn" data-go-view="health" data-scroll-to="goals-section">Definir meta de leads</button></div>`;
    return;
  }
  const pct = Math.min(1, month.leads / goals.leadMonthly);
  const pace = Math.round(month.leads / month.day * month.daysInMonth);
  const left = Math.max(0, goals.leadMonthly - month.leads);
  const daysLeft = Math.max(1, month.daysInMonth - month.day);
  const ticks = 64; const done = Math.round(ticks * pct);
  let gauge = "";
  for (let i = 0; i < ticks; i += 1) {
    const angle = (-215 + i * (250 / (ticks - 1))) * Math.PI / 180; const r1 = 56; const r2 = i < done ? 70 : 65;
    gauge += `<line data-on="${i < done}" style="transition:stroke .3s ${i * 18}ms" x1="${75 + r1 * Math.cos(angle)}" y1="${75 + r1 * Math.sin(angle)}" x2="${75 + r2 * Math.cos(angle)}" y2="${75 + r2 * Math.sin(angle)}" stroke="#ffffff1c" stroke-width="3" stroke-linecap="round"/>`;
  }
  gauge += `<text x="75" y="80" fill="var(--text)" font-size="30" font-weight="500" text-anchor="middle" font-family="Sora">${Math.round(pct * 100)}%</text><text x="75" y="100" fill="var(--muted)" font-size="10" text-anchor="middle" font-family="Sora">${fmt(month.leads)} de ${fmt(goals.leadMonthly)} leads</text>`;
  card.innerHTML = `${head}<div class="ov-goal"><svg viewBox="0 0 150 150">${gauge}</svg><div class="ov-goal-side"><div><small>No ritmo pra</small><b class="acc">${fmt(pace)} leads</b></div><div><small>Faltam</small><b>${fmt(left)}</b></div><div><small>Por dia, daqui pra frente</small><b>${(left / daysLeft).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b></div></div></div>`;
  requestAnimationFrame(() => setTimeout(() => card.querySelectorAll('[data-on="true"]').forEach((line) => line.setAttribute("stroke", "var(--cyan)")), 120));
}

let queueTimer = null;
function renderOverviewQueue() {
  const card = $("#ov-queue");
  if (!card) return;
  const posts = state.posts || [];
  const upcoming = posts.filter((post) => post.status === "scheduled").sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const failed = posts.filter((post) => post.status === "failed").length;
  const head = `<div class="ov-card-head"><span class="q">${chip("reel")}<h2>Fila de Reels</h2></span><button type="button" class="ov-round" data-go-view="publish" title="Abrir Publicar"><svg viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></svg></button></div>`;
  const play = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const next = upcoming[0];
  clearInterval(queueTimer);
  card.innerHTML = `${head}${next ? `<div class="ov-next"><div class="ov-reel">${play}</div><div><small>Próximo a sair</small><span class="ov-when">${escapeHtml(formatDateTime(next.scheduledAt))}${next.kind === "trial" ? "<em>Trial</em>" : ""}</span><div class="ov-countdown" id="ov-countdown"></div><p>${escapeHtml(truncate(next.caption || next.fileName, 110))}</p></div></div>
    ${upcoming.length > 1 ? `<div class="ov-upcoming">${upcoming.slice(1, 3).map((post, index) => `<div><span class="ov-reel ${index ? "alt2" : "alt"}"></span><span>${escapeHtml(truncate(post.caption || post.fileName, 42))}<small>${escapeHtml(formatDateTime(post.scheduledAt))}</small></span></div>`).join("")}</div>` : ""}`
    : '<p class="ov-queue-empty">Nenhum Reel agendado. Agende o próximo e acompanhe a contagem aqui.</p>'}
    <button type="button" class="ov-wide" data-go-view="publish"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Publicar Reel</button>
    ${failed ? `<button type="button" class="ov-warn" data-go-view="publish">${failed} Reel${failed > 1 ? "s" : ""} falhou — tentar de novo</button>` : ""}`;
  if (next) {
    const tick = () => {
      const box = $("#ov-countdown");
      if (!box) return clearInterval(queueTimer);
      const remaining = Math.max(0, Math.floor((Date.parse(next.scheduledAt) - Date.now()) / 1000));
      const d = Math.floor(remaining / 86400); const h = Math.floor(remaining % 86400 / 3600); const m = Math.floor(remaining % 3600 / 60); const s = remaining % 60;
      const parts = d ? [[d, "d"], [h, "h"], [m, "min"]] : [[h, "h"], [String(m).padStart(2, "0"), "min"], [String(s).padStart(2, "0"), "s"]];
      box.innerHTML = remaining ? parts.map(([value, unit]) => `<span>${value}<small>${unit}</small></span>`).join("") : "<span>saindo agora</span>";
    };
    tick();
    queueTimer = setInterval(tick, 1000);
  }
}

// topo: data, usuário, avisos, menu recolhível e paleta de comandos
function renderTopbar() {
  $("#top-date").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase());
  const name = state.settings.brandName || "Meu Instagram";
  const handle = state.health?.token?.username || state.settings.brandHandle || "";
  $("#top-user-name").textContent = name;
  $("#brand-handle").textContent = handle ? `@${handle}` : "";
  $("#top-avatar").innerHTML = state.settings.brandLogoUrl ? `<img src="${escapeHtml(state.settings.brandLogoUrl)}" alt="">` : escapeHtml(name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase());
}

function goToView(view, scrollTo) {
  const button = document.querySelector(`nav button[data-view="${view}"]`);
  if (button) button.click();
  if (scrollTo) setTimeout(() => $(`#${scrollTo}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

const COMMANDS = () => [
  ["AÇÕES", "Nova automação", "N", () => openRuleDialog()],
  ["AÇÕES", "Publicar ou agendar Reel", "", () => goToView("publish")],
  ["AÇÕES", "Nova campanha", "", () => { goToView("campaigns"); openCampaignDialog(); }],
  ["AÇÕES", "Definir metas", "", () => goToView("health", "goals-section")],
  ...[...document.querySelectorAll("aside nav button")].map((button) => ["IR PARA", button.querySelector("span")?.textContent || "", "", () => button.click()]),
  ...state.rules.slice(0, 40).map((rule) => ["AUTOMAÇÕES", `${rule.name} · “${rule.keyword}”`, rule.enabled ? "" : "pausada", () => openRuleDialog(null, rule)]),
  ...(state.contacts || []).filter((contact) => contact.username).slice(0, 200).map((contact) => ["CONTATOS", `@${contact.username}`, contact.stage || "", () => { goToView("inbox"); }]),
  ...(state.leads || []).slice(0, 100).map((lead) => ["LEADS", lead.name, campaignTitle(lead.campaignSlug), () => { leadsFilter = lead.campaignSlug; goToView("campaigns", "leads"); renderLeadsFilter(); renderLeads(); }]),
];
let cmdkItems = [];
let cmdkIndex = 0;
function renderCmdk(query = "") {
  const q = query.trim().toLowerCase();
  cmdkItems = COMMANDS().filter(([, label]) => label && (!q || label.toLowerCase().includes(q))).slice(0, q ? 40 : 12);
  cmdkIndex = 0;
  let group = "";
  $("#cmdk-list").innerHTML = cmdkItems.length ? cmdkItems.map(([section, label, hint], index) => `${section !== group ? `<h5>${(group = section)}</h5>` : ""}<button type="button" class="cmdk-item${index ? "" : " sel"}" data-cmd="${index}">${escapeHtml(label)}${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</button>`).join("") : '<p class="cmdk-empty">Nada encontrado.</p>';
}
function openCmdk() { renderCmdk(); $("#cmdk").hidden = false; $("#cmdk-q").value = ""; setTimeout(() => $("#cmdk-q").focus(), 30); }
function closeCmdk() { $("#cmdk").hidden = true; }
function runCmd(index) { const item = cmdkItems[index]; if (!item) return; closeCmdk(); item[3](); }

$("#open-cmdk").addEventListener("click", openCmdk);
$("#cmdk").addEventListener("click", (event) => {
  if (event.target.id === "cmdk") return closeCmdk();
  const item = event.target.closest("[data-cmd]");
  if (item) runCmd(Number(item.dataset.cmd));
});
$("#cmdk-q").addEventListener("input", (event) => renderCmdk(event.target.value));
$("#cmdk-q").addEventListener("keydown", (event) => {
  const items = [...document.querySelectorAll(".cmdk-item")];
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    cmdkIndex = (cmdkIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length);
    items.forEach((item, index) => item.classList.toggle("sel", index === cmdkIndex));
    items[cmdkIndex]?.scrollIntoView({ block: "nearest" });
  }
  if (event.key === "Enter") { event.preventDefault(); runCmd(cmdkIndex); }
});
document.addEventListener("keydown", (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openCmdk(); }
  else if (event.key === "Escape" && !$("#cmdk").hidden) closeCmdk();
  else if (event.key.toLowerCase() === "n" && !typing && !event.ctrlKey && !event.metaKey && !document.querySelector("dialog[open]") && $("#cmdk").hidden) openRuleDialog();
});
for (const [buttonId, popId] of [["#bell", "#bell-pop"], ["#user-chip", "#user-pop"]]) {
  $(buttonId).addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !$(popId).classList.contains("open");
    document.querySelectorAll(".top-pop").forEach((pop) => pop.classList.remove("open"));
    $(popId).classList.toggle("open", open);
  });
}
document.addEventListener("click", (event) => {
  if (!event.target.closest(".top-pop")) document.querySelectorAll(".top-pop").forEach((pop) => pop.classList.remove("open"));
  const go = event.target.closest("[data-go-view]");
  if (go) { document.querySelectorAll(".top-pop").forEach((pop) => pop.classList.remove("open")); goToView(go.dataset.goView, go.dataset.scrollTo); }
});
$("#side-collapse").addEventListener("click", () => {
  document.body.classList.toggle("side-collapsed");
  localStorage.setItem("md-side-collapsed", document.body.classList.contains("side-collapsed") ? "1" : "");
});
if (localStorage.getItem("md-side-collapsed")) document.body.classList.add("side-collapsed");
$("#side-new-rule").addEventListener("click", () => openRuleDialog());
$("#ov-report").addEventListener("click", () => $("#analytics").scrollIntoView({ behavior: "smooth", block: "start" }));
$("#ov-range").addEventListener("click", (event) => {
  const button = event.target.closest("[data-range]");
  if (!button) return;
  overviewRange = button.dataset.range;
  $("#ov-range").querySelectorAll("button").forEach((item) => item.classList.toggle("on", item === button));
  moveRangeThumb();
  loadOverview().catch(() => {});
});
function moveRangeThumb() {
  const on = $("#ov-range .on");
  if (!on || !on.offsetWidth) return;
  $("#ov-range .ov-seg-thumb").style.left = `${on.offsetLeft}px`;
  $("#ov-range .ov-seg-thumb").style.width = `${on.offsetWidth}px`;
}
$("#ov-chart-stats").addEventListener("click", (event) => {
  const filter = event.target.closest("[data-ov-rule]");
  if (!filter) return;
  overviewRule = filter.dataset.ovRule;
  loadOverview().catch(() => {});
});
$("#ov-rank").addEventListener("click", (event) => {
  const id = event.target.closest("[data-edit]")?.dataset.edit;
  const rule = id && state.rules.find((item) => item.id === id);
  if (rule) openRuleDialog(null, rule);
});
$("#ov-chart").addEventListener("mousemove", showOverviewTip);
$("#ov-chart").addEventListener("mouseleave", () => $("#ov-tip").classList.remove("show"));
$("#goals-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#goals-status");
  try {
    const saved = await request("/api/settings", { method: "PATCH", body: JSON.stringify({ dmDailyGoal: form.elements.dmDailyGoal.value, leadMonthlyGoal: form.elements.leadMonthlyGoal.value }) });
    state.settings = { ...state.settings, ...saved };
    status.textContent = "Metas salvas ✓";
    await loadOverview();
  } catch (error) { status.textContent = error.message; }
});
window.addEventListener("resize", moveRangeThumb);

// ── Publicar Reels ──────────────────────────────────────────────────────────
const POST_STATUS = { scheduled: ["AGENDADO", "scheduled"], publishing: ["PUBLICANDO…", "publishing"], published: ["PUBLICADO", "published"], failed: ["FALHOU", "failed"] };
let publishFile = null;
let publishPreviewUrl = null;
let postsPollTimer = null;

function formatDateTime(iso) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

function setPublishFile(file) {
  const error = $("#publish-error");
  error.textContent = "";
  if (!file) return;
  if (!["video/mp4", "video/quicktime"].includes(file.type)) { error.textContent = "Escolha um vídeo MP4 ou MOV."; return; }
  if (file.size > 1024 ** 3) { error.textContent = "Vídeo grande demais — o limite do Instagram é 1 GB."; return; }
  publishFile = file;
  if (publishPreviewUrl) URL.revokeObjectURL(publishPreviewUrl);
  publishPreviewUrl = URL.createObjectURL(file);
  const video = $("#publish-video-preview");
  video.src = publishPreviewUrl;
  video.hidden = false;
  video.play().catch(() => {});
  $("#phone-overlay").hidden = false;
  $("#video-drop").classList.add("has-video");
  $("#publish-file-name").textContent = `${file.name} · ${(file.size / 1024 ** 2).toFixed(1)} MB · trocar vídeo`;
  syncPublishForm();
}

// Automação que nasce com o Reel: mesmas sugestões da tela de automações, e o mesmo cuidado de
// nunca sobrescrever o que a pessoa escreveu.
const publishAutoFilled = new Map();
let publishSuggestionSeed = 0;

function applyPublishSuggestions({ force = false } = {}) {
  const form = $("#publish-form");
  const keyword = form.elements.autoKeyword.value.trim();
  if (!keyword) return;
  const suggestions = suggestReplies(keyword, { followUp: form.elements.autoFollowUp.checked, seed: publishSuggestionSeed });
  const values = { autoReply: suggestions.reply, autoPublicReplies: suggestions.publicReplies.join("\n"), autoFollowUpText: suggestions.followUpText };
  const replaceable = (name) => !form.elements[name].value.trim() || form.elements[name].value === publishAutoFilled.get(name);
  let names = Object.keys(values).filter(replaceable);
  if (force && !names.length) {
    if (!confirm("Você já escreveu as mensagens. Trocar todas pelas sugestões?")) return;
    names = Object.keys(values);
  }
  for (const name of names) { form.elements[name].value = values[name]; publishAutoFilled.set(name, values[name]); }
}

function publishAutomationPayload() {
  const form = $("#publish-form");
  if (!form.elements.automationEnabled.checked) return null;
  const handle = state.health?.token?.username || state.settings.brandHandle || "";
  const followUp = form.elements.autoFollowUp.checked;
  const requireFollow = followUp && form.elements.autoRequireFollow.checked;
  return {
    keyword: form.elements.autoKeyword.value.trim(),
    publicReplies: form.elements.autoPublicReplies.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    reply: form.elements.autoReply.value,
    followUpEnabled: followUp,
    followUpUrl: followUp ? form.elements.autoFollowUpUrl.value.trim() : "",
    followUpText: followUp ? form.elements.autoFollowUpText.value : "",
    deliveryStyle: "button", buttonTitle: "ACESSAR MATERIAL",
    requireFollow,
    ...(requireFollow ? { profileUrl: `https://www.instagram.com/${handle}/`, followPrompt: `Ainda falta um passo: siga @${handle} e depois toque em JÁ SEGUI ✨`,
      followButtonTitle: "VER PERFIL", confirmFollowTitle: "JÁ SEGUI" } : {}),
  };
}

function syncPublishForm() {
  const form = $("#publish-form");
  const trial = form.elements.kind.value === "trial";
  $("#publish-automation-fields").hidden = !form.elements.automationEnabled.checked;
  $("#publish-auto-delivery").hidden = !form.elements.autoFollowUp.checked;
  const scheduled = form.elements.when.value === "schedule";
  $("#publish-trial-options").hidden = !trial;
  $("#publish-feed-option").hidden = trial;
  $("#publish-at").hidden = !scheduled;
  // datetime-local trabalha em hora local, sem fuso — monta o "agora + 2 min" no mesmo formato
  const soon = new Date(Date.now() + 2 * 60_000 - new Date().getTimezoneOffset() * 60_000);
  $("#publish-at").min = soon.toISOString().slice(0, 16);
  $("#publish-submit").textContent = scheduled ? "Agendar →" : "Publicar agora →";
  const caption = form.elements.caption.value;
  const hashtags = (caption.match(/#[^\s#]+/g) || []).length;
  const counter = $("#caption-counter");
  counter.textContent = `${caption.length} / 2200 · ${hashtags} ${hashtags === 1 ? "hashtag" : "hashtags"}`;
  counter.classList.toggle("over", hashtags > 30);
  // prévia no "celular": legenda por cima do vídeo, hashtags destacadas, selo de Trial
  $("#phone-tag").hidden = !trial || !publishFile;
  $("#phone-handle").textContent = state.health?.token?.username || state.settings.brandHandle || "seuperfil";
  $("#phone-caption").innerHTML = escapeHtml(caption || "Sua legenda aparece aqui…").replace(/(#[^\s#]+)/g, "<em>$1</em>").replace(/\n/g, "<br>");
}

// fetch não informa progresso de envio — XMLHttpRequest sim, e um vídeo grande demora
function uploadVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/posts/upload");
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("X-CSRF-Token", getCsrfToken());
    xhr.upload.addEventListener("progress", (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); });
    xhr.addEventListener("load", () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* resposta vazia */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `O envio falhou (${xhr.status}).`));
    });
    xhr.addEventListener("error", () => reject(new Error("A conexão caiu durante o envio. Tente de novo.")));
    xhr.send(file);
  });
}

function setPublishProgress(fraction, label) {
  const progress = $("#publish-progress");
  progress.hidden = fraction === null;
  if (fraction === null) return;
  progress.querySelector("i").style.width = `${Math.round(fraction * 100)}%`;
  progress.querySelector("span").textContent = label;
}

async function loadPosts() {
  const { posts, quota } = await request("/api/posts");
  state.posts = posts;
  state.postsQuota = quota;
  $("#publish-quota").textContent = quota?.total ? `${quota.used} de ${quota.total} publicações nas últimas 24 h` : "";
  renderPosts();
  renderStatusStrip();
  renderOverviewQueue();
  renderOverviewSummary();
  const pending = posts.filter((post) => post.status === "scheduled" || post.status === "publishing" || post.status === "failed").length;
  $("#nav-badge-posts").hidden = !pending;
  $("#nav-badge-posts").textContent = pending;
  clearTimeout(postsPollTimer);
  // enquanto algo estiver publicando (ou vencendo), atualiza a fila sozinho
  const soon = Date.now() + 60_000;
  if (posts.some((post) => post.status === "publishing" || (post.status === "scheduled" && Date.parse(post.scheduledAt) <= soon))) {
    postsPollTimer = setTimeout(() => loadPosts().catch(() => {}), 5000);
  }
}

function renderPosts() {
  const posts = [...(state.posts || [])].sort((a, b) => {
    const order = { publishing: 0, scheduled: 1, failed: 2, published: 3 };
    return (order[a.status] - order[b.status]) || (a.status === "scheduled" ? Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) : Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
  });
  // próximos 7 dias: um ponto por Reel agendado em cada dia (publicado conta no dia em que saiu)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  $("#week-strip").innerHTML = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today); day.setDate(today.getDate() + index);
    const same = (iso) => iso && new Date(iso).toDateString() === day.toDateString();
    const scheduledCount = posts.filter((post) => post.status === "scheduled" && same(post.scheduledAt)).length;
    const publishedCount = posts.filter((post) => post.status === "published" && same(post.publishedAt)).length;
    const label = day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase();
    const title = [scheduledCount && `${scheduledCount} agendado${scheduledCount > 1 ? "s" : ""}`, publishedCount && `${publishedCount} publicado${publishedCount > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || "nada nesse dia";
    return `<div class="week-day${index === 0 ? " today" : ""}" title="${title}"><span>${index === 0 ? "HOJE" : label}</span><b>${day.getDate()}</b><i>${"<em></em>".repeat(Math.min(scheduledCount, 3))}${"<em class=\"done\"></em>".repeat(Math.min(publishedCount, 3))}</i></div>`;
  }).join("");
  $("#posts-list").innerHTML = posts.length ? posts.map((post) => {
    const [label, tone] = POST_STATUS[post.status] || [post.status, ""];
    const kind = post.kind === "trial" ? `Trial Reels · ${post.graduationStrategy === "SS_PERFORMANCE" ? "promove sozinho" : "promoção manual"}` : `Reels${post.shareToFeed ? " · feed" : ""}`;
    const when = post.status === "published" ? `publicado ${formatDateTime(post.publishedAt)}` : post.status === "scheduled" ? (post.scheduled ? `agendado pra ${formatDateTime(post.scheduledAt)}` : "na fila pra publicar agora") : post.status === "failed" ? `falhou ${formatDateTime(post.failedAt)}` : "enviando pra Meta…";
    return `<article class="post-row">
      <div><h3>${escapeHtml(truncate(post.caption || "Sem legenda", 90))} <span class="post-status ${tone}">${label}</span></h3>
      <p>${escapeHtml(kind)} · ${escapeHtml(when)} · ${escapeHtml(post.fileName)}</p>
      ${post.automation ? `<p class="post-automation">⚡ Automação “${escapeHtml(post.automation.keyword)}” ${post.ruleId ? "· criada e ativa" : post.status === "published" ? "" : "· será criada quando o Reel sair"}</p>` : ""}
      ${post.error ? `<p class="post-error">${escapeHtml(post.error)}</p>` : ""}
      ${post.automationError ? `<p class="post-error">${escapeHtml(post.automationError)}</p>` : ""}</div>
      <div class="rule-actions">
        ${post.ruleId ? `<button class="edit-rule" data-post-rule="${escapeHtml(post.ruleId)}">Editar automação</button>` : ""}
        ${post.permalink ? `<a class="edit-rule" href="${escapeHtml(post.permalink)}" target="_blank" rel="noopener">Ver no Instagram</a>` : ""}
        ${post.status === "failed" ? `<button class="edit-rule" data-retry-post="${escapeHtml(post.id)}">Tentar de novo</button>` : ""}
        ${post.status !== "publishing" ? `<button class="icon-btn" data-delete-post="${escapeHtml(post.id)}" title="${post.status === "published" ? "Tirar da lista (o Reel continua no Instagram)" : "Cancelar"}">×</button>` : ""}
      </div>
    </article>`;
  }).join("") : '<p class="empty">Nenhum Reel na fila ainda.</p>';
}

$("#publish-file").addEventListener("change", (event) => setPublishFile(event.target.files[0]));
$("#video-drop").addEventListener("dragover", (event) => { event.preventDefault(); event.currentTarget.classList.add("dragging"); });
$("#video-drop").addEventListener("dragleave", (event) => event.currentTarget.classList.remove("dragging"));
$("#video-drop").addEventListener("drop", (event) => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); setPublishFile(event.dataTransfer.files[0]); });
// o <video> com controles fica dentro do label: clicar nos controles não pode abrir o seletor de arquivo
$("#publish-video-preview").addEventListener("click", (event) => {
  event.preventDefault();
  const video = event.currentTarget;
  if (video.paused) video.play().catch(() => {}); else video.pause();
});
$("#publish-file-name").addEventListener("click", () => $("#publish-file").click());
$("#publish-form").addEventListener("input", syncPublishForm);
$("#publish-form").addEventListener("change", syncPublishForm);
$("#publish-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#publish-error");
  error.textContent = "";
  if (!publishFile) { error.textContent = "Escolha o vídeo primeiro."; return; }
  const scheduled = form.elements.when.value === "schedule";
  if (scheduled && !form.elements.publishAt.value) { error.textContent = "Escolha a data e a hora do agendamento."; return; }
  const automation = publishAutomationPayload();
  if (automation) {
    const problem = !automation.keyword ? "Escolha a palavra-chave da automação."
      : !automation.reply.trim() ? "Escreva a mensagem do privado da automação."
      : !automation.publicReplies.length ? "Escreva ao menos uma resposta pública da automação."
      : automation.followUpEnabled && !/^https:\/\//i.test(automation.followUpUrl) ? "O link da automação precisa começar com https://"
      : automation.requireFollow && !(state.health?.token?.username || state.settings.brandHandle) ? "Pra exigir que siga, configure o @ do perfil em Marca." : null;
    if (problem) { error.textContent = problem; return; }
  }
  const submit = $("#publish-submit");
  submit.disabled = true;
  try {
    const { uploadId } = await uploadVideo(publishFile, (fraction) => setPublishProgress(fraction, `Enviando vídeo… ${Math.round(fraction * 100)}%`));
    setPublishProgress(1, scheduled ? "Agendando…" : "Vídeo enviado — publicando no Instagram (pode levar alguns minutos)…");
    await request("/api/posts", { method: "POST", body: JSON.stringify({
      uploadId, fileName: publishFile.name, kind: form.elements.kind.value, graduationStrategy: form.elements.graduationStrategy.value,
      shareToFeed: form.elements.shareToFeed.checked, caption: form.elements.caption.value, automation: publishAutomationPayload(),
      publishAt: scheduled ? new Date(form.elements.publishAt.value).toISOString() : null,
    }) });
    form.reset();
    publishFile = null;
    publishAutoFilled.clear();
    publishSuggestionSeed = 0;
    $("#publish-video-preview").hidden = true;
    $("#publish-video-preview").removeAttribute("src");
    $("#video-drop").classList.remove("has-video");
    $("#phone-overlay").hidden = true;
    $("#publish-file-name").textContent = "";
    syncPublishForm();
    setPublishProgress(null);
    await loadPosts();
    $("#publish-queue").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (submitError) {
    error.textContent = submitError.message;
    setPublishProgress(null);
  } finally {
    submit.disabled = false;
  }
});
$("#refresh-posts").addEventListener("click", () => loadPosts());
$("#publish-form").elements.autoKeyword.addEventListener("input", () => applyPublishSuggestions());
$("#publish-form").elements.autoFollowUp.addEventListener("change", () => applyPublishSuggestions());
$("#publish-suggest").addEventListener("click", () => {
  if (!$("#publish-form").elements.autoKeyword.value.trim()) { $("#publish-error").textContent = "Digite a palavra-chave primeiro."; return; }
  publishSuggestionSeed += 1;
  applyPublishSuggestions({ force: true });
});
$("#insert-keyword").addEventListener("click", () => {
  const form = $("#publish-form");
  const keyword = form.elements.autoKeyword.value.trim().toUpperCase();
  if (!keyword) { $("#publish-error").textContent = "Digite a palavra-chave primeiro."; return; }
  const caption = form.elements.caption;
  // palavra inteira ("skills" não conta como "SKILL"); \b não serve com acento, por isso a classe Unicode
  const asWord = new RegExp(`(^|[^\\p{L}\\p{N}])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "iu");
  if (!asWord.test(caption.value)) caption.value = `${caption.value.trimEnd()}${caption.value.trim() ? "\n\n" : ""}Comenta ${keyword} que eu te mando no direct 👇`;
  syncPublishForm();
});
$("#posts-list").addEventListener("click", async (event) => {
  const ruleId = event.target.closest("[data-post-rule]")?.dataset.postRule;
  if (ruleId) {
    await renderDashboard();
    const rule = state.rules.find((item) => item.id === ruleId);
    if (rule) openRuleDialog(null, rule); else alert("Essa automação foi apagada.");
    return;
  }
  const retry = event.target.closest("[data-retry-post]")?.dataset.retryPost;
  const remove = event.target.closest("[data-delete-post]")?.dataset.deletePost;
  try {
    if (retry) await request(`/api/posts/${retry}/retry`, { method: "POST" });
    else if (remove) {
      const post = state.posts.find((item) => item.id === remove);
      if (!confirm(post?.status === "published" ? "Tirar da lista? O Reel continua no Instagram." : "Cancelar esse Reel? O vídeo enviado será apagado do servidor.")) return;
      await request(`/api/posts/${remove}`, { method: "DELETE" });
    } else return;
    await loadPosts();
  } catch (actionError) { alert(actionError.message); }
});
syncPublishForm();

await Promise.all([renderDashboard(), loadMedia(), loadContacts(), loadAnalytics(), loadModeration(), loadCampaigns(), loadLeads(), loadHealth(), loadAudit(), loadContentRoi(), loadWebhookSettings(), loadPosts().catch(() => {}), loadOverview().catch((error) => console.error(error))]);
renderTopbar();
moveRangeThumb();
renderPipeline();
