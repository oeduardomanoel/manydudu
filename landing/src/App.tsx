import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { siteConfig, track } from "./config";

type IconName = "check" | "play" | "message" | "code" | "spark" | "shield" | "arrow" | "menu" | "close";

const iconPaths: Record<IconName, ReactElement> = {
  check: <path d="m5 12 4 4L19 6" />,
  play: <path d="m9 7 8 5-8 5V7Z" />,
  message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" /><path d="M8 9h8M8 13h5" /></>,
  code: <><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></>,
  spark: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" /><path d="m19 15 .6 1.9 1.9.6-1.9.6L19 21l-.6-1.9-1.9-.6 1.9-.6L19 15Z" /></>,
  shield: <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Zm-3-10 2 2 4-4" />,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
};

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}

function CheckoutButton({ children, dark = false, className = "" }: { children: ReactNode; dark?: boolean; className?: string }) {
  return <a href={siteConfig.checkoutUrl} onClick={() => track("checkout_click", { placement: String(children) })} className={`cta ${dark ? "cta-dark" : ""} ${className}`}>{children}<Icon name="arrow" /></a>;
}

function SectionTitle({ eyebrow, title, text, light = false }: { eyebrow?: string; title: string; text?: string; light?: boolean }) {
  return <div className={`section-heading ${light ? "text-paper" : ""}`}>
    {eyebrow && <span className="eyebrow">{eyebrow}</span>}
    <h2>{title}</h2>
    {text && <p className={light ? "text-white/65" : "text-graphite"}>{text}</p>}
  </div>;
}

const demoBuyers = ["Marina", "Rafael", "Camila", "Lucas", "Fernanda", "André"];

function DemoPurchaseToast() {
  const [visible, setVisible] = useState(false);
  const [buyerIndex, setBuyerIndex] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = () => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * .09);
      gain.gain.linearRampToValueAtTime(.045, now + index * .09 + .015);
      gain.gain.exponentialRampToValueAtTime(.001, now + index * .09 + .16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * .09);
      oscillator.stop(now + index * .09 + .18);
    });
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let hideTimer: number | undefined;
    const enableSound = () => {
      audioContextRef.current ??= new AudioContext();
      void audioContextRef.current.resume();
    };
    const show = () => {
      setBuyerIndex((current) => (current + 1) % demoBuyers.length);
      setVisible(true);
      playNotificationSound();
      hideTimer = window.setTimeout(() => setVisible(false), 5200);
    };
    window.addEventListener("pointerdown", enableSound, { once: true });
    const firstTimer = window.setTimeout(show, 6500);
    const interval = window.setInterval(show, 28000);
    return () => { window.removeEventListener("pointerdown", enableSound); window.clearTimeout(firstTimer); window.clearTimeout(hideTimer); window.clearInterval(interval); void audioContextRef.current?.close(); };
  }, []);

  if (!import.meta.env.DEV) return null;
  return <aside className={`purchase-toast ${visible ? "is-visible" : ""}`} aria-live="polite" aria-hidden={!visible}>
    <span className="purchase-toast-icon"><Icon name="check" /></span>
    <div><small>Notificação</small><strong>{demoBuyers[buyerIndex]} comprou a DM Própria</strong><p>Acesso liberado agora</p></div>
  </aside>;
}

const modules = [
  ["Entendendo o que vamos construir", ["Demonstração do resultado final", "Como a automação funciona", "Requisitos necessários", "Organização do projeto"]],
  ["Preparando a máquina", ["Ferramentas necessárias", "Instalação do ambiente", "Organização dos arquivos", "Primeiros testes"]],
  ["Construindo com IA gratuita", ["Como utilizar a IA dentro da ferramenta", "Comandos utilizados", "Criação da estrutura", "Ajustes durante o processo"]],
  ["Criando o frontend", ["Construção da interface", "Campos da automação", "Personalização visual", "Adaptação para seu uso"]],
  ["Conectando ao Instagram", ["Preparação da conta", "Permissões necessárias", "Configuração da integração", "Teste da conexão"]],
  ["Colocando para funcionar", ["Definição da palavra", "Configuração da mensagem", "Adição do link", "Primeiro comentário real", "Validação da DM"]],
  ["Mantendo o sistema ativo", ["Como iniciar novamente", "Cuidados com o acesso", "Manutenção da integração", "Erros mais comuns"]],
] as const;

const faqs = [
  ["Preciso saber programar?", "Não. As aulas começam pela preparação da máquina e mostram o processo passo a passo. Você utilizará inteligência artificial gratuita como apoio durante a construção."],
  ["Vou receber um sistema pronto?", "Você receberá o treinamento e os materiais necessários para acompanhar a construção. O objetivo é que você crie seu próprio sistema e frontend seguindo as aulas."],
  ["Consigo terminar no mesmo dia?", "Sim, desde que acompanhe e replique corretamente as etapas, possua os requisitos necessários e utilize uma conta compatível."],
  ["Preciso pagar inteligência artificial?", "Não para acompanhar o método apresentado. O treinamento utiliza opções gratuitas como apoio na construção."],
  ["Preciso pagar mensalidade de chatbot?", "Não para instalar e executar localmente a estrutura ensinada. Outros custos podem existir caso você escolha serviços extras ou hospedagem no futuro."],
  ["Funciona com meu computador desligado?", "A versão local precisa que o computador e o sistema estejam ativos. Para funcionamento contínuo sem depender da máquina, seria necessário utilizar uma estrutura hospedada."],
  ["Posso personalizar o frontend?", "Sim. Você poderá adaptar cores, textos, campos e outros elementos de acordo com seu projeto e com o que for construído durante as aulas."],
  ["Posso criar para clientes?", "Você poderá utilizar o conhecimento adquirido para adaptar projetos e oferecer a criação como serviço. O treinamento não garante clientes ou resultados financeiros."],
  ["Funciona em qualquer conta do Instagram?", "A conta precisa atender aos requisitos e permissões necessários para a integração. Esses requisitos são apresentados no início do treinamento."],
  ["A automação está livre das regras da Meta?", "Não. Qualquer automação conectada ao Instagram continua sujeita às regras, permissões e limitações da plataforma."],
  ["O acesso à integração nunca expira?", "Não. Você aprenderá os procedimentos de manutenção necessários para preservar a integração dentro do funcionamento permitido."],
] as const;

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyClosed, setStickyClosed] = useState(false);
  const priceRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => {
      setStickyVisible(window.scrollY > 720);
      const points = [25, 50, 75, 90];
      const progress = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
      points.forEach((point) => {
        const key = `dm-scroll-${point}`;
        if (progress >= point && !sessionStorage.getItem(key)) { sessionStorage.setItem(key, "1"); track("scroll_depth", { percent: point }); }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && track("pricing_view"), { threshold: .35 });
    if (priceRef.current) observer.observe(priceRef.current);
    return () => { window.removeEventListener("scroll", onScroll); observer.disconnect(); };
  }, []);

  return <div className="min-h-screen overflow-hidden bg-cream text-ink">
    <div className="topbar">Comece hoje por R$47 e monte a sua própria automação</div>
    <header className="site-header">
      <div className="shell flex h-16 items-center justify-between">
        <a href="#inicio" className="brand" aria-label="DM Própria, início">DM Própria<span>.</span></a>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a><a href="#resultado">O que você vai criar</a><a href="#conteudo">Conteúdo</a><a href="#duvidas">Dúvidas</a>
          <CheckoutButton className="!min-h-10 !px-5 !py-2.5 !text-sm">Quero criar o meu</CheckoutButton>
        </nav>
        <button className="icon-button lg:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Abrir menu"><Icon name={menuOpen ? "close" : "menu"} /></button>
      </div>
      {menuOpen && <nav className="mobile-menu" aria-label="Navegação móvel"><a href="#como-funciona">Como funciona</a><a href="#resultado">O que você vai criar</a><a href="#conteudo">Conteúdo</a><a href="#duvidas">Dúvidas</a></nav>}
    </header>

    <main>
      <section id="inicio" className="hero paper-texture">
        <div className="shell grid items-center gap-14 py-14 lg:grid-cols-[1.02fr_.98fr] lg:py-24">
          <div className="reveal">
            <span className="eyebrow">Pare de deixar comentários sem resposta</span>
            <h1>Monte sua <em>própria automação</em> de comentário para DM no Instagram</h1>
            <p className="hero-copy">Quando alguém comentar a palavra que você escolheu, a pessoa recebe sua mensagem no direct. Você monta tudo comigo, conecta ao seu Instagram e faz um teste real, mesmo que nunca tenha programado.</p>
            <div className="benefit-row"><span><Icon name="spark" /> Ajuda de IA gratuita</span><span><Icon name="code" /> Painel com a sua cara</span><span><Icon name="check" /> Sem mensalidade para usar localmente</span></div>
            <CheckoutButton>Quero montar a minha por R$47</CheckoutButton>
            <p className="microcopy">Aulas liberadas na hora <b>•</b> Passo a passo prático <b>•</b> 7 dias de garantia</p>
          </div>
          <div className="relative reveal delay-2">
            <button className="vsl" onClick={() => track("vsl_play")} aria-label="Reproduzir demonstração da automação">
              <div className="vsl-ui"><span>comentário</span><b>QUERO</b><div className="vsl-line" /><span>mensagem enviada</span></div>
              <span className="play"><Icon name="play" className="h-8 w-8" /></span>
              <strong>Veja o comentário virar uma DM</strong><small>Demonstração real do processo</small>
            </button>
            <p className="hand-note">Sem enrolação. Você vê o comentário e a mensagem chegando. <span>↙</span></p>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="bg-paper py-20">
        <div className="shell"><SectionTitle eyebrow="É simples assim" title="A pessoa comenta. Sua mensagem chega no direct." text="Você escolhe a palavra e escreve a resposta. O sistema cuida do caminho entre uma coisa e outra." />
          <div className="flow-grid">
            <article><span className="step">01</span><Icon name="message" /><h3>A pessoa comenta</h3><div className="comment-pill">QUERO</div></article>
            <article><span className="step">02</span><Icon name="code" /><h3>O sistema identifica</h3><div className="flow-line"><i /><i /><i /></div></article>
            <article><span className="step">03</span><Icon name="spark" /><h3>A mensagem chega na DM</h3><div className="dm-bubble">Aqui está o material que você pediu.</div></article>
          </div>
          <p className="center-note">Envie o que fizer sentido para o seu conteúdo: um link, uma aula, um produto, um grupo ou um cupom.</p>
        </div>
      </section>

      <section className="py-24"><div className="shell grid items-center gap-16 lg:grid-cols-2">
        <div><SectionTitle eyebrow="Foi assim que começou" title="Eu só queria responder comentários sem pagar mais uma mensalidade" />
          <div className="story"><p>Eu queria uma coisa bem simples: a pessoa comenta uma palavra e recebe o material no direct. <strong>Sem eu precisar responder uma por uma.</strong></p><p>As opções que encontrei vinham com planos, limites e outra cobrança todo mês. Para uma função tão direta, isso não fazia sentido para mim.</p><p>Então montei minha própria estrutura. Quando vi tudo funcionando no meu Instagram, transformei o processo em aulas para você conseguir fazer o mesmo.</p></div>
          <div className="savings-card"><span>O custo que deixa de se repetir</span><strong>Pague R$47 uma vez. A conta não volta no mês seguinte.</strong><p>Ferramentas completas de automação podem passar de R$500 por mês nos planos maiores. Se você quer principalmente transformar comentários em mensagens, pode montar essa função na sua própria estrutura e parar de pagar por recursos que não usa.</p><small>O uso local não tem mensalidade. Serviços opcionais de hospedagem podem ter custo próprio.</small></div>
        </div>
        <VisualSystem />
      </div></section>

      <section className="dark-section"><div className="shell grid gap-12 py-24 lg:grid-cols-[1fr_.75fr] lg:items-center">
        <div><SectionTitle eyebrow="Você começa do começo" title="Não precisa saber programar para acompanhar" light />
          <div className="space-y-4 text-lg leading-relaxed text-white/70"><p>Eu faço cada etapa na minha tela. Você acompanha e repete na sua máquina.</p><p>A inteligência artificial ajuda com a parte técnica, e eu mostro o que cada passo está fazendo. Você não fica sozinho diante de um monte de código.</p><p>Primeiro colocamos a automação para rodar. Depois você muda as cores, os textos e as opções do painel para deixar tudo com a sua cara.</p></div>
        </div>
        <blockquote>Primeiro faça funcionar.<br /><em>Depois deixe com a sua cara.</em></blockquote>
      </div></section>

      <section className="py-24"><div className="shell"><SectionTitle eyebrow="Você faz junto comigo" title="Quatro etapas até a primeira mensagem chegar" />
        <div className="method-grid">{[
          ["Prepare sua máquina", "Instale as ferramentas necessárias e deixe o ambiente pronto acompanhando o passo a passo."],
          ["Construa a estrutura", "Use os comandos e a IA gratuita para criar a base do sistema junto com as aulas."],
          ["Monte seu frontend", "Crie o painel para configurar palavras, mensagens, links e outras opções."],
          ["Conecte e teste", "Conecte ao Instagram, faça um comentário real e veja a mensagem chegando na DM."],
        ].map(([title, text], i) => <article key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        <p className="center-note">Se você separar algumas horas e acompanhar as etapas, pode terminar o dia com o primeiro teste feito.</p>
      </div></section>

      <section id="resultado" className="bg-sand py-24"><div className="shell"><SectionTitle eyebrow="O que fica com você" title="No final, você terá algo seu e funcionando" />
        <div className="result-layout"><ul>{["Um sistema criado na sua própria máquina", "Um frontend que você mesmo construiu", "Uma automação real conectada ao Instagram"].map(x => <li key={x}><Icon name="check" />{x}</li>)}</ul><DashboardMockup /><ul>{["Liberdade para adaptar textos e aparência", "Conhecimento para repetir o processo", "Uma habilidade que pode ser oferecida como serviço"].map(x => <li key={x}><Icon name="check" />{x}</li>)}</ul></div>
        <p className="center-note max-w-2xl">Você não precisa virar programador. Precisa sair com uma automação que entende, consegue usar e sabe ajustar.</p>
      </div></section>

      <section className="py-24"><div className="shell"><SectionTitle eyebrow="Você decide o que enviar" title="Transforme um comentário em uma entrega automática" text="Escolha a palavra que ativa o sistema e o que a pessoa vai receber no direct." />
        <div className="application-grid">{["Link de uma página de vendas", "E-book ou material gratuito", "Aula gravada", "Convite para um grupo", "Cupom de desconto", "Formulário de orçamento", "Catálogo ou cardápio", "Chamada para atendimento"].map((x, i) => <article key={x}><span>{String(i + 1).padStart(2, "0")}</span>{x}</article>)}</div>
      </div></section>

      <section id="servico" className="bg-sand py-24"><div className="shell service-grid"><WorkspaceVisual /><div className="service-copy"><span className="eyebrow">Use no seu perfil ou crie para outras pessoas</span><h2>Depois de fazer a sua, você pode montar automações para clientes</h2><div className="story"><p>Produtores, afiliados, criadores e negócios locais recebem comentários todos os dias. Muitos gostariam de responder pelo direct, mas não sabem por onde começar.</p><p>Quando você aprende o processo, consegue trocar o visual, os textos e a mensagem para adaptar o sistema a outros projetos.</p><p><strong>O treinamento não promete clientes.</strong> Ele entrega uma habilidade prática que você pode mostrar no portfólio e oferecer com segurança.</p></div></div></div></section>

      <section id="conteudo" className="py-24"><div className="shell grid gap-16 lg:grid-cols-[.75fr_1.25fr]"><div className="lg:sticky lg:top-28 lg:self-start"><SectionTitle eyebrow="Por dentro das aulas" title="Você aprende na ordem em que precisa fazer" text="Aulas curtas, com tela compartilhada e uma tarefa clara em cada etapa." /><CheckoutButton className="mt-7">Quero fazer junto</CheckoutButton></div><div className="accordion-list">{modules.map(([title, items], i) => <details key={title} open={i === 0}><summary><span>Módulo {i + 1}</span><strong>{title}</strong><b>+</b></summary><ul>{items.map(item => <li key={item}><Icon name="check" />{item}</li>)}</ul></details>)}</div></div></section>

      {/* Os bônus abaixo podem ser removidos ou alterados facilmente. */}
      <section className="bg-paper py-24"><div className="shell"><SectionTitle eyebrow="Para não travar no caminho" title="Três bônus que você realmente vai usar" /><div className="bonus-grid">{[
        ["Checklist de construção", "Veja o que já fez, o que falta e onde conferir antes de testar."],
        ["Guia de erros comuns", "Encontre mais rápido os problemas que costumam aparecer na instalação e na conexão."],
        ["Ideias para usar a automação", "Tenha exemplos prontos para produtos, serviços, aulas, grupos e materiais gratuitos."],
      ].map(([title, text], i) => <article key={title}><span>Bônus 0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

      <section className="py-24"><div className="shell creator-grid"><figure className="creator-photo"><img src={`${import.meta.env.BASE_URL}eduardo-santos.jpg`} alt="Eduardo Santos trabalhando em seu computador" loading="lazy" /><figcaption>Eduardo construindo e testando o sistema</figcaption></figure><div><SectionTitle eyebrow="Quem vai fazer junto com você" title={`Eu sou ${siteConfig.creatorName}.`} /><div className="story"><p>Eu criei essa automação porque não queria pagar por uma ferramenta inteira para usar uma única função.</p><p>Depois de colocar tudo para rodar no meu Instagram, refiz o processo com calma e organizei cada etapa em aulas.</p><p>Você não vai passar horas ouvindo teoria. Eu abro minha tela, faço e explico. Você acompanha na sua.</p></div><div className="creator-meta"><a href={siteConfig.creatorInstagramUrl} target="_blank" rel="noreferrer">{siteConfig.creatorInstagram}</a><span>{siteConfig.creatorFollowers}</span><span>Demonstração feita no perfil</span></div></div></div></section>

      <section className="proof-section"><div className="shell"><SectionTitle eyebrow="Provas reais" title="Pessoas criando a própria automação" text="Esta seção está preparada para receber resultados reais assim que estiverem disponíveis." /><div className="proof-grid">{["Print do sistema funcionando", "Comentário do aluno", "Frontend criado pelo aluno"].map(x => <article key={x}><div>PLACEHOLDER</div><p>{x}</p></article>)}</div></div></section>

      <section id="checkout" ref={priceRef} className="offer-wrap"><div className="shell"><div className="offer-card"><div className="offer-content"><span className="eyebrow">Comece quando quiser</span><h2>Chega de responder tudo na mão</h2><p className="offer-description">Entre hoje e monte uma automação que entrega sua mensagem no direct enquanto você cuida do conteúdo e do seu negócio.</p><h3 className="offer-includes-title">Você recebe tudo para sair do zero</h3><ul>{["Treinamento completo e prático", "Construção do sistema do zero", "Painel personalizado", "Conexão com o Instagram", "Aula de manutenção", "Acesso imediato às aulas", "Bônus: checklist de construção", "Bônus: guia de erros comuns", "Bônus: ideias para usar a automação"].map(x => <li key={x}><Icon name="check" />{x}</li>)}</ul></div><div className="price-box"><span>DM Própria</span><p className="price-caption">Acesso completo • pagamento único</p><strong><small>R$</small><b>47</b></strong><p className="price-note">uma vez só, sem assinatura</p><CheckoutButton dark>Quero parar de responder na mão</CheckoutButton><small className="secure-note"><Icon name="shield" /> Compra segura • 7 dias de garantia</small></div></div></div></section>

      <section className="py-20"><div className="shell guarantee"><Icon name="shield" className="h-12 w-12" /><div><h2>Veja as aulas com calma por 7 dias</h2><p>Entre, assista e avalie se o treinamento faz sentido para você. Se não fizer, peça o reembolso dentro do prazo informado na compra.</p></div></div></section>

      <section id="duvidas" className="bg-paper py-24"><div className="shell grid gap-16 lg:grid-cols-[.7fr_1.3fr]"><SectionTitle eyebrow="Perguntas frequentes" title="Antes de começar, vale saber" /><div className="accordion-list faq">{faqs.map(([q, a]) => <details key={q}><summary><strong>{q}</strong><b>+</b></summary><p>{a}</p></details>)}</div></div></section>

      <section className="final-cta"><div className="shell"><span className="eyebrow">Comece pela primeira aula</span><h2>Seu próximo comentário pode receber uma resposta automática</h2><p>Monte comigo, faça o teste no seu Instagram e pare de depender de respostas manuais.</p><CheckoutButton>Quero montar a minha por R$47</CheckoutButton><small>Acesso liberado após a confirmação do pagamento</small></div></section>
    </main>

    <footer><div className="shell"><div className="footer-top"><a className="brand" href="#inicio">DM Própria<span>.</span></a><nav><a href={siteConfig.legal.terms}>Termos de uso</a><a href={siteConfig.legal.privacy}>Política de privacidade</a><a href={siteConfig.legal.contact}>Contato</a><a href="#">Instagram do criador</a></nav></div><div className="legal"><p>O DM Própria é um treinamento educacional independente. Não possui vínculo, parceria ou afiliação com Instagram, Meta, ManyChat, Claude ou Anthropic. Marcas eventualmente mencionadas pertencem aos seus respectivos proprietários. O funcionamento de integrações pode ser afetado por requisitos, políticas e mudanças realizadas pelas plataformas utilizadas.</p><p>Os resultados dependem da aplicação individual. O treinamento não oferece garantia de faturamento ou obtenção de clientes.</p></div></div></footer>

    {stickyVisible && !stickyClosed && <div className="mobile-sticky"><button onClick={() => setStickyClosed(true)} aria-label="Fechar barra">×</button><CheckoutButton>Criar meu sistema • R$47</CheckoutButton></div>}
    <DemoPurchaseToast />
  </div>;
}

function VisualSystem() {
  return <div className="visual-system" aria-label="Fluxo entre publicação, comentário, sistema e mensagem"><div className="insta-card"><small>PUBLICAÇÃO NO INSTAGRAM</small><img className="post-photo" src={`${import.meta.env.BASE_URL}instagram-post-token-hacks.png`} alt="Post de Eduardo Santos sobre hacks para economizar tokens no Claude" loading="lazy" /><p><b>@pessoa</b> QUERO</p></div><div className="curved-arrow">↘</div><div className="mini-panel"><span>DM PRÓPRIA</span><i /><i /><button>Automação ativa</button></div><div className="dm-card"><small>NOVA MENSAGEM</small><p>Aqui está o material que você pediu.</p></div></div>;
}

function DashboardMockup() {
  return <div className="dashboard"><div className="dash-sidebar"><b>DM.</b><i /><i /><i /></div><div className="dash-main"><div className="dash-top"><span>Automações</span><button>+ Nova</button></div><div className="dash-stat"><small>Comentários detectados</small><strong>24</strong><span>Fluxo ativo</span></div><div className="dash-rule"><i /><div><b>Palavra: QUERO</b><small>Mensagem privada + link</small></div><span>Ativa</span></div></div></div>;
}

function WorkspaceVisual() {
  return <div className="workspace-visual"><div className="workspace-photo"><img src={`${import.meta.env.BASE_URL}manydudu-dashboard-mockup.png`} alt="Painel do ManyDudu configurando uma automação de comentário para mensagem privada" loading="lazy" /></div><div className="floating-code"><span>palavra-chave</span><b>QUERO</b><span>resposta</span><b>Seu link</b></div></div>;
}

export default App;
