export const siteConfig = {
  productName: "DM Própria",
  price: "R$47",
  checkoutUrl: "#checkout",
  creatorName: "[NOME DO CRIADOR]",
  creatorInstagram: "@[INSTAGRAM]",
  creatorFollowers: "[NÚMERO DE SEGUIDORES]",
  vslUrl: "",
  guaranteeDays: 7,
  legal: {
    terms: "#",
    privacy: "#",
    contact: "#",
  },
};

export const track = (event: string, data: Record<string, unknown> = {}) => {
  window.dispatchEvent(new CustomEvent("dmpropria:analytics", { detail: { event, ...data } }));
  const analyticsWindow = window as typeof window & { dataLayer?: unknown[]; fbq?: (...args: unknown[]) => void };
  analyticsWindow.dataLayer?.push({ event, ...data });
  analyticsWindow.fbq?.("trackCustom", event, data);
};
