import { randomUUID } from "node:crypto";
import { AppError } from "../util/errors.js";

const MAX_NICHES = 8;
const MAX_CUSTOM_NICHES = 12;
const MAX_NICHE_LENGTH = 40;
const MAX_BENEFITS = 5;
const MAX_BENEFIT_LENGTH = 100;

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

function normalizeSubtitle(input) {
  const subtitle = String(input ?? "").trim();
  if (subtitle.length > 200) throw new AppError("O subtítulo pode ter no máximo 200 caracteres.");
  return subtitle;
}

// "O que você vai receber" — chega do painel como lista (ou texto, um item por linha).
function normalizeBenefits(input) {
  const items = Array.isArray(input) ? input : String(input ?? "").split(/\r?\n/);
  const benefits = items.map((item) => String(item).trim()).filter(Boolean);
  if (benefits.length > MAX_BENEFITS) throw new AppError(`Use no máximo ${MAX_BENEFITS} itens em "o que você vai receber".`);
  if (benefits.some((item) => item.length > MAX_BENEFIT_LENGTH)) throw new AppError(`Cada item de "o que você vai receber" pode ter até ${MAX_BENEFIT_LENGTH} caracteres.`);
  return benefits;
}

export function isSafeCtaUrl(value) {
  try { return ["http:", "https:"].includes(new URL(String(value ?? "")).protocol); } catch { return false; }
}

// Botão opcional no fim da página de entrega (ex.: "Falar no WhatsApp"). Texto e link andam juntos.
function normalizeCta(input) {
  const ctaLabel = String(input.ctaLabel ?? "").trim();
  const ctaUrl = String(input.ctaUrl ?? "").trim();
  if (!ctaLabel && !ctaUrl) return { ctaLabel: "", ctaUrl: "" };
  if (!ctaLabel || !ctaUrl) throw new AppError("Preencha o texto e o link do botão final, ou deixe os dois em branco.");
  if (ctaLabel.length > 60) throw new AppError("O texto do botão final pode ter no máximo 60 caracteres.");
  if (ctaUrl.length > 500 || !isSafeCtaUrl(ctaUrl)) throw new AppError("O link do botão final precisa começar com https://");
  return { ctaLabel, ctaUrl };
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
    subtitle: normalizeSubtitle(input.subtitle),
    benefits: normalizeBenefits(input.benefits),
    ...normalizeCta(input),
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
    subtitle: normalizeSubtitle(input.subtitle),
    benefits: normalizeBenefits(input.benefits),
    ...normalizeCta(input),
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
  const whatsappDigits = whatsapp.replace(/\D/g, "").length;
  if (!whatsapp || whatsapp.length > 30 || whatsappDigits < 10 || whatsappDigits > 15) throw new AppError("Informe um WhatsApp válido, com DDD.");
  if (!email || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Informe um e-mail válido.");
  if (!niches.length) throw new AppError("Selecione ao menos um nicho.");
  const wantsOther = niches.some((niche) => niche.toLowerCase() === "outro");
  if (wantsOther && !nicheOther) throw new AppError("Descreva qual é o seu nicho.");
  if (nicheOther.length > 120) throw new AppError("Nicho muito longo.");
  if (!automationInterest || automationInterest.length > 600) throw new AppError("Conte qual automação te interessa (até 600 caracteres).");
  if (!input.consent) throw new AppError("É preciso concordar com o uso dos seus dados para continuar.");

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
