const form = document.getElementById("lead-form");
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.getElementById("form-error");
    error.textContent = "";
    const data = new FormData(form);
    const payload = {
      slug: data.get("slug"),
      name: data.get("name"),
      whatsapp: data.get("whatsapp"),
      email: data.get("email"),
      niches: data.getAll("niches"),
      nicheOther: data.get("nicheOther"),
      automationInterest: data.get("automationInterest"),
      company: data.get("company"),
    };
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const response = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar. Tente novamente.");
      window.location.reload();
    } catch (submitError) {
      error.textContent = submitError.message;
      button.disabled = false;
    }
  });
}
