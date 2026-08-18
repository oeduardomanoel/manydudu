const THEME_FILES = { azul: "/theme-azul.css", verde: "/theme-verde.css", roxo: "/theme-roxo.css" };

(async () => {
  try {
    const branding = await fetch("/api/branding").then((response) => response.json());
    if (branding.brandName) {
      document.getElementById("page-title").textContent = `${branding.brandName} · Entrar`;
      document.getElementById("brand-name").textContent = branding.brandName;
    }
    if (branding.brandLogoUrl) {
      const img = document.createElement("img");
      img.src = branding.brandLogoUrl;
      img.alt = "";
      img.className = "brand-mark";
      document.getElementById("brand-mark").replaceWith(img);
    }
    if (THEME_FILES[branding.brandTemplate]) document.getElementById("theme-link").href = THEME_FILES[branding.brandTemplate];
  } catch { /* branding é só cosmético — login funciona igual sem ela */ }
})();

const form = document.getElementById("login-form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("form-error");
  error.textContent = "";
  const data = new FormData(form);
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: data.get("user"), password: data.get("password") }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
    window.location.href = "/";
  } catch (submitError) {
    error.textContent = submitError.message;
    button.disabled = false;
  }
});
