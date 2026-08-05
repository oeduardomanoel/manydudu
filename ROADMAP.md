# Roadmap do ManyDudu

O objetivo é chegar a uma alternativa própria ao ManyChat para Instagram, mantendo a tela simples para qualquer pessoa operar. Fluxos de boas-vindas ligados a anúncios ficam explicitamente fora deste roadmap.

## Ordem recomendada

### S01 — Nova central visual — concluída nesta entrega

**Risco:** baixo  
**Dependências:** nenhuma

Reorganizar a interface existente como uma central preto/azul, melhorar contraste, foco e responsividade e deixar a criação de automação como ação principal.

**Demonstração:** abrir o painel, escolher um Reel e chegar ao formulário de automação sem conhecer termos da API.

### S02 — Contatos e histórico — concluída

**Risco:** alto  
**Dependências:** nenhuma

Criar um contato a partir do identificador permitido pela Meta e reunir comentários, DMs, estado de seguidor, tags, notas e última interação.

**Demonstração:** abrir uma pessoa e enxergar toda a jornada dela com a conta.

### S03 — Caixa de entrada e atendimento manual — concluída

**Risco:** alto  
**Dependências:** S02

Unificar mensagens recebidas, permitir responder manualmente e pausar automações para um contato durante o atendimento humano.

**Demonstração:** assumir uma conversa, responder e devolver o contato para a automação com segurança.

### S04 — Métricas de conversão — concluída

**Risco:** médio  
**Dependências:** S02

Medir comentário capturado, DM enviada, resposta rápida, confirmação de seguidor e material entregue por Reel e por regra.

**Demonstração:** comparar dois Reels e identificar qual entregou mais materiais.

### S05 — Construtor visual de jornadas — concluída

**Risco:** alto  
**Dependências:** S02

Montar sequências com blocos simples: gatilho, mensagem, resposta rápida, condição, espera e entrega. Este construtor serve a conversas orgânicas; não inclui fluxos de anúncios.

**Demonstração:** montar “comentou QUERO → DM → confirmou → verificou seguidor → recebeu link” sem editar código.

### S06 — Moderação de comentários — concluída

**Risco:** médio  
**Dependências:** nenhuma

Centralizar comentários, responder, ocultar quando permitido, classificar assunto e criar regras para spam ou palavras sensíveis.

**Demonstração:** limpar e responder aos comentários de um Reel em uma única tela.

### S07 — Início de conversa no Direct

**Risco:** médio  
**Dependências:** S03

Configurar respostas rápidas, Ice Breakers e menu persistente quando suportados pela conta e pelas permissões da Meta.

**Demonstração:** uma pessoa abre o Direct e encontra opções claras para pedir material ou suporte.

### S08 — Biblioteca de entregas

**Risco:** médio  
**Dependências:** S05

Salvar links, imagens, vídeos e documentos reutilizáveis, com título de botão, prévia, validade e rastreamento.

**Demonstração:** selecionar um material salvo em vez de preencher novamente cada automação.

### S09 — Publicação e calendário

**Risco:** alto  
**Dependências:** nenhuma

Preparar e agendar publicações suportadas pela API, associando a automação antes da publicação e exibindo falhas de processamento.

**Demonstração:** agendar um Reel e deixar sua regra de comentários pronta no mesmo processo.

### S10 — Lives e comentários em tempo real

**Risco:** médio  
**Dependências:** S05

Aplicar palavras-chave e respostas durante transmissões ao vivo, respeitando os eventos e limites disponíveis.

**Demonstração:** comentário com palavra-chave em uma Live inicia a jornada configurada.

### S11 — Operação confiável

**Risco:** alto  
**Dependências:** S02–S10 conforme forem entregues

Adicionar banco persistente, criptografia de tokens, login local, filas com repetição segura, idempotência de webhooks, alertas, backup, health check e configuração estável do túnel público.

**Demonstração:** reiniciar o computador sem perder contatos, regras ou eventos pendentes.

## Regra para todas as etapas

Cada fatia precisa funcionar de ponta a ponta, incluir estados de carregamento, erro e vazio, explicar permissões ausentes em linguagem simples e passar pelos testes automatizados antes de ser considerada concluída.
