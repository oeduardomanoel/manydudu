import { AppError } from "../util/errors.js";

const FORMAT = "manydudu-automation-package";
const VERSION = 1;

const RULE_FIELDS = ["name", "keyword", "match", "reply", "publicReplies", "responseMode", "enabled",
  "followUpEnabled", "followUpText", "followUpUrl", "requireFollow", "followPrompt", "deliveryStyle", "buttonTitle",
  "initialQuickReplyEnabled", "initialQuickReplyTitle", "profileUrl", "followButtonTitle", "confirmFollowTitle"];
const CAMPAIGN_FIELDS = ["title", "contentHtml", "active"];

export function exportPackage(rule, campaign = null) {
  const ruleData = Object.fromEntries(RULE_FIELDS.map((key) => [key, rule[key]]));
  const campaignData = campaign ? Object.fromEntries(CAMPAIGN_FIELDS.map((key) => [key, campaign[key]])) : null;
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), rule: ruleData, campaign: campaignData };
}

export function parsePackage(raw) {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new AppError("Arquivo inválido — não é um JSON legível.");
  }
  if (!data || typeof data !== "object") throw new AppError("Arquivo inválido.");
  if (data.format !== FORMAT) throw new AppError("Esse arquivo não é um pacote de automação do ManyDudu.");
  if (!data.rule || typeof data.rule !== "object") throw new AppError("Pacote sem automação.");
  const campaign = data.campaign && typeof data.campaign === "object" ? data.campaign : null;
  return { rule: data.rule, campaign };
}
