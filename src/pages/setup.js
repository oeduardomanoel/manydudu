import { escapeHtml } from "../util/html.js";

export function renderSetupPage(token) {
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ManyDudu · Configuração inicial</title>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/theme.css">
<style>
body{display:grid;place-items:center;min-height:100vh;padding:24px}
.setup-card{width:min(560px,100%);padding:36px;border:1px solid var(--strong);border-radius:var(--radius);background:linear-gradient(145deg,#0d0d0c,#090908);box-shadow:var(--shadow)}
.setup-card .brand{margin-bottom:8px;padding:0}
.setup-card h1{margin:18px 0 6px;font-size:24px}
.setup-card p.lead{margin:0 0 28px;color:var(--muted);font-size:13px}
.setup-step{margin-bottom:26px;padding-bottom:26px;border-bottom:1px solid var(--line)}
.setup-step:last-of-type{border-bottom:0}
.setup-step h2{margin:0 0 4px;font-size:14px}
.setup-step .hint{margin:0 0 14px;color:var(--muted);font-size:11px;line-height:1.5}
.setup-card label{display:grid;gap:6px;margin-bottom:12px;font-size:11px;font-weight:600;color:#dce6f7}
.setup-card input{width:100%;border:1px solid var(--line);border-radius:8px;padding:11px;background:#12110f;color:var(--text);font-size:13px}
.setup-card input:focus{border-color:#ff7138;box-shadow:0 0 0 3px #ff5a1f1c;outline:0}
.setup-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.test-row{display:flex;align-items:center;gap:10px;margin-top:-2px}
.test-row button{border:1px solid var(--line);border-radius:7px;padding:8px 12px;background:var(--surface2);color:var(--muted);font-size:11px;cursor:pointer}
.test-row .test-status{font-size:11px;color:var(--muted)}
.test-row .test-status.ok{color:var(--green)}
.test-row .test-status.fail{color:var(--danger)}
.setup-card .wide{width:100%;margin-top:4px}
.form-error{min-height:16px;margin:12px 0 0;color:var(--danger);font-size:11px;text-align:center}
.setup-success{display:none;text-align:center}
.setup-success.visible{display:block}
.setup-success p{color:var(--muted);font-size:13px;margin:12px 0 22px}
</style>
</head>
<body>
  <div class="grain"></div>
  <div class="setup-card">
    <a class="brand" href="#"><span>MD</span> manydudu</a>
    <h1>Configuração inicial</h1>
    <p class="lead">Isso só aparece uma vez — assim que você salvar e reiniciar, esse link nunca mais funciona.</p>
    <form id="setup-form">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <div class="setup-step">
        <h2>1. Login do painel</h2>
        <p class="hint">É o usuário e senha que você vai usar pra entrar no ManyDudu daqui pra frente.</p>
        <label>Usuário<input name="adminUser" value="eduardo" required maxlength="60"></label>
        <label>Senha<input name="adminPassword" type="password" required minlength="8" maxlength="200" autocomplete="new-password"></label>
      </div>
      <div class="setup-step">
        <h2>2. Instagram (Meta for Developers)</h2>
        <p class="hint">Do painel do seu app na Meta: token de acesso de longa duração, App Secret e o ID da conta profissional do Instagram.</p>
        <label>Token de acesso<input name="metaAccessToken" required></label>
        <div class="setup-row">
          <label>App Secret<input name="metaAppSecret" required></label>
          <label>ID da conta do Instagram<input name="instagramAccountId" required></label>
        </div>
        <div class="test-row"><button type="button" id="test-meta">Testar credenciais</button><span class="test-status" id="test-meta-status"></span></div>
      </div>
      <div class="setup-step">
        <h2>3. Banco de dados (opcional)</h2>
        <p class="hint">Sem isso, o ManyDudu guarda tudo num arquivo local — funciona, mas não sobrevive a uma reinstalação do zero. Com Supabase, seus dados ficam seguros na nuvem.</p>
        <label>URL do projeto Supabase<input name="supabaseUrl" placeholder="https://xxxxx.supabase.co"></label>
        <label>Secret key<input name="supabaseSecretKey" placeholder="sb_secret_..."></label>
        <div class="test-row"><button type="button" id="test-supabase">Testar conexão</button><span class="test-status" id="test-supabase-status"></span></div>
      </div>
      <button class="primary wide" type="submit">Salvar e concluir →</button>
      <p class="form-error" id="form-error" role="alert"></p>
    </form>
    <div class="setup-success" id="setup-success">
      <h1>Tudo salvo ✓</h1>
      <p id="setup-success-detail"></p>
      <button class="primary wide" id="setup-restart">Reiniciar agora →</button>
    </div>
  </div>
  <script src="/setup-client.js"></script>
</body>
</html>`;
}
