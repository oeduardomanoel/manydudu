export function paginateActivity(activity = [], { limit = 30, offset = 0, status, ruleId } = {}) {
  const filtered = activity.filter((event) =>
    (!status || event.status === status) &&
    (!ruleId || event.ruleId === ruleId));
  const boundedLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
  const boundedOffset = Math.max(Number(offset) || 0, 0);
  return {
    total: filtered.length,
    items: filtered.slice(boundedOffset, boundedOffset + boundedLimit),
    limit: boundedLimit,
    offset: boundedOffset,
  };
}
