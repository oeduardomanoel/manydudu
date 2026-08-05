# ManyDudu

MVP próprio de automação de comentários do Instagram: recebe webhooks da Meta, encontra uma regra por palavra-chave, responde de forma pública ou privada e registra a atividade.

## Segurança primeiro

O token enviado em uma conversa deve ser revogado no painel da Meta e substituído. Nunca coloque credenciais no frontend ou em commits. Este projeto lê segredos exclusivamente de variáveis de ambiente e ignora `.env` no Git.

## Executar

Requer Node.js 22 ou superior e não possui dependências externas.

1. Copie `.env.example` para `.env` e preencha com **um token novo**.
2. Carregue as variáveis no seu terminal/serviço de hospedagem.
3. Rode `node --env-file=.env src/server.js`.
4. Abra `http://localhost:3000`.

Para testar: `node --test`.

## Configurar na Meta

Você precisa de uma conta profissional do Instagram ligada ao app Meta, produto Instagram habilitado e permissões aprovadas para ler/gerenciar comentários e mensagens. No painel de Webhooks, use:

- Callback: `https://SEU-DOMINIO/webhook`
- Verify token: o mesmo valor de `META_VERIFY_TOKEN`
- Campo assinado: `comments`

Para fluxos que entregam um link depois que a pessoa responde à primeira DM, assine também o campo `messages` e autorize `instagram_business_manage_messages` no Instagram Login.

## Entrega de link após resposta

O fluxo segue as restrições oficiais da Meta:

1. Um comentário com a palavra-chave dispara uma única resposta privada.
2. A resposta privada pede que a pessoa responda no Direct.
3. O destinatário fica pendente localmente, sem armazenar o conteúdo completo da conversa.
4. Quando chega o webhook `messages`, o link HTTPS é entregue uma única vez.
5. Se o envio falhar, a pendência é restaurada para nova tentativa.

Opcionalmente, a automação pode consultar `is_user_follow_business` após a resposta. Se a pessoa ainda não segue a conta, recebe uma orientação e a entrega continua pendente; a próxima resposta faz uma nova verificação. Esse dado só fica disponível depois que a pessoa interage por mensagem e fornece consentimento de perfil.

A entrega pode usar texto com URL ou o Button Template oficial do Instagram, com um botão `web_url`. O título do botão é limitado a 20 caracteres e o destino precisa usar HTTPS.

A primeira resposta privada pode incluir uma Quick Reply configurável. Ao tocar, a pessoa envia uma interação e abre a janela de conversa. O bloqueio por follow usa um botão `web_url` para abrir o perfil e um botão `postback` para “JÁ SEGUI”; esse postback solicita uma nova verificação sem exigir que a pessoa digite uma mensagem.

A Meta permite a mensagem inicial privada até sete dias após o comentário. Mensagens de acompanhamento só podem ser enviadas depois que o destinatário responde e dentro da janela de 24 horas dessa resposta.

O callback precisa estar público em HTTPS. Em desenvolvimento, use um túnel HTTPS confiável. A Meta exige revisão do app e pode limitar respostas privadas e janelas de interação; confirme as regras da versão de Graph API selecionada antes de produção.

### Qual token usar?

- **Instagram Login:** use o Instagram User Access Token gerado em Instagram → Configuração da API. As chamadas usam `graph.instagram.com`.
- **Facebook Login:** use o token apropriado do fluxo Facebook/Page com as permissões necessárias. As chamadas usam `graph.facebook.com`.

O cliente detecta automaticamente o fluxo pelo tipo do token. O Graph API Explorer é útil para testes do fluxo Facebook, mas não substitui o token Instagram do primeiro fluxo.

## Estrutura

- `src/domain`: regras puras de automação
- `src/meta`: assinatura do webhook e cliente Graph API
- `src/storage`: persistência JSON atômica (adequada ao MVP de uma instância)
- `public`: painel administrativo
- `test`: testes nativos do Node

Para produção com múltiplas instâncias, migre `JsonStore` para PostgreSQL, adicione login ao painel, fila de jobs/retries e criptografia/rotação de credenciais.
