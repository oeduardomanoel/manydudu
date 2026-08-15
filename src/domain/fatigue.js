export function isFatigued(history = [], messageText, { windowMs = 24 * 60 * 60 * 1000, now = Date.now } = {}) {
  if (!messageText) return false;
  const cutoff = now() - windowMs;
  return (history || []).some((event) => event.type === "outgoing_rule" && event.text === messageText && new Date(event.at).getTime() >= cutoff);
}
