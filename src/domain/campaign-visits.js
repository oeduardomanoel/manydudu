// Robôs que abrem o link sem ser uma pessoa — principalmente a prévia de link que Instagram,
// Facebook e WhatsApp geram quando o link da campanha vai numa DM.
const BOT_USER_AGENT = /bot|crawler|spider|preview|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegram|slack|discord|curl|wget|python|headless/i;

export const isLikelyBot = (userAgent) => !userAgent || BOT_USER_AGENT.test(String(userAgent));

// O estado inteiro é regravado a cada update — gravar uma vez por visita deixaria tudo lento e
// aumentaria a chance de uma gravação apagar outra. Então soma em memória e grava de tempos em tempos.
export function createVisitCounter({ store, flushMs = 60_000, logError = console.error } = {}) {
  let pending = new Map();
  let flushing = null;

  async function flush() {
    if (flushing) return flushing;
    if (!pending.size) return;
    const batch = pending;
    pending = new Map();
    flushing = store.addCampaignVisits(Object.fromEntries(batch))
      .catch((error) => {
        // devolve pro próximo ciclo em vez de perder a contagem
        for (const [slug, count] of batch) pending.set(slug, (pending.get(slug) || 0) + count);
        logError(`Falha ao salvar visitas das campanhas: ${error.message}`);
      })
      .finally(() => { flushing = null; });
    return flushing;
  }

  return {
    record(slug, userAgent) {
      if (!slug || isLikelyBot(userAgent)) return false;
      pending.set(slug, (pending.get(slug) || 0) + 1);
      return true;
    },
    pending: () => Object.fromEntries(pending),
    flush,
    start() {
      const timer = setInterval(() => { void flush(); }, flushMs);
      timer.unref?.();
      return timer;
    },
  };
}
