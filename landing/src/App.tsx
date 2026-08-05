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
    <div className="topbar">Acesso imediato às aulas por apenas R$47</div>
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
            <span className="eyebrow">Crie acompanhando. Teste no mesmo dia.</span>
            <h1>Crie hoje seu <em>próprio sistema</em> de comentário para DM no Instagram</h1>
            <p className="hero-copy">Acompanhe aulas rápidas para construir a automação, criar seu frontend, conectar ao Instagram e fazer o primeiro teste ainda hoje, mesmo sem experiência com programação.</p>
            <div className="benefit-row"><span><Icon name="spark" /> IA gratuita</span><span><Icon name="code" /> Frontend personalizado</span><span><Icon name="check" /> Sem mensalidade local</span></div>
            <CheckoutButton>Quero criar meu sistema por R$47</CheckoutButton>
            <p className="microcopy">Acesso imediato <b>•</b> Aulas práticas <b>•</b> Garantia de 7 dias</p>
          </div>
          <div className="relative reveal delay-2">
            <button className="vsl" onClick={() => track("vsl_play")} aria-label="Reproduzir demonstração da automação">
              <div className="vsl-ui"><span>comentário</span><b>QUERO</b><div className="vsl-line" /><span>mensagem enviada</span></div>
              <span className="play"><Icon name="play" className="h-8 w-8" /></span>
              <strong>Assista à automação funcionando</strong><small>Vídeo de demonstração</small>
            </button>
            <p className="hand-note">Eu mostro o comentário e a mensagem chegando na prática. <span>↙</span></p>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="bg-paper py-20">
        <div className="shell"><SectionTitle eyebrow="Demonstração" title="Na prática, é isso que você vai construir" text="Alguém comenta uma palavra no seu conteúdo. Seu sistema identifica o comentário e envia a mensagem que você configurou." />
          <div className="flow-grid">
            <article><span className="step">01</span><Icon name="message" /><h3>A pessoa comenta</h3><div className="comment-pill">QUERO</div></article>
            <article><span className="step">02</span><Icon name="code" /><h3>O sistema identifica</h3><div className="flow-line"><i /><i /><i /></div></article>
            <article><span className="step">03</span><Icon name="spark" /><h3>A mensagem chega na DM</h3><div className="dm-bubble">Aqui está o material que você pediu.</div></article>
          </div>
          <p className="center-note">Pode ser um link, uma aula, um produto, um grupo, um cupom ou outro material.</p>
        </div>
      </section>

      <section className="py-24"><div className="shell grid items-center gap-16 lg:grid-cols-2">
        <div><SectionTitle eyebrow="O ponto de partida" title="Talvez você só queira uma função simples" />
          <div className="story"><p>Eu queria que alguém comentasse uma palavra no meu post e recebesse uma mensagem na DM. <strong>Só isso.</strong></p><p>Mas, para usar essa função, normalmente você precisa entrar em mais uma plataforma, entender planos, limites e colocar outra mensalidade no negócio.</p><p>Então resolvi criar minha própria estrutura. Depois organizei o processo em aulas rápidas para você conseguir repetir na sua máquina.</p></div>
        </div>
        <VisualSystem />
      </div></section>

      <section className="dark-section"><div className="shell grid gap-12 py-24 lg:grid-cols-[1fr_.75fr] lg:items-center">
        <div><SectionTitle eyebrow="Começando do zero" title="Você não precisa chegar sabendo programar" light />
          <div className="space-y-4 text-lg leading-relaxed text-white/70"><p>Durante as aulas, eu faço o processo na minha tela e você replica na sua.</p><p>Você vai usar inteligência artificial gratuita para ajudar na construção, mas não vai ficar apenas copiando um código sem entender o que está acontecendo.</p><p>Primeiro fazemos a estrutura funcionar. Depois você pode mudar o visual, os textos, os campos e adaptar o frontend para o seu projeto.</p></div>
        </div>
        <blockquote>Primeiro faça funcionar.<br /><em>Depois deixe com a sua cara.</em></blockquote>
      </div></section>

      <section className="py-24"><div className="shell"><SectionTitle eyebrow="Passo a passo" title="O caminho entre entrar no treinamento e ver a primeira DM chegando" />
        <div className="method-grid">{[
          ["Prepare sua máquina", "Instale as ferramentas necessárias e deixe o ambiente pronto acompanhando o passo a passo."],
          ["Construa a estrutura", "Use os comandos e a IA gratuita para criar a base do sistema junto com as aulas."],
          ["Monte seu frontend", "Crie o painel para configurar palavras, mensagens, links e outras opções."],
          ["Conecte e teste", "Conecte ao Instagram, faça um comentário real e veja a mensagem chegando na DM."],
        ].map(([title, text], i) => <article key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        <p className="center-note">Replicando corretamente as etapas, você consegue concluir o processo no mesmo dia.</p>
      </div></section>

      <section id="resultado" className="bg-sand py-24"><div className="shell"><SectionTitle eyebrow="O resultado" title="No fim do treinamento, não será apenas uma pasta cheia de códigos" />
        <div className="result-layout"><ul>{["Um sistema criado na sua própria máquina", "Um frontend que você mesmo construiu", "Uma automação real conectada ao Instagram"].map(x => <li key={x}><Icon name="check" />{x}</li>)}</ul><DashboardMockup /><ul>{["Liberdade para adaptar textos e aparência", "Conhecimento para repetir o processo", "Uma habilidade que pode ser oferecida como serviço"].map(x => <li key={x}><Icon name="check" />{x}</li>)}</ul></div>
        <p className="center-note max-w-2xl">O objetivo não é ensinar programação durante semanas. É levar você do zero até uma automação funcionando.</p>
      </div></section>

      <section className="py-24"><div className="shell"><SectionTitle eyebrow="Possibilidades" title="O que você pode entregar pela DM" text="Você escolhe a palavra que ativa o sistema e a mensagem que a pessoa vai receber." />
        <div className="application-grid">{["Link de uma página de vendas", "E-book ou material gratuito", "Aula gravada", "Convite para um grupo", "Cupom de desconto", "Formulário de orçamento", "Catálogo ou cardápio", "Chamada para atendimento"].map((x, i) => <article key={x}><span>{String(i + 1).padStart(2, "0")}</span>{x}</article>)}</div>
      </div></section>

      <section className="bg-sand py-24"><div className="shell grid items-center gap-14 lg:grid-cols-[.85fr_1.15fr]"><WorkspaceVisual /><div><span className="eyebrow">Use no seu negócio ou transforme em serviço</span><h2>Você também pode usar o que aprendeu para criar sistemas para outras pessoas</h2><div className="story"><p>Você pode montar a automação para usar no seu perfil. Mas também existe muito produtor, afiliado, criador e negócio local que gostaria de ter algo assim e não sabe como construir.</p><p>Depois de aprender o processo, você pode adaptar o frontend para outros projetos e oferecer a criação como serviço.</p><p><strong>Não significa que clientes aparecerão automaticamente.</strong> Significa que você terá uma habilidade prática para colocar no seu portfólio e oferecer.</p></div></div></div></section>

      <section id="conteudo" className="py-24"><div className="shell grid gap-16 lg:grid-cols-[.75fr_1.25fr]"><div className="lg:sticky lg:top-28 lg:self-start"><SectionTitle eyebrow="Por dentro" title="O que você vai aprender nas aulas" text="Videoaulas curtas, práticas e organizadas na ordem em que você precisa executar." /><CheckoutButton className="mt-7">Quero acompanhar as aulas</CheckoutButton></div><div className="accordion-list">{modules.map(([title, items], i) => <details key={title} open={i === 0}><summary><span>Módulo {i + 1}</span><strong>{title}</strong><b>+</b></summary><ul>{items.map(item => <li key={item}><Icon name="check" />{item}</li>)}</ul></details>)}</div></div></section>

      {/* Os bônus abaixo podem ser removidos ou alterados facilmente. */}
      <section className="bg-paper py-24"><div className="shell"><SectionTitle eyebrow="Materiais complementares" title="Bônus para deixar o processo mais claro" /><div className="bonus-grid">{[
        ["Checklist de construção", "Uma lista organizada para acompanhar cada etapa e confirmar que tudo foi configurado corretamente."],
        ["Guia de erros comuns", "Orientações para identificar os problemas que mais aparecem durante instalação e conexão."],
        ["Ideias para usar a automação", "Exemplos de aplicação para produtos, serviços, aulas, grupos e materiais gratuitos."],
      ].map(([title, text], i) => <article key={title}><span>Bônus 0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

      <section className="py-24"><div className="shell creator-grid"><div className="creator-placeholder"><span>FOTO REAL<br />DO CRIADOR</span></div><div><SectionTitle eyebrow="Quem vai te mostrar o processo" title={`Eu sou ${siteConfig.creatorName}.`} /><div className="story"><p>Eu criei essa automação porque queria uma forma simples de transformar comentários em mensagens sem precisar contratar uma ferramenta completa apenas para essa função.</p><p>Depois de colocar o sistema para funcionar no meu próprio Instagram, organizei o processo em aulas práticas.</p><p>Não é um treinamento cheio de teoria. Eu faço na minha tela e você acompanha fazendo na sua.</p></div><div className="creator-meta"><span>{siteConfig.creatorInstagram}</span><span>{siteConfig.creatorFollowers}</span><span>[PROVA DE USO NO PERFIL]</span></div></div></div></section>

      <section className="proof-section"><div className="shell"><SectionTitle eyebrow="Provas reais" title="Pessoas criando a própria automação" text="Esta seção está preparada para receber resultados reais assim que estiverem disponíveis." /><div className="proof-grid">{["Print do sistema funcionando", "Comentário do aluno", "Frontend criado pelo aluno"].map(x => <article key={x}><div>PLACEHOLDER</div><p>{x}</p></article>)}</div></div></section>

      <section id="checkout" ref={priceRef} className="offer-wrap"><div className="shell"><div className="offer-card"><div><span className="eyebrow">Acesso imediato</span><h2>Comece hoje a criar sua DM Própria</h2><ul>{["Treinamento completo", "Construção do sistema", "Criação do frontend", "Integração com Instagram", "Aula de manutenção", "Materiais complementares", "Acesso imediato"].map(x => <li key={x}><Icon name="check" />{x}</li>)}</ul></div><div className="price-box"><span>Pagamento único</span><strong>R$<b>47</b></strong><p>à vista</p><CheckoutButton dark>Quero começar agora</CheckoutButton><small><Icon name="shield" /> Compra processada em ambiente seguro</small></div></div></div></section>

      <section className="py-20"><div className="shell guarantee"><Icon name="shield" className="h-12 w-12" /><div><h2>Você tem 7 dias para conhecer o treinamento</h2><p>Depois de entrar, você poderá acessar as aulas e avaliar o conteúdo. Caso perceba que o treinamento não é para você, poderá solicitar o reembolso dentro do prazo legal informado na página de compra.</p></div></div></section>

      <section id="duvidas" className="bg-paper py-24"><div className="shell grid gap-16 lg:grid-cols-[.7fr_1.3fr]"><SectionTitle eyebrow="Perguntas frequentes" title="Antes de começar, vale saber" /><div className="accordion-list faq">{faqs.map(([q, a]) => <details key={q}><summary><strong>{q}</strong><b>+</b></summary><p>{a}</p></details>)}</div></div></section>

      <section className="final-cta"><div className="shell"><span className="eyebrow">Seu projeto começa aqui</span><h2>Você pode terminar hoje com sua própria automação funcionando</h2><p>Entre, acompanhe as aulas na ordem e replique cada etapa na sua máquina.</p><CheckoutButton>Criar minha DM Própria por R$47</CheckoutButton><small>Acesso imediato após a confirmação do pagamento</small></div></section>
    </main>

    <footer><div className="shell"><div className="footer-top"><a className="brand" href="#inicio">DM Própria<span>.</span></a><nav><a href={siteConfig.legal.terms}>Termos de uso</a><a href={siteConfig.legal.privacy}>Política de privacidade</a><a href={siteConfig.legal.contact}>Contato</a><a href="#">Instagram do criador</a></nav></div><div className="legal"><p>O DM Própria é um treinamento educacional independente. Não possui vínculo, parceria ou afiliação com Instagram, Meta, ManyChat, Claude ou Anthropic. Marcas eventualmente mencionadas pertencem aos seus respectivos proprietários. O funcionamento de integrações pode ser afetado por requisitos, políticas e mudanças realizadas pelas plataformas utilizadas.</p><p>Os resultados dependem da aplicação individual. O treinamento não oferece garantia de faturamento ou obtenção de clientes.</p></div></div></footer>

    {stickyVisible && !stickyClosed && <div className="mobile-sticky"><button onClick={() => setStickyClosed(true)} aria-label="Fechar barra">×</button><CheckoutButton>Criar meu sistema • R$47</CheckoutButton></div>}
  </div>;
}

function VisualSystem() {
  return <div className="visual-system" aria-label="Placeholder visual do fluxo entre comentário, sistema e mensagem"><div className="insta-card"><small>PUBLICAÇÃO NO INSTAGRAM</small><div className="post-photo" /><p><b>@pessoa</b> QUERO</p></div><div className="curved-arrow">↘</div><div className="mini-panel"><span>DM PRÓPRIA</span><i /><i /><button>Automação ativa</button></div><div className="dm-card"><small>NOVA MENSAGEM</small><p>Aqui está o material que você pediu.</p></div></div>;
}

function DashboardMockup() {
  return <div className="dashboard"><div className="dash-sidebar"><b>DM.</b><i /><i /><i /></div><div className="dash-main"><div className="dash-top"><span>Automações</span><button>+ Nova</button></div><div className="dash-stat"><small>Comentários detectados</small><strong>24</strong><span>Fluxo ativo</span></div><div className="dash-rule"><i /><div><b>Palavra: QUERO</b><small>Mensagem privada + link</small></div><span>Ativa</span></div></div></div>;
}

function WorkspaceVisual() {
  return <div className="workspace-visual"><div className="workspace-photo"><span>PESSOA PERSONALIZANDO<br />UM PROJETO</span></div><div className="floating-code"><i />background: <b>#F4EFE7</b><br />mensagem: <b>"Seu link"</b></div></div>;
}

export default App;
