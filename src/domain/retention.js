const DAY_MS = 86_400_000;

// Contacts and leads are kept forever today, with no expiry — this flags records past
// a configurable inactivity window so an admin can decide what to purge (via the
// existing DELETE /api/contacts/:id and /api/leads/:id routes), instead of the app
// silently retaining personal data with no end in sight.
export function isStale(record, { maxInactiveDays = 365, now = Date.now() } = {}) {
  const last = new Date(record?.lastInteractionAt ?? record?.createdAt ?? 0).getTime();
  if (Number.isNaN(last)) return true;
  return now - last > maxInactiveDays * DAY_MS;
}

export function findStale(records, options = {}) {
  return records.filter((record) => isStale(record, options));
}
