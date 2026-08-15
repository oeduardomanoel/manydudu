const STORAGE_KEY = "manydudu_onboarding_dismissed";

export function checkOnboarding(rules) {
  const card = document.getElementById("onboarding-card");
  if (!card) return;
  const dismissed = localStorage.getItem(STORAGE_KEY) === "1";
  card.hidden = dismissed || rules.length > 0;
}

document.getElementById("onboarding-dismiss")?.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEY, "1");
  document.getElementById("onboarding-card").hidden = true;
});
