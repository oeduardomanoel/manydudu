const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const truncate = (value = "", length = 80) => value.length > length ? `${value.slice(0, length)}…` : value;
const state = { media: [], rules: [], filter: "REELS", selectedMedia: null, contacts: [], selectedContactId: null, moderation: [] };

async function request(path, options) {
  let adminToken = sessionStorage.getItem("manydudu_admin_token") || "";
  const send = () => fetch(path, { ...options, headers: { "Content-Type": "application/json",
    ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}), ...(options?.headers || {}) } });
  let response = await send();
  if (response.status === 401) {
    adminToken = prompt("Digite a chave de acesso do painel ManyDudu:") || "";
    if (adminToken) sessionStorage.setItem("manydudu_admin_token", adminToken);
    response = await send();
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a solicitação.");
  return data;
}

async function renderDashboard() {
  const dashboard = await request("/api/state");
  state.rules = dashboard.rules;
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
}

function renderRules(rules) {
  $("#rules").innerHTML = rules.length ? rules.map((rule) => `<article class="rule">
    <div class="rule-icon">${rule.aiEnabled ? "AI" : rule.followUpEnabled ? "⚡" : rule.mediaId ? "▣" : "↳"}</div><div><h3>${escapeHtml(rule.name)}${rule.aiEnabled ? '<span class="delivery-badge">AGENTE IA</span>' : rule.followUpEnabled ? `<span class="delivery-badge">${rule.requireFollow ? "FOLLOW + LINK" : "LINK APÓS RESPOSTA"}</span>` : ""}</h3>
    <p>“${escapeHtml(rule.keyword)}” · ${rule.responseMode === "both" ? "pública + privada" : rule.responseMode === "private" ? "mensagem privada" : "resposta pública"}</p>
    <p>${rule.mediaId ? `Somente: ${escapeHtml(truncate(rule.mediaTitle || "Reel selecionado", 52))}` : "Todos os conteúdos"}</p><div class="journey-mini">${(rule.journey || []).map((step) => `<span title="${escapeHtml(step.summary)}">${escapeHtml(step.title)}</span>`).join("")}</div></div>
    <div class="rule-actions"><button class="edit-rule" data-edit="${rule.id}">Editar</button><button class="icon-btn ${rule.enabled ? "" : "off"}" data-toggle="${rule.id}" title="Ativar/desativar">●</button><button class="icon-btn" data-delete="${rule.id}" title="Excluir">×</button></div>
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
  $("#contacts-list").innerHTML = contacts.length ? contacts.map((contact) => `<button class="contact-row ${contact.id === state.selectedContactId ? "active" : ""}" data-contact="${escapeHtml(contact.id)}"><span class="contact-avatar">${escapeHtml((contact.username || "IG").slice(0, 2).toUpperCase())}</span><span><strong>@${escapeHtml(contact.username || "instagram")}</strong><small>${escapeHtml(truncate(contact.history?.[0]?.text || "Interação registrada", 42))}</small></span><i>${contact.interactionCount}</i></button>`).join("") : '<p class="empty">Nenhum contato encontrado.</p>';
}

async function openContact(contactId) {
  const contact = await request(`/api/contacts/${contactId}`);
  state.selectedContactId = contactId;
  renderContacts($("#contact-search").value);
  const history = (contact.history || []).map((event) => `<article class="history-event ${event.type}"><span>${event.type === "comment" ? "COMENTÁRIO" : event.type === "postback" ? "BOTÃO" : event.type === "outgoing" ? "VOCÊ" : "DIRECT"}</span><p>${escapeHtml(event.text)}</p><time>${new Date(event.at).toLocaleString("pt-BR")}</time></article>`).join("");
  const qualification = contact.qualification ? `<div class="qualification-card"><span>QUALIFICAÇÃO IA</span><strong>${escapeHtml(contact.qualification.stage)} · ${Number(contact.qualification.score) || 0}/100</strong><p>${escapeHtml(contact.qualification.summary || "Em diagnóstico")}</p></div>` : "";
  $("#contact-detail").innerHTML = `<div class="contact-title"><div><p class="eyebrow">CAIXA DE ENTRADA</p><h3>@${escapeHtml(contact.username || "instagram")}</h3></div><div class="contact-states"><span class="follow-state ${contact.follower ? "yes" : ""}">${contact.follower ? "✓ segue o perfil" : "status não verificado"}</span><button id="pause-contact" class="pause-button ${contact.automationPaused ? "paused" : ""}">${contact.automationPaused ? "▶ Retomar automação" : "Ⅱ Pausar automação"}</button></div></div>${qualification}<div class="tags">${(contact.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || '<small>Sem tags</small>'}</div><div class="history-list">${history || '<p class="empty">Sem histórico.</p>'}</div><form id="reply-form" class="reply-form"><textarea name="text" maxlength="1000" required placeholder="Escreva uma resposta manual..."></textarea><button class="primary compact" type="submit">Enviar Direct</button><small>Ao enviar, a automação desta pessoa será pausada.</small></form><form id="contact-form"><label>Tags separadas por vírgula<input name="tags" value="${escapeHtml((contact.tags || []).join(", "))}" placeholder="lead, material"></label><label>Nova nota<textarea name="note" placeholder="Ex.: pediu o guia de IA"></textarea></label><button class="primary compact" type="submit">Salvar contato</button></form>`;
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
  for (const name of ["name", "keyword", "match", "reply", "responseMode", "followUpText", "followUpUrl", "followPrompt", "profileUrl", "followButtonTitle", "confirmFollowTitle", "deliveryStyle", "buttonTitle", "aiGoal", "aiInstructions"]) {
    if (rule && form.elements[name]) form.elements[name].value = rule[name] ?? "";
  }
  form.elements.publicReplies.value = Array.isArray(rule?.publicReplies) ? rule.publicReplies.join("\n") : "";
  form.elements.followUpEnabled.checked = Boolean(rule?.followUpEnabled);
  form.elements.aiEnabled.checked = Boolean(rule?.aiEnabled);
  form.elements.requireFollow.checked = Boolean(rule?.requireFollow);
  if (!rule) {
    form.elements.deliveryStyle.value = "button";
    form.elements.buttonTitle.value = "ACESSAR MATERIAL";
  }
  const hasDelivery = form.elements.followUpEnabled.checked;
  const requiresFollow = form.elements.requireFollow.checked;
  const usesButton = form.elements.deliveryStyle.value === "button";
  $("#delivery-fields").hidden = !hasDelivery;
  $("#ai-fields").hidden = !form.elements.aiEnabled.checked;
  $("#follow-prompt-fields").hidden = !requiresFollow;
  $("#button-fields").hidden = !usesButton;
  form.elements.followUpText.required = hasDelivery;
  form.elements.followUpUrl.required = hasDelivery;
  form.elements.followPrompt.required = requiresFollow;
  form.elements.profileUrl.required = requiresFollow;
  form.elements.followButtonTitle.required = requiresFollow;
  form.elements.confirmFollowTitle.required = requiresFollow;
  form.elements.buttonTitle.required = usesButton;
  form.elements.aiGoal.required = form.elements.aiEnabled.checked;
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
  const aiEnabled = form.elements.aiEnabled.checked;
  const steps = [["trigger", "Comentário", `Contém “${keyword}”`]];
  if (["public", "both"].includes(responseMode)) steps.push(["message", "Resposta pública", "Responder comentário"]);
  if (["private", "both"].includes(responseMode)) steps.push(["message", "Mensagem privada", "Enviar primeira DM"]);
  if (aiEnabled) steps.push(["reply", "Agente IA", "Diagnosticar e qualificar"]);
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
  form.elements.aiEnabled.disabled = publicOnly || !form.elements.mediaId.value;
  form.elements.followUpEnabled.closest(".delivery-toggle").classList.toggle("is-disabled", publicOnly);
  if (publicOnly) {
    form.elements.followUpEnabled.checked = false;
    form.elements.requireFollow.checked = false;
    form.elements.aiEnabled.checked = false;
    $("#delivery-fields").hidden = true;
    $("#follow-prompt-fields").hidden = true;
    $("#ai-fields").hidden = true;
  }
}

function syncPublicReplyCount() {
  const field = $("#rule-form").elements.publicReplies;
  const count = field.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
  $("#public-reply-count").textContent = `${count}/10`;
  field.setCustomValidity(count > 10 ? "Use no máximo 10 respostas públicas, uma por linha." : "");
}

$("#new-rule").addEventListener("click", () => openRuleDialog());
$("#automate-media").addEventListener("click", () => openRuleDialog(state.selectedMedia));
$("#clear-scope").addEventListener("click", () => {
  const form = $("#rule-form");
  form.elements.mediaId.value = "";
  form.elements.mediaTitle.value = "";
  $("#rule-scope strong").textContent = "Todos os conteúdos";
  $("#rule-scope .scope-icon").textContent = "◎";
  $("#clear-scope").hidden = true;
  $("#rule-form").elements.aiEnabled.checked = false;
  $("#ai-fields").hidden = true;
  syncResponseModeFields();
});
$("#rule-form").elements.followUpEnabled.addEventListener("change", (event) => {
  $("#delivery-fields").hidden = !event.target.checked;
  $("#rule-form").elements.followUpText.required = event.target.checked;
  $("#rule-form").elements.followUpUrl.required = event.target.checked;
  if (event.target.checked) {
    $("#rule-form").elements.aiEnabled.checked = false;
    $("#ai-fields").hidden = true;
    $("#rule-form").elements.aiGoal.required = false;
  }
  if (!event.target.checked) {
    $("#rule-form").elements.requireFollow.checked = false;
    $("#follow-prompt-fields").hidden = true;
    $("#rule-form").elements.followPrompt.required = false;
  }
});
$("#rule-form").elements.aiEnabled.addEventListener("change", (event) => {
  const enabled = event.target.checked;
  $("#ai-fields").hidden = !enabled;
  $("#rule-form").elements.aiGoal.required = enabled;
  if (enabled) {
    $("#rule-form").elements.followUpEnabled.checked = false;
    $("#delivery-fields").hidden = true;
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
document.querySelectorAll("[data-scroll]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.scroll}`).scrollIntoView({ behavior: "smooth" })));
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
  payload.aiEnabled = ruleForm.elements.aiEnabled.checked;
  payload.requireFollow = ruleForm.elements.requireFollow.checked;
  const ruleId = ruleForm.dataset.ruleId;
  const path = ruleId ? `/api/rules/${ruleId}` : "/api/rules";
  try { await request(path, { method: ruleId ? "PATCH" : "POST", body: JSON.stringify(payload) }); ruleForm.reset(); delete ruleForm.dataset.ruleId; $("#rule-dialog").close(); await renderDashboard(); }
  catch (error) { $("#form-error").textContent = error.message; }
});
$("#rules").addEventListener("click", async (event) => {
  const edit = event.target.dataset.edit; const toggle = event.target.dataset.toggle; const remove = event.target.dataset.delete;
  if (edit) { const rule = state.rules.find((item) => item.id === edit); if (rule) openRuleDialog(null, rule); return; }
  if (toggle) await request(`/api/rules/${toggle}/toggle`, { method: "POST" });
  if (remove && confirm("Excluir esta automação?")) await request(`/api/rules/${remove}`, { method: "DELETE" });
  await renderDashboard();
});

await Promise.all([renderDashboard(), loadMedia(), loadContacts(), loadAnalytics(), loadModeration()]);
