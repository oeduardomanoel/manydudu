// Resumo por dia das automações. O log de atividade tem teto de eventos (cobre poucos dias com
// volume real), então cada evento também soma num contador diário — é isso que alimenta o gráfico
// de 14/30 dias e 13 semanas e o filtro por automação.
const KEEP_DAYS = 120;
const TIME_ZONE = process.env.TZ_DISPLAY || "America/Sao_Paulo";
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export const dayKey = (value = Date.now()) => dayFormat.format(new Date(value));

const COUNTED = { sent: ["sent"], delivered: ["delivered", "replied"], waiting_follow: ["replied"], failed: ["failed"] };

export function recordDailyEvent(stats, event) {
  const fields = COUNTED[event?.status];
  const at = Date.parse(event?.at);
  if (!fields || !Number.isFinite(at)) return stats;
  const day = (stats[dayKey(at)] ??= { sent: 0, delivered: 0, replied: 0, failed: 0, byRule: {} });
  for (const field of fields) day[field] += 1;
  if (event.ruleId && event.status === "sent") day.byRule[event.ruleId] = (day.byRule[event.ruleId] || 0) + 1;
  pruneDailyStats(stats, at);
  return stats;
}

export function pruneDailyStats(stats, now = Date.now()) {
  const oldest = dayKey(now - KEEP_DAYS * 86_400_000);
  for (const key of Object.keys(stats)) if (key < oldest) delete stats[key];
  return stats;
}

// Primeira vez: monta o resumo a partir do que o log ainda tem (mais antigo primeiro).
export function backfillDailyStats(activity = []) {
  const stats = {};
  for (const event of [...activity].reverse()) recordDailyEvent(stats, event);
  return stats;
}

const addDays = (key, delta) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
};

// Série contínua (dias sem evento entram zerados). Por semana, cada ponto soma 7 dias terminando
// no dia do ponto — o último ponto é "os últimos 7 dias".
export function buildSeries(stats = {}, { range = "14d", now = Date.now(), ruleId = null } = {}) {
  const today = dayKey(now);
  const pick = (day) => {
    const entry = stats[day];
    if (!entry) return 0;
    return ruleId ? entry.byRule?.[ruleId] || 0 : entry.sent;
  };
  if (range === "13w") {
    return Array.from({ length: 13 }, (_, index) => {
      const end = addDays(today, -(12 - index) * 7);
      let value = 0;
      for (let offset = 0; offset < 7; offset += 1) value += pick(addDays(end, -offset));
      return { day: end, start: addDays(end, -6), value };
    });
  }
  const days = range === "30d" ? 30 : 14;
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(today, -(days - 1 - index));
    return { day, value: pick(day) };
  });
}

export function sumRange(stats = {}, from, to, field = "sent") {
  let total = 0;
  for (const [day, entry] of Object.entries(stats)) if (day >= from && day <= to) total += entry[field] || 0;
  return total;
}

export const monthStart = (now = Date.now()) => `${dayKey(now).slice(0, 8)}01`;

// Mesmo trecho do mês anterior (do dia 1 até o mesmo dia), pra comparar "no mesmo ponto".
// Só devolve se o resumo já cobria aquele período — senão a comparação mostraria queda falsa.
export function previousMonthSpan(completeSince, now = Date.now()) {
  const [y, m, d] = dayKey(now).split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const from = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m - 2, Math.min(d, lastDay))).toISOString().slice(0, 10);
  return completeSince && completeSince <= from ? { from, to } : null;
}

export function overview(state = {}, { range = "14d", ruleId = null, now = Date.now() } = {}) {
  const stats = state.dailyStats ?? {};
  const today = dayKey(now);
  const from = monthStart(now);
  // contagem completa só a partir de dailyStatsSince; sem a data (estado antigo), vale o dia mais antigo
  const completeSince = state.dailyStatsSince ?? Object.keys(stats).sort()[0] ?? null;
  const previous = previousMonthSpan(completeSince, now);
  const settings = state.settings ?? {};
  const rules = state.rules ?? [];
  const fourteen = addDays(today, -13);
  const ranking = rules.map((rule) => {
    const series = buildSeries(stats, { range: "14d", now, ruleId: rule.id }).map((point) => point.value);
    return { id: rule.id, name: rule.name, keyword: rule.keyword, sent: series.reduce((sum, value) => sum + value, 0), series };
  }).filter((rule) => rule.sent > 0).sort((a, b) => b.sent - a.sent).slice(0, 6);
  return {
    today: { ...(stats[today] ?? { sent: 0, delivered: 0, replied: 0, failed: 0 }), byRule: undefined },
    waitingFollowToday: (state.activity ?? []).filter((event) => event.status === "waiting_follow" && dayKey(event.at) === today).length,
    month: {
      sent: sumRange(stats, from, today),
      previousSent: previous ? sumRange(stats, previous.from, previous.to) : null,
      leads: (state.leads ?? []).filter((lead) => lead.createdAt && dayKey(lead.createdAt) >= from).length,
      day: Number(today.slice(8, 10)),
      daysInMonth: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate(),
    },
    goals: { dmDaily: Number(settings.dmDailyGoal) || 0, leadMonthly: Number(settings.leadMonthlyGoal) || 0 },
    range,
    series: buildSeries(stats, { range, now, ruleId }),
    trackedSince: completeSince,
    monthComplete: Boolean(completeSince && completeSince <= from),
    rules: rules.map((rule) => ({ id: rule.id, name: rule.name, keyword: rule.keyword })),
    ranking,
    rankingSince: fourteen,
  };
}
