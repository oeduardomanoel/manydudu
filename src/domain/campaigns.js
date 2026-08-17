import { randomUUID } from "node:crypto";
import { AppError } from "../util/errors.js";

const MAX_NICHES = 8;
const MAX_CUSTOM_NICHES = 12;
const MAX_NICHE_LENGTH = 40;

export const DEFAULT_NICHES = ["Estética", "Saúde e bem-estar", "Educação", "Imobiliário", "Coach / Mentoria", "E-commerce", "Serviços locais", "Outro"];
export const DEFAULT_INTEREST_LABEL = "Qual automação te interessa agora?";

function normalizeNiches(input) {
  if (!Array.isArray(input) || !input.length) return [...DEFAULT_NICHES];
  const niches = [...new Set(input.map((item) => String(item).trim()).filter(Boolean))]
    .slice(0, MAX_CUSTOM_NICHES)
    .map((niche) => niche.slice(0, MAX_NICHE_LENGTH));
  if (!niches.some((niche) => niche.toLowerCase() === "outro")) niches.push("Outro");
  return niches;
}

function normalizeInterestLabel(input) {
  const label = String(input ?? "").trim();
  if (!label) return DEFAULT_INTEREST_LABEL;
  if (label.length > 200) throw new AppError("A pergunta final pode ter no máximo 200 caracteres.");
  return label;
}

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
  if (!title || title.length > 140) throw new AppError("Título é obrigatório (até 140 caracteres).");
  const slug = slugify(input.slug || title);
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) throw new AppError("Slug inválido. Use letras, números e hífen (mínimo 3 caracteres).");
  const contentHtml = String(input.contentHtml ?? "").trim();
  if (!contentHtml) throw new AppError("O conteúdo da entrega é obrigatório.");
  if (contentHtml.length > 50_000) throw new AppError("Conteúdo muito longo.");
  return {
    id: randomUUID(),
    slug,
    title,
    contentHtml,
    niches: normalizeNiches(input.niches),
    interestLabel: normalizeInterestLabel(input.interestLabel),
    active: input.active !== false,
    createdAt: new Date().toISOString(),
  };
}

export function updateCampaign(existing, input) {
  if (!existing) throw new AppError("Campanha não encontrada.");
  const title = String(input.title ?? "").trim();
  if (!title || title.length > 140) throw new AppError("Título é obrigatório (até 140 caracteres).");
  const contentHtml = String(input.contentHtml ?? "").trim();
  if (!contentHtml) throw new AppError("O conteúdo da entrega é obrigatório.");
  if (contentHtml.length > 50_000) throw new AppError("Conteúdo muito longo.");
  return {
    ...existing,
    title,
    contentHtml,
    niches: normalizeNiches(input.niches),
    interestLabel: normalizeInterestLabel(input.interestLabel),
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

  if (!name || name.length > 120) throw new AppError("Informe seu nome.");
  if (!whatsapp || whatsapp.length > 30) throw new AppError("Informe um WhatsApp válido.");
  if (!email || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Informe um e-mail válido.");
  if (!niches.length) throw new AppError("Selecione ao menos um nicho.");
  const wantsOther = niches.some((niche) => niche.toLowerCase() === "outro");
  if (wantsOther && !nicheOther) throw new AppError("Descreva qual é o seu nicho.");
  if (nicheOther.length > 120) throw new AppError("Nicho muito longo.");
  if (!automationInterest || automationInterest.length > 600) throw new AppError("Conte qual automação te interessa (até 600 caracteres).");

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
