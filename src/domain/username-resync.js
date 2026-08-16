const LEGACY_PLACEHOLDER = "instagram";
const CONSENT_EVENT_TYPES = new Set(["message", "postback", "outgoing"]);

// Contacts created before the username fix stored the literal string "instagram" (or
// "Instagram") as a fake placeholder, which now renders as if it were a real handle.
export function isLegacyPlaceholderUsername(username) {
  return typeof username === "string" && username.trim().toLowerCase() === LEGACY_PLACEHOLDER;
}

// Per Meta's Instagram Messaging docs, a profile lookup (GET /{igsid}) only succeeds once
// the person has messaged the business (or used an icebreaker/persistent menu) — commenting
// alone never grants that consent, so only contacts with a messaging-type event are worth
// a live API retry.
export function hasMessagingConsent(history = []) {
  return (history || []).some((event) => CONSENT_EVENT_TYPES.has(event.type));
}

export function planUsernameResync(contacts = []) {
  return contacts.map((contact) => {
    const clearLegacy = isLegacyPlaceholderUsername(contact.username);
    const isUnknown = clearLegacy || !contact.username;
    return { id: contact.id, clearLegacy, attemptLookup: isUnknown && hasMessagingConsent(contact.history) };
  });
}
