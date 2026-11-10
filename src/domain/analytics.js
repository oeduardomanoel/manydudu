const emptyFunnel = () => ({ captured: 0, dmSent: 0, replied: 0, delivered: 0, deliveryRate: 0 });

function count(events) {
  const funnel = emptyFunnel();
  funnel.captured = events.filter((event) => event.status === "sent" || event.status === "failed" && event.mediaId).length;
  funnel.dmSent = events.filter((event) => event.status === "sent").length;
  funnel.replied = events.filter((event) => event.status === "waiting_follow" || event.status === "delivered").length;
  funnel.delivered = events.filter((event) => event.status === "delivered").length;
  funnel.deliveryRate = funnel.captured ? Math.round(funnel.delivered / funnel.captured * 100) : 0;
  return funnel;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REPLIED = new Set(["waiting_follow", "delivered"]);

// Indicadores do topo da visão geral: período atual em série diária (pro gráfico) e o período
// anterior pra comparação. O log de atividade tem teto de eventos, então quando ele não alcança o
// começo do período o resultado avisa (complete=false / since) em vez de mostrar queda falsa.
export function buildKpis({ activity = [], leads = [], now = Date.now(), days = 7 }) {
  const start = now - days * DAY_MS;
  const previousStart = start - days * DAY_MS;
  const times = activity.map((event) => Date.parse(event.at)).filter(Number.isFinite);
  const oldest = times.length ? Math.min(...times) : null;
  const activityCoversPrevious = oldest !== null && oldest <= previousStart;

  const measure = (items, matches, comparable) => {
    const series = Array(days).fill(0);
    let value = 0; let previous = 0;
    for (const item of items) {
      const at = Date.parse(item.at ?? item.createdAt);
      if (!Number.isFinite(at) || at > now || !matches(item)) continue;
      if (at >= start) { value += 1; series[Math.min(days - 1, Math.floor((at - start) / DAY_MS))] += 1; }
      else if (at >= previousStart) previous += 1;
    }
    return { value, previous: comparable ? previous : null, series };
  };

  const dmSent = measure(activity, (event) => event.status === "sent", activityCoversPrevious);
  const replied = measure(activity, (event) => REPLIED.has(event.status), activityCoversPrevious);
  const delivered = measure(activity, (event) => event.status === "delivered", activityCoversPrevious);
  const leadsMetric = measure(leads, () => true, true);
  const rate = (part, total) => total ? Math.round(part / total * 100) : null;
  const responseRate = {
    value: rate(replied.value, dmSent.value),
    previous: activityCoversPrevious ? rate(replied.previous, dmSent.previous) : null,
    series: dmSent.series.map((sent, index) => rate(replied.series[index], sent) ?? 0),
  };

  return {
    days,
    complete: oldest !== null && oldest <= start,
    since: oldest !== null && oldest > start ? new Date(oldest).toISOString() : new Date(start).toISOString(),
    dmSent, delivered, responseRate, leads: leadsMetric,
  };
}

export function buildAnalytics({ rules = [], activity = [] }) {
  const automated = activity.filter((event) => event.rule || event.ruleId);
  const byRule = rules.map((rule) => {
    const events = automated.filter((event) => event.ruleId === rule.id || !event.ruleId && event.rule === rule.name);
    return { id: rule.id, name: rule.name, mediaId: rule.mediaId || null, enabled: rule.enabled, ...count(events) };
  });
  return { total: count(automated), rules: byRule.sort((left, right) => right.captured - left.captured) };
}
