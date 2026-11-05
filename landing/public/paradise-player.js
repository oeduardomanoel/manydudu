(function() {
    const video = document.getElementById('paradisePlayer_1787505651550');
    const container = document.getElementById('paradisePlayer_1787505651550Container');
    const playerWrapper = document.getElementById('paradisePlayer_1787505651550Wrapper');
    const muteOverlay = document.getElementById('paradisePlayer_1787505651550MuteOverlay');
    const endCta = document.getElementById('paradisePlayer_1787505651550EndCta');
    const endCtaButton = document.getElementById('paradisePlayer_1787505651550EndCtaButton');

    if (!video) { console.error('Paradise Player: Video element #paradisePlayer_1787505651550 not found.'); return; }

    // bloqueado via CSP como atributo inline oncontextmenu="" — mesmo efeito, via listener
    video.addEventListener('contextmenu', (event) => event.preventDefault());

    // --- Play/Pause on video click ---
    if (!false) {
        video.addEventListener('click', () => {
            if (video.paused) video.play();
            else video.pause();
        });
    }

    // --- Configuração Inicial ---
    video.playbackRate = 1;

    // --- Lógica de Autoplay Inteligente ---
    video.muted = true;
    let playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => { /* Autoplay was prevented. User interaction needed. */ });
    }
    if (muteOverlay) {
        const unmuteHandler = () => {
            video.muted = false;
            video.currentTime = 0;
            video.play();
            muteOverlay.style.opacity = '0';
            setTimeout(() => { muteOverlay.style.display = 'none'; }, 300);
            if (window.paradiseTracker && window.paradiseTracker.send) {
                 window.paradiseTracker.send('unmute');
                 window.paradiseTracker.send('play'); // Play is now counted on unmute
            }
        };
        muteOverlay.addEventListener('click', unmuteHandler, { once: true });
        muteOverlay.addEventListener('touchend', unmuteHandler, { once: true });
    }

    // --- Lógica dos Controles Personalizados ---


    // --- Lógica de Progresso Inteligente (Fase 3: Preditivo) ---



    // --- Lógica do CTA ---
    // Quando o vídeo termina, some com o overlay de som (se a pessoa nunca clicou pra
    // ativar) e mostra o botão pra ir direto pro checkout.
    video.addEventListener('ended', () => {
        if (muteOverlay) muteOverlay.style.display = 'none';
        if (endCta) endCta.style.display = 'flex';
        window.dispatchEvent(new CustomEvent('dmpropria:analytics', { detail: { event: 'vsl_completed' } }));
    });
    if (endCtaButton) {
        endCtaButton.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('dmpropria:analytics', { detail: { event: 'checkout_click', placement: 'vsl_end_cta' } }));
        });
    }

    // --- Lógica de "Continuar de onde parou" ---


    // --- Lógica de Analytics ---

})();
