// Anúncios aparecem só pelos comentários: a API de mídia do Instagram não lista anúncio criado no
// Gerenciador (post "escuro"). Cada comentário em anúncio chega com ad_id/ad_title e a mídia
// comentada — é daí que sai a lista que o painel mostra pra criar automação no anúncio.
export function summarizeAds(contacts = {}, rules = []) {
  const ads = new Map();
  for (const contact of Object.values(contacts)) {
    for (const event of contact.history ?? []) {
      if (event.type !== "comment" || !event.adId) continue;
      const ad = ads.get(event.adId) ?? { adId: event.adId, adTitle: null, mediaId: null, originalMediaId: null, comments: 0, people: new Set(), lastCommentAt: null };
      ad.comments += 1;
      ad.people.add(contact.id);
      if (!ad.lastCommentAt || event.at > ad.lastCommentAt) {
        ad.lastCommentAt = event.at;
        ad.adTitle = event.adTitle || ad.adTitle;
        ad.mediaId = event.mediaId || ad.mediaId;
        ad.originalMediaId = event.originalMediaId || ad.originalMediaId;
      }
      ads.set(event.adId, ad);
    }
  }
  return [...ads.values()].map(({ people, ...ad }) => {
    const rule = rules.find((item) => item.mediaId && [ad.mediaId, ad.originalMediaId].includes(item.mediaId));
    return { ...ad, people: people.size, rule: rule ? { id: rule.id, name: rule.name, keyword: rule.keyword, enabled: rule.enabled } : null };
  }).sort((a, b) => String(b.lastCommentAt).localeCompare(String(a.lastCommentAt)));
}
