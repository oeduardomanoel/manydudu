function originMediaId(contact) {
  const commentEvents = (contact.history || []).filter((event) => event.type === "comment" && event.mediaId);
  if (!commentEvents.length) return null;
  return commentEvents[commentEvents.length - 1].mediaId;
}

export function buildContentRoi(contacts = [], mediaLookup = {}) {
  const groups = new Map();
  for (const contact of contacts) {
    const mediaId = originMediaId(contact);
    if (!mediaId) continue;
    const group = groups.get(mediaId) ?? { mediaId, total: 0, byStage: {} };
    group.total += 1;
    const stage = contact.stage || "novo";
    group.byStage[stage] = (group.byStage[stage] || 0) + 1;
    groups.set(mediaId, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      conversionRate: group.total ? Math.round(((group.byStage.cliente || 0) / group.total) * 100) : 0,
      media: mediaLookup[group.mediaId] || null,
    }))
    .sort((a, b) => b.total - a.total);
}
