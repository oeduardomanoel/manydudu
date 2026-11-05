export const siteConfig = {
  productName: "DM Própria",
  price: "R$47",
  priceAfter: "R$97",
  // Ajuste para o momento real em que a página vai ao ar — o preço sobe pra
  // priceAfter assim que esse horário passar, igual pra todo mundo que visitar
  // a página (não é "72 horas a partir de quando cada pessoa entra").
  priceDeadline: "2026-08-26T00:00:00-03:00",
  checkoutUrl: "#checkout",
  creatorName: "Eduardo Santos",
  creatorInstagram: "@eduardosantos.ia",
  creatorInstagramUrl: "https://instagram.com/eduardosantos.ia",
  creatorFollowers: "Perfil real no Instagram",
  vslUrl: "",
  // Player Paradise com o vídeo da VSL. O <script> original vem como bloco inline —
  // isso é bloqueado pela CSP (script-src 'self') quando servido em produção pelo
  // servidor do ManyDudu, então a lógica mora em /paradise-player.js (mesma origem,
  // passa na CSP sem precisar afrouxar nada) e aqui só referenciamos o arquivo.
  vslEmbedCode: `
<div id="paradisePlayer_1787505651550Container" class="paradise-player-container" style="position: relative; width: 100%; max-width: 420px; margin: 20px auto;">
    <div id="paradisePlayer_1787505651550Wrapper" style="position: relative; width: 100%; padding-bottom: 177.78%; background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
        <video
            id="paradisePlayer_1787505651550"
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
            playsinline
            webkit-playsinline
            preload="auto"
        >
            <source src="${import.meta.env.BASE_URL}dm-propria-vsl.mp4" type="video/mp4">
            Seu navegador não suporta vídeos HTML5.
        </video>
    <div id="paradisePlayer_1787505651550MuteOverlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background: #00000080; cursor: pointer; z-index: 20; backdrop-filter: blur(2px);">
        <div id="paradisePlayer_1787505651550MuteButton" class="paradise-mute-bounce" style="background: #c26700; padding: clamp(1.2rem, 5vw, 2rem) clamp(1.5rem, 7vw, 3rem); border-radius: 12px; text-align: center; color: white; transition: transform 0.3s ease; --animation-intensity: 1; box-shadow: 0 8px 25px rgba(0,0,0,0.3); max-width: 90vw; box-sizing: border-box;">
            <div style="font-size: clamp(0.9rem, 2.5vw, 1.1rem); font-weight: 700; margin-bottom: 0.5rem;">Seu vídeo já começou!</div>
            <div style="margin-bottom: 0.6rem;"><img src="https://i.postimg.cc/2j9d2jbv/R.png" alt="Unmute" style="width:clamp(2.5rem, 8vw, 3.5rem); height:clamp(2.5rem, 8vw, 3.5rem); filter: brightness(0) invert(1); display: inline-block;"></div>
            <div style="font-size: clamp(0.8rem, 2.2vw, 1rem); font-weight: 500; opacity: 0.95;">Clique para ativar o som</div>
        </div>
    </div>
    <div id="paradisePlayer_1787505651550EndCta" style="position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: rgba(0,0,0,0.85); z-index: 25; padding: 24px; text-align: center;">
        <div style="color: #fff; font-family: Sora, sans-serif; font-weight: 700; font-size: clamp(1rem, 4vw, 1.25rem); max-width: 320px;">Gostou? Vamos montar a sua agora</div>
        <a href="#checkout" id="paradisePlayer_1787505651550EndCtaButton" style="display: inline-flex; align-items: center; gap: 8px; padding: 15px 30px; border-radius: 999px; background: linear-gradient(135deg,#FF7138,#F04400); color: #080808; font-family: Sora, sans-serif; font-weight: 800; font-size: 0.95rem; text-decoration: none; box-shadow: 0 0 24px rgba(255,90,31,.45);">Quero montar a minha →</a>
    </div>
    </div>
</div>
<style>
    #paradisePlayer_1787505651550::-webkit-media-controls, #paradisePlayer_1787505651550::-webkit-media-controls-enclosure { display: none !important; }

@keyframes paradise-fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes paradise-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes paradise-glow { 0%, 100% { box-shadow: 0 0 10px #8b5cf650; } 50% { box-shadow: 0 0 20px #8b5cf680, 0 0 30px #8b5cf660; } }
@keyframes paradise-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
@keyframes paradise-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }

@keyframes paradise-mute-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(calc(-10px * var(--animation-intensity))); } }
@keyframes paradise-mute-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(calc(1 + 0.05 * var(--animation-intensity))); } }
@keyframes paradise-mute-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(calc(-5px * var(--animation-intensity))); } 75% { transform: translateX(calc(5px * var(--animation-intensity))); } }
@keyframes paradise-mute-glow { 0%, 100% { box-shadow: 0 0 calc(10px * var(--animation-intensity)) #c2670050; } 50% { box-shadow: 0 0 calc(20px * var(--animation-intensity)) #c2670080, 0 0 calc(30px * var(--animation-intensity)) #c2670060; } }
@keyframes paradise-mute-scale { 0%, 100% { transform: scale(1); } 50% { transform: scale(calc(1 + 0.1 * var(--animation-intensity))); } }
@keyframes paradise-mute-rotate { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.paradise-player-container * { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
</style>
<script src="${import.meta.env.BASE_URL}paradise-player.js"></script>
`,
  guaranteeDays: 7,
  legal: {
    terms: "#",
    privacy: "#",
    contact: "#",
  },
};

export const track = (event: string, data: Record<string, unknown> = {}) => {
  window.dispatchEvent(new CustomEvent("dmpropria:analytics", { detail: { event, ...data } }));
  const analyticsWindow = window as typeof window & { dataLayer?: unknown[]; fbq?: (...args: unknown[]) => void };
  analyticsWindow.dataLayer?.push({ event, ...data });
  analyticsWindow.fbq?.("trackCustom", event, data);
};
