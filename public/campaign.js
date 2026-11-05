const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// (11) 91234-5678 enquanto digita. Número internacional (começando com +) fica como a pessoa escreveu.
function maskWhatsapp(value) {
  if (value.trim().startsWith("+")) return value;
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function validateStep(step, form) {
  const name = step.querySelector("[name=name]");
  if (name && !name.value.trim()) return [name, "Escreva seu nome pra continuar."];
  const whatsapp = step.querySelector("[name=whatsapp]");
  if (whatsapp) {
    const digits = whatsapp.value.replace(/\D/g, "").length;
    if (digits < 10 || digits > 15) return [whatsapp, "Confira o WhatsApp — precisa ter DDD + número."];
  }
  const email = step.querySelector("[name=email]");
  if (email && !EMAIL_PATTERN.test(email.value.trim())) return [email, "Confira o e-mail — parece que falta alguma coisa."];
  if (step.querySelector("[name=niches]")) {
    const checked = [...form.querySelectorAll("[name=niches]:checked")];
    if (!checked.length) return [step.querySelector("[name=niches]"), "Escolha pelo menos uma opção."];
    const other = form.elements.nicheOther;
    if (checked.some((input) => input.value.toLowerCase() === "outro") && !other.value.trim()) return [other, "Conte qual é o seu nicho."];
  }
  const interest = step.querySelector("[name=automationInterest]");
  if (interest && !interest.value.trim()) return [interest, "Responda essa última pergunta pra liberar o conteúdo."];
  const consent = step.querySelector("[name=consent]");
  if (consent && !consent.checked) return [consent, "Marque a caixa de concordância pra continuar."];
  return null;
}

function setupLeadForm(form) {
  const card = document.getElementById("gate-card");
  const steps = [...form.querySelectorAll(".gate-step")];
  const error = document.getElementById("form-error");
  const progress = document.getElementById("gate-progress");
  const back = form.querySelector(".gate-back");
  const submit = form.querySelector("button[type=submit]");
  const whatsapp = form.elements.whatsapp;
  const other = form.elements.nicheOther;
  let current = 0;

  form.noValidate = true;
  form.classList.add("is-stepped");

  const showStep = (index, { focus = true } = {}) => {
    current = index;
    steps.forEach((step, stepIndex) => { step.hidden = stepIndex !== index; });
    card.classList.toggle("is-past-intro", index > 0);
    progress.hidden = false;
    progress.querySelector("i").style.width = `${((index + 1) / steps.length) * 100}%`;
    progress.querySelector("span").textContent = `Pergunta ${index + 1} de ${steps.length}`;
    back.hidden = index === 0;
    submit.textContent = index === steps.length - 1 ? "Liberar conteúdo →" : "Continuar →";
    error.textContent = "";
    if (focus) steps[index].querySelector("input:not([type=checkbox]):not([hidden]),textarea")?.focus({ preventScroll: true });
  };

  whatsapp.addEventListener("input", () => { whatsapp.value = maskWhatsapp(whatsapp.value); });
  form.addEventListener("change", (event) => {
    if (event.target.name !== "niches") return;
    const wantsOther = [...form.querySelectorAll("[name=niches]:checked")].some((input) => input.value.toLowerCase() === "outro");
    other.hidden = !wantsOther;
    if (wantsOther && event.target.value.toLowerCase() === "outro" && event.target.checked) other.focus();
  });
  form.addEventListener("input", (event) => { event.target.removeAttribute("aria-invalid"); error.textContent = ""; });
  back.addEventListener("click", () => showStep(Math.max(0, current - 1)));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const problem = validateStep(steps[current], form);
    if (problem) {
      const [field, message] = problem;
      error.textContent = message;
      field.setAttribute("aria-invalid", "true");
      if (field.type !== "checkbox") field.focus();
      return;
    }
    if (current < steps.length - 1) { showStep(current + 1); return; }
    if (form.dataset.preview) { error.textContent = "Pré-visualização — o envio fica desativado aqui."; return; }

    const data = new FormData(form);
    const payload = {
      slug: data.get("slug"),
      name: data.get("name"),
      whatsapp: data.get("whatsapp"),
      email: data.get("email"),
      niches: data.getAll("niches"),
      nicheOther: data.get("nicheOther"),
      automationInterest: data.get("automationInterest"),
      consent: data.get("consent") === "on",
      company: data.get("company"),
    };
    submit.disabled = true;
    submit.textContent = "Liberando…";
    try {
      const response = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar. Tente novamente.");
      card.classList.add("is-done");
      card.insertAdjacentHTML("beforeend", '<div class="gate-success" role="status"><b>✓</b><strong>Pronto! Conteúdo liberado.</strong><span>Abrindo pra você…</span></div>');
      setTimeout(() => window.location.reload(), 900);
    } catch (submitError) {
      error.textContent = submitError.message;
      submit.disabled = false;
      submit.textContent = "Liberar conteúdo →";
    }
  });

  showStep(0, { focus: false });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navegador interno do Instagram às vezes bloqueia a Clipboard API — cai pro jeito antigo
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

// Botão "Copiar" em cada bloco de prompt (e citação) da página de entrega.
function setupCopyButtons(content) {
  for (const block of content.querySelectorAll("pre, blockquote")) {
    const wrapper = document.createElement("div");
    wrapper.className = "gate-copy-block";
    block.replaceWith(wrapper);
    wrapper.append(block);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gate-copy";
    button.textContent = "Copiar";
    button.addEventListener("click", async () => {
      const ok = await copyText(block.innerText.trim());
      button.textContent = ok ? "Copiado ✓" : "Não deu — selecione e copie";
      button.classList.toggle("is-copied", ok);
      setTimeout(() => { button.textContent = "Copiar"; button.classList.remove("is-copied"); }, 2000);
    });
    wrapper.append(button);
  }
}

const leadForm = document.getElementById("lead-form");
if (leadForm) setupLeadForm(leadForm);
const content = document.querySelector(".gate-content");
if (content) setupCopyButtons(content);
