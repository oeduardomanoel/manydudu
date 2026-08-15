import { randomUUID } from "node:crypto";

const MAX_NICHES = 8;

const DIACRITICS = /[̀-ͯ]/g;

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD").replace(DIACRITICS, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function createCampaign(input) {
  const title = String(input.title ?? "").trim();
  if (!title || title.length > 140) throw new Error("Título é obrigatório (até 140 caracteres).");
  const slug = slugify(input.slug || title);
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) throw new Error("Slug inválido. Use letras, números e hífen (mínimo 3 caracteres).");
  const contentHtml = String(input.contentHtml ?? "").trim();
  if (!contentHtml) throw new Error("O conteúdo da entrega é obrigatório.");
  if (contentHtml.length > 50_000) throw new Error("Conteúdo muito longo.");
  return {
    id: randomUUID(),
    slug,
    title,
    contentHtml,
    active: input.active !== false,
    createdAt: new Date().toISOString(),
  };
}

export function updateCampaign(existing, input) {
  if (!existing) throw new Error("Campanha não encontrada.");
  const title = String(input.title ?? "").trim();
  if (!title || title.length > 140) throw new Error("Título é obrigatório (até 140 caracteres).");
  const contentHtml = String(input.contentHtml ?? "").trim();
  if (!contentHtml) throw new Error("O conteúdo da entrega é obrigatório.");
  if (contentHtml.length > 50_000) throw new Error("Conteúdo muito longo.");
  return {
    ...existing,
    title,
    contentHtml,
    active: input.active !== false,
    updatedAt: new Date().toISOString(),
  };
}

export function createLead(input, campaignSlug) {
  const name = String(input.name ?? "").trim();
  const whatsapp = String(input.whatsapp ?? "").trim();
  const email = String(input.email ?? "").trim();
  const niches = Array.isArray(input.niches)
    ? [...new Set(input.niches.map((item) => String(item).trim()).filter(Boolean))].slice(0, MAX_NICHES)
    : [];
  const nicheOther = String(input.nicheOther ?? "").trim();
  const automationInterest = String(input.automationInterest ?? "").trim();

  if (!name || name.length > 120) throw new Error("Informe seu nome.");
  if (!whatsapp || whatsapp.length > 30) throw new Error("Informe um WhatsApp válido.");
  if (!email || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  if (!niches.length) throw new Error("Selecione ao menos um nicho.");
  const wantsOther = niches.some((niche) => niche.toLowerCase() === "outro");
  if (wantsOther && !nicheOther) throw new Error("Descreva qual é o seu nicho.");
  if (nicheOther.length > 120) throw new Error("Nicho muito longo.");
  if (!automationInterest || automationInterest.length > 600) throw new Error("Conte qual automação te interessa (até 600 caracteres).");

  return {
    id: randomUUID(),
    campaignSlug,
    name,
    whatsapp,
    email,
    niches,
    nicheOther: wantsOther ? nicheOther : "",
    automationInterest,
    createdAt: new Date().toISOString(),
  };
}
