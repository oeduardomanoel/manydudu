function responseGapMinutes(history = []) {
  const sorted = [...history].sort((a, b) => new Date(a.at) - new Date(b.at));
  let lastOutgoing = null;
  let gap = null;
  for (const event of sorted) {
    if (event.type === "outgoing_rule") { lastOutgoing = event; continue; }
    if ((event.type === "message" || event.type === "postback") && lastOutgoing) {
      const diff = (new Date(event.at) - new Date(lastOutgoing.at)) / 60000;
      if (diff >= 0) gap = diff;
      lastOutgoing = null;
    }
  }
  return gap;
}

export function scoreContact(contact = {}, now = Date.now()) {
  const history = contact.history || [];
  let score = 0;

  if (contact.follower) score += 25;

  const gap = responseGapMinutes(history);
  if (gap != null) score += gap < 60 ? 25 : gap < 360 ? 15 : gap < 1440 ? 5 : 0;

  if (contact.lastInteractionAt) {
    const hours = (now - new Date(contact.lastInteractionAt).getTime()) / 3600000;
    score += hours < 24 ? 25 : hours < 168 ? 15 : hours < 720 ? 5 : 0;
  }

  score += history.length >= 5 ? 25 : history.length >= 3 ? 15 : history.length >= 1 ? 5 : 0;

  return Math.min(100, Math.round(score));
}

export function scoreLead(lead = {}, now = Date.now()) {
  let score = 0;

  const interest = String(lead.automationInterest ?? "").trim();
  score += interest.length >= 150 ? 35 : interest.length >= 60 ? 25 : interest.length >= 20 ? 12 : interest.length > 0 ? 5 : 0;

  const niches = Array.isArray(lead.niches) ? lead.niches : [];
  score += niches.length >= 3 ? 18 : niches.length === 2 ? 12 : niches.length === 1 ? 6 : 0;
  if (lead.nicheOther) score += 7;

  if (lead.createdAt) {
    const days = (now - new Date(lead.createdAt).getTime()) / 86400000;
    score += days < 1 ? 40 : days < 7 ? 28 : days < 30 ? 12 : 0;
  }

  return Math.min(100, Math.round(score));
}
