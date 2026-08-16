const DEFAULT_API_VERSION = "v23.0";

export async function sendConversionEvent({ pixelId, accessToken, event, fetcher = fetch, apiVersion = DEFAULT_API_VERSION, timeoutMs = 8000 }) {
  const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(pixelId)}/events`;
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [event], access_token: accessToken }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || `Meta respondeu ${response.status}.`);
  return result;
}
