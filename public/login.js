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
