// Sugestões prontas pra uma automação nova, montadas em cima da palavra-chave. {nome} fica como
// marcador — o servidor troca pelo @ de quem comentou na hora de enviar.
const PUBLIC_REPLIES = [
  "Te mandei o {PALAVRA} na DM 👊",
  "Acabei de te chamar no direct, {nome} ✨",
  "Olha a DM aí 👀",
  "Mandei tudo no privado, confere lá!",
  "Já tá na sua DM 🚀",
  "Prontinho, {nome}! Checa seu direct 📩",
  "Te chamei no privado com o {PALAVRA} 👇",
  "Fica de olho no direct que já foi 😉",
  "Corre na DM que o {PALAVRA} tá lá 🔥",
  "Enviado! Dá uma olhada nas mensagens",
  "Confere o direct, {nome} 🙌",
  "Te enviei agora, vê suas solicitações de mensagem!",
];

// Primeira DM quando o link vem depois: pede uma resposta, que abre a janela de 24 h do Instagram.
const PRIVATE_ASK = [
  "Oi {nome}! Vi que você comentou {PALAVRA} 🙌 Me responde SIM aqui que eu te mando na hora.",
  "Opa {nome}, tudo bem? Pra eu te enviar o {PALAVRA}, é só responder qualquer coisa aqui 👇",
  "Oi! Separei o {PALAVRA} pra você ✨ Responde EU QUERO que eu já te mando.",
  "E aí {nome}! O {PALAVRA} tá prontinho. Me responde aqui pra eu liberar pra você 🚀",
];

// Primeira DM quando não há entrega automática depois.
const PRIVATE_DIRECT = [
  "Oi {nome}! Obrigado por comentar {PALAVRA} 🙌 Já já te explico tudo por aqui.",
  "Opa {nome}! Vi seu comentário sobre {PALAVRA} — me conta, o que você quer resolver?",
  "Oi! Que bom que você se interessou por {PALAVRA} ✨ Me responde aqui que eu te ajudo.",
];

const DELIVERY = [
  "Prontinho, {nome}! Aqui está o {PALAVRA} 👇",
  "Como prometido, segue o {PALAVRA} 🚀 Qualquer dúvida, me chama aqui.",
  "Tá aqui! Aproveita o {PALAVRA} e depois me conta o que achou 👇",
];

const pick = (list, seed, offset = 0) => list[(seed + offset) % list.length];

export function suggestReplies(keyword, { followUp = true, seed = 0, count = 6 } = {}) {
  const word = String(keyword ?? "").trim().toUpperCase() || "MATERIAL";
  const fill = (text) => text.replace(/\{PALAVRA\}/g, word);
  const start = (seed * count) % PUBLIC_REPLIES.length;
  const publicReplies = Array.from({ length: Math.min(count, PUBLIC_REPLIES.length) }, (_, index) => fill(PUBLIC_REPLIES[(start + index) % PUBLIC_REPLIES.length]));
  return {
    publicReplies,
    reply: fill(pick(followUp ? PRIVATE_ASK : PRIVATE_DIRECT, seed)),
    followUpText: fill(pick(DELIVERY, seed)),
  };
}
