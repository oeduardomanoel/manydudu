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

export function buildAnalytics({ rules = [], activity = [] }) {
  const automated = activity.filter((event) => event.rule || event.ruleId);
  const byRule = rules.map((rule) => {
    const events = automated.filter((event) => event.ruleId === rule.id || !event.ruleId && event.rule === rule.name);
    return { id: rule.id, name: rule.name, mediaId: rule.mediaId || null, enabled: rule.enabled, ...count(events) };
  });
  return { total: count(automated), rules: byRule.sort((left, right) => right.captured - left.captured) };
}
