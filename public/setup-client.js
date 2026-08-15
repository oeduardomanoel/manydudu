const form = document.getElementById("setup-form");
const token = form.elements.token.value;

async function setupRequest(path, body) {
  const response = await fetch(`${path}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}

function wireTest(buttonId, statusId, path, fields) {
  document.getElementById(buttonId).addEventListener("click", async () => {
    const status = document.getElementById(statusId);
    status.className = "test-status";
    status.textContent = "Testando...";
    const payload = Object.fromEntries(fields.map((name) => [name, form.elements[name]?.value || ""]));
    try {
      const result = await setupRequest(path, payload);
      status.className = "test-status ok";
      status.textContent = result.message || "Conectado ✓";
    } catch (error) {
      status.className = "test-status fail";
      status.textContent = error.message;
    }
  });
}

wireTest("test-meta", "test-meta-status", "/api/setup/test-meta", ["metaAccessToken", "metaAppSecret", "instagramAccountId"]);
wireTest("test-supabase", "test-supabase-status", "/api/setup/test-supabase", ["supabaseUrl", "supabaseSecretKey"]);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("form-error");
  error.textContent = "";
  const payload = Object.fromEntries(new FormData(form));
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await setupRequest("/api/setup/complete", payload);
    form.hidden = true;
    const success = document.getElementById("setup-success");
    success.classList.add("visible");
    document.getElementById("setup-success-detail").textContent = result.metaVerifyToken
      ? `Cole este Verify Token no painel da Meta (Webhooks): ${result.metaVerifyToken}`
      : "Reinicie o ManyDudu pra senha e configuração entrarem em vigor.";
  } catch (submitError) {
    error.textContent = submitError.message;
    button.disabled = false;
  }
});

document.getElementById("setup-restart").addEventListener("click", async (event) => {
  event.target.disabled = true;
  event.target.textContent = "Reiniciando...";
  try {
    await setupRequest("/api/setup/restart", {});
  } catch {
    // o processo pode derrubar a conexão antes de responder — esperado
  }
  setTimeout(() => { window.location.href = "/"; }, 4000);
});
