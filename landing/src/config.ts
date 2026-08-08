export const siteConfig = {
  productName: "DM Própria",
  price: "R$47",
  checkoutUrl: "#checkout",
  creatorName: "Eduardo Santos",
  creatorInstagram: "@eduardosantos.ia",
  creatorInstagramUrl: "https://instagram.com/eduardosantos.ia",
  creatorFollowers: "Perfil real no Instagram",
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
