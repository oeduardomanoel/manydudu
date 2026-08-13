import { randomUUID } from "node:crypto";

export function normalizeText(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function findMatchingRule(text, rules, mediaId = null) {
  const comment = normalizeText(text);
  const eligible = rules.filter((rule) => !rule.mediaId || rule.mediaId === mediaId);
  eligible.sort((left, right) => Number(Boolean(right.mediaId)) - Number(Boolean(left.mediaId)));
  return eligible.find((rule) => {
    if (!rule.enabled) return false;
    const keyword = normalizeText(rule.keyword);
    return rule.match === "exact" ? comment === keyword : comment.includes(keyword);
  });
}

export function buildJourney(input) {
  const enabled = (value) => value === true || value === "on";
  const keyword = String(input.keyword || "palavra-chave").trim();
  const steps = [{ type: "trigger", title: "Comentário", summary: `Comentário contém “${keyword}”` }];
  if (["public", "both"].includes(input.responseMode)) {
    steps.push({ type: "message", title: "Resposta pública", summary: "Responder no comentário" });
  }
  if (["private", "both"].includes(input.responseMode)) {
    steps.push({ type: "message", title: "Mensagem privada", summary: "Enviar a primeira DM" });
  }
  if (!enabled(input.followUpEnabled)) return steps;
  steps.push({ type: "reply", title: "Confirmação", summary: enabled(input.initialQuickReplyEnabled) ? "Aguardar clique na resposta rápida" : "Aguardar resposta no Direct" });
  if (enabled(input.requireFollow)) steps.push({ type: "condition", title: "Condição", summary: "Verificar se segue o perfil" });
  steps.push({ type: "delivery", title: "Entrega", summary: input.deliveryStyle === "button" ? "Entregar por botão" : "Entregar link no texto" });
  return steps;
}

export function createRule(input) {
  const keyword = String(input.keyword ?? "").trim();
  const reply = String(input.reply ?? "").trim();
  if (!keyword || !reply) throw new Error("Palavra-chave e resposta são obrigatórias.");
  if (!["contains", "exact"].includes(input.match)) throw new Error("Correspondência inválida.");
  if (!["public", "private", "both"].includes(input.responseMode)) throw new Error("Canal inválido.");
  const publicReplies = parsePublicReplies(input.publicReplies);
  if (input.responseMode === "both" && !publicReplies.length) throw new Error("Informe ao menos uma resposta pública.");
  const followUpEnabled = input.followUpEnabled === true || input.followUpEnabled === "on";
  const followUpText = String(input.followUpText ?? "").trim();
  const followUpUrl = String(input.followUpUrl ?? "").trim();
  const requireFollow = input.requireFollow === true || input.requireFollow === "on";
  const followPrompt = String(input.followPrompt ?? "").trim();
  const deliveryStyle = input.deliveryStyle === "button" ? "button" : "text";
  const buttonTitle = String(input.buttonTitle ?? "").trim();
  const initialQuickReplyEnabled = followUpEnabled && (input.initialQuickReplyEnabled === true || input.initialQuickReplyEnabled === "on");
  const initialQuickReplyTitle = String(input.initialQuickReplyTitle ?? "").trim();
  const profileUrl = String(input.profileUrl ?? "").trim();
  const followButtonTitle = String(input.followButtonTitle ?? "").trim();
  const confirmFollowTitle = String(input.confirmFollowTitle ?? "").trim();
  const aiEnabled = input.aiEnabled === true || input.aiEnabled === "on";
  const aiGoal = String(input.aiGoal ?? "").trim();
  const aiInstructions = String(input.aiInstructions ?? "").trim();
  if (aiEnabled && !["private", "both"].includes(input.responseMode)) throw new Error("A qualificação por IA exige mensagem privada.");
  if (aiEnabled && !input.mediaId) throw new Error("A qualificação por IA exige um Reel específico.");
  if (aiEnabled && (!aiGoal || aiGoal.length > 800)) throw new Error("Defina um objetivo da IA com até 800 caracteres.");
  if (aiInstructions.length > 2000) throw new Error("As instruções da IA podem ter no máximo 2000 caracteres.");
  if (aiEnabled && followUpEnabled) throw new Error("Escolha apenas um: qualificação por IA ou entrega automática de link.");
  if (followUpEnabled && !["private", "both"].includes(input.responseMode)) throw new Error("A entrega após resposta exige mensagem privada.");
  if (followUpEnabled && (!followUpText || !followUpUrl)) throw new Error("Texto e link da entrega são obrigatórios.");
  if (followUpEnabled && !isSecureUrl(followUpUrl)) throw new Error("O link de entrega precisa usar HTTPS.");
  if (requireFollow && !followUpEnabled) throw new Error("A verificação de seguidor exige entrega após resposta.");
  if (requireFollow && !followPrompt) throw new Error("Informe a mensagem para pedir que a pessoa siga o perfil.");
  if (followUpEnabled && deliveryStyle === "button" && !buttonTitle) throw new Error("Informe o título do botão.");
  if (buttonTitle.length > 20) throw new Error("O título do botão pode ter no máximo 20 caracteres.");
  if (initialQuickReplyEnabled && (!initialQuickReplyTitle || initialQuickReplyTitle.length > 20)) throw new Error("A Quick Reply precisa ter um título de até 20 caracteres.");
  if (initialQuickReplyEnabled && !["private", "both"].includes(input.responseMode)) throw new Error("Quick Reply exige mensagem privada.");
  if (requireFollow && !isSecureUrl(profileUrl)) throw new Error("O link do perfil precisa usar HTTPS.");
  if (requireFollow && (!followButtonTitle || !confirmFollowTitle)) throw new Error("Configure os botões de seguir e confirmar.");
  if (followButtonTitle.length > 20 || confirmFollowTitle.length > 20) throw new Error("Os botões podem ter no máximo 20 caracteres.");
  const journey = buildJourney({ ...input, keyword, followUpEnabled, requireFollow, initialQuickReplyEnabled, deliveryStyle });
  return { id: randomUUID(), name: String(input.name || keyword).trim(), keyword, reply, publicReplies,
    match: input.match, responseMode: input.responseMode, enabled: input.enabled !== false,
    mediaId: input.mediaId ? String(input.mediaId) : null,
    mediaTitle: input.mediaTitle ? String(input.mediaTitle).slice(0, 120) : null,
    followUpEnabled, followUpText, followUpUrl, requireFollow, followPrompt, deliveryStyle, buttonTitle,
    initialQuickReplyEnabled, initialQuickReplyTitle, profileUrl, followButtonTitle, confirmFollowTitle, journey,
    aiEnabled, aiGoal, aiInstructions,
    createdAt: new Date().toISOString() };
}

export function selectPublicReply(rule, sentCount = 0) {
  const replies = Array.isArray(rule.publicReplies) && rule.publicReplies.length ? rule.publicReplies : [rule.reply];
  return replies[Math.max(0, Number(sentCount) || 0) % replies.length];
}

export function updateRule(existing, input) {
  if (!existing) throw new Error("Automação não encontrada.");
  const preserved = {
    initialQuickReplyEnabled: existing.initialQuickReplyEnabled,
    initialQuickReplyTitle: existing.initialQuickReplyTitle
  };
  const updated = createRule({ ...preserved, ...input, enabled: existing.enabled });
  return { ...updated, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
}

function isSecureUrl(value) {
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

function parsePublicReplies(value) {
  const items = Array.isArray(value) ? value : String(value ?? "").split(/\r?\n/);
  const replies = [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
  if (replies.length > 10) throw new Error("Configure no máximo 10 respostas públicas.");
  if (replies.some((reply) => reply.length > 1000)) throw new Error("Cada resposta pública pode ter no máximo 1000 caracteres.");
  return replies;
}
