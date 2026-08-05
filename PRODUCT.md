# Produto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Usuários

Criadores e pequenos negócios que usam uma conta profissional do Instagram e querem transformar comentários em conversas e entrega de conteúdo sem depender do ManyChat. O usuário principal não precisa conhecer APIs ou termos técnicos.

## Objetivo do produto

Permitir escolher um Reel, definir uma palavra-chave e configurar uma conversa automática que pode responder ao comentário, iniciar uma DM, confirmar interesse, verificar se o contato segue o perfil e entregar um link.

## Posicionamento

Uma central própria e local para automações do Instagram: o controle fica com o dono da conta, e cada automação é montada em linguagem simples a partir do conteúdo publicado.

## Contexto de uso

O produto roda localmente no navegador e integra-se à Instagram Graph API por um backend Node.js. O operador acompanha Reels, comentários, automações e eventos em um único painel.

## Capacidades e restrições

- Reels e publicações da conta conectada.
- Regras por conteúdo ou globais, com palavra-chave exata ou parcial.
- Resposta pública ou privada a comentários.
- Continuação por resposta rápida, verificação de seguidor e entrega de link.
- Webhooks públicos continuam necessários para eventos em tempo real, mesmo com o painel local.
- Funcionalidades dependem das permissões e janelas de mensagens oferecidas pela Meta.
- Fluxos de boas-vindas para anúncios estão fora do escopo atual.

## Compromissos de marca

Nome atual: ManyDudu. A experiência deve ser simples, direta e em português. A direção visual confirmada é preto com azul e efeitos neon controlados.

## Evidências disponíveis

O repositório contém uma integração funcional com a conta do Instagram, listagem de mídia e comentários, regras de automação, respostas e registro de atividade. Não há depoimentos ou métricas comerciais que devam ser inventados.

## Princípios de produto

1. Explicar automação como uma sequência de ações humanas.
2. Mostrar primeiro o que exige atenção e revelar detalhes avançados quando necessários.
3. Tornar o resultado de cada regra visível e auditável.
4. Impedir configurações impossíveis antes que cheguem à API da Meta.
5. Manter o produto útil localmente sem esconder dependências externas.

## Acessibilidade e inclusão

Controles devem funcionar por teclado, estados não podem depender apenas de cor e textos devem manter contraste legível em tema escuro.
