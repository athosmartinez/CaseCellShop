## Pergunta 1 — Diagnóstico e trade-offs

### Problema 01 — Performance da vitrine

- **Causa provável:** a vitrine consulta o ERP de forma **síncrona a cada requisição**. O ERP é um monolito que também roda faturamento/financeiro/contábil — ou seja, a leitura da loja disputa recursos com o processamento pesado interno. Sob milhões de acessos, o ERP vira gargalo e cada carregamento de página fica refém da latência dele.
- **Impacto:** o cliente frustra logo no início da jornada → abandono e perda de conversão (receita). Internamente, a carga de leitura da loja pressiona ainda mais o ERP, degradando também as operações administrativas.
- **Caminhos possíveis:**
  1. **Cache de leitura (TTL) na frente do ERP** para produtos/preços/estoque.
  2. **Read-model próprio da loja** (CQRS-lite): uma cópia local otimizada para leitura, sincronizada do ERP, que serve a vitrine sem tocar no ERP.
  3. CDN/edge cache para o catálogo semi-estático (imagens, descrições).
- **Trade-offs:** o cache TTL é o mais barato e rápido, mas serve dados levemente defasados (estoque pode aparecer desatualizado por segundos). O read-model desacopla de verdade e escala melhor, mas exige um pipeline de sincronização e assume **consistência eventual** (mais esforço). A CDN resolve o estático, mas não o estoque dinâmico.
- **Prioridade:** começaria pelo **cache de leitura com TTL curto** — ganho imediato, risco controlado, sem tocar no ERP — e evoluiria para o **read-model** (que neste projeto já é o `products` no SQLite local). Incremental, como o case pede.

### Problema 02 — Consistência de estoque (overselling)

- **Causa provável:** a loja apenas **lê** o estoque do ERP e não controla transacionalmente a decisão de venda. Sem reserva nem serialização, requisições concorrentes leem o mesmo valor e **todas passam** (clássico _check-then-act_ / race condition). A latência entre ler e o ERP efetivar amplia a janela.
- **Impacto:** **para o cliente** — ele compra, recebe a confirmação e depois tem o pedido cancelado/estornado (frustração e quebra de confiança); **para o negócio** — cancelamentos, estornos, custo operacional e dano de reputação. É um problema de **correção**, não só de performance.
- **Caminhos possíveis:**
  1. **Reserva local autoritativa** com **decremento atômico** num store próprio da loja (a loja passa a ser dona da decisão de venda).
  2. **Lock distribuído / fila por produto** no ponto de venda (serializa as compras do mesmo SKU).
  3. Estoque **otimista** com reconciliação posterior (vende e corrige depois).
- **Trade-offs:** a reserva local atômica resolve a corrida na raiz com uma operação simples (`UPDATE ... WHERE stock >= qty`), mas exige manter o estoque local sincronizado/reconciliado com o ERP. O lock distribuído funciona, mas adiciona infra (ex.: Redis) e um ponto de falha/contenção. O otimista é o pior para o cliente (ainda vende sem ter).
- **Prioridade:** **reserva local com decremento atômico** — é o que elimina a race condition de forma determinística e barata. **É exatamente o que implementei** no mini-projeto.

### Problema 03 — Resiliência do checkout

- **Causa provável:** o checkout chama o ERP de forma **síncrona e bloqueante** para faturar. Como o ERP é lento, a requisição HTTP estoura **timeout** e o cliente perde a compra. Há **acoplamento temporal**: a jornada do cliente depende diretamente da latência do ERP — e isso acontece no pior lugar possível, o momento da conversão.
- **Impacto:** perda direta de venda já convertida, frustração e retrabalho (cliente tenta de novo, podendo duplicar pedido).
- **Caminhos possíveis:**
  1. **Resiliência síncrona:** timeout curto por tentativa + retry limitado (só erro transitório) + idempotência + **compensação** de estoque na falha.
  2. **Checkout assíncrono:** reservar o estoque local, **aceitar o pedido (202)**, enfileirar o faturamento e processá-lo em **background (worker)**; o cliente acompanha por **status/polling**.
  3. Circuit breaker + fila de retry para proteger o ERP degradado.
- **Trade-offs:** a versão síncrona resiliente é simples e já evita o timeout matar a venda, mas o cliente ainda espera o ERP (acoplamento parcial). A assíncrona **desacopla totalmente** a jornada da latência do ERP (melhor UX e escala), ao custo de mais peças (fila, worker, máquina de estados do pedido, endpoint de status, consistência eventual — o cliente vê "processando").
- **Prioridade:** abordagem **incremental** — primeiro a **versão síncrona resiliente** (reserva local + timeout/retry/compensação/idempotência), de baixo risco — **foi o que entreguei** — e depois evoluir para o **assíncrono (202 + worker + polling)**, que é o passo que cumpre de fato o objetivo de "reduzir a dependência direta do ERP nas jornadas críticas".

---

## Pergunta 2 — Arquitetura alvo incremental

### Componentes principais

- **Front da loja** (Next.js, SSR para a vitrine) + **API/BFF da loja** (Express).
- **Store próprio da loja** (banco da loja): read-model de produtos/preços/estoque + pedidos + reservas + chaves de idempotência. _(No mini-projeto: SQLite; em produção: Postgres/MySQL gerenciado.)_
- **Cache** (ex.: Redis) na frente da vitrine.
- **Fila de mensagens** (ex.: RabbitMQ/SQS) para desacoplar o checkout do ERP.
- **Workers**: um para **faturar no ERP** (consumindo a fila), outro para **sincronizar ERP → read-model**.
- **Jobs agendados**: sweeper de reservas expiradas e reconciliação loja↔ERP.
- **ERP** (intocável): permanece a fonte de verdade de faturamento/financeiro; acesso **read-only** ao MySQL para sincronização.

### Fluxo de dados

- **Produtos/preços/estoque:** ERP → (replicação/CDC ou polling do MySQL read-only) → job de sync → **read-model** da loja (+ cache). A **vitrine lê do cache/read-model**, nunca do ERP diretamente. → resolve P01.
- **Estoque (venda):** a loja mantém um estoque **"vendável"** no store local; a decisão de vender é **atômica e local** (`UPDATE ... WHERE stock >= qty`). → resolve P02.
- **Checkout:** validar → **reservar estoque local** (atômico) → criar pedido `PROCESSING` → **publicar na fila** → responder rápido (**202**) → worker fatura no ERP (com retry/idempotência) → atualiza status (`CONFIRMED`/`FAILED`, **compensando** estoque na falha) → cliente acompanha em `GET /orders/:id`. → resolve P03.

### Onde cada peça entra

- **Cache:** vitrine (leitura quente).
- **Banco próprio:** read-model + pedidos + reservas + idempotência.
- **Fila:** desacoplar a jornada de checkout da latência do ERP.
- **Workers:** faturamento assíncrono e sincronização ERP→read-model.
- **Jobs:** sweeper de reservas (TTL) e reconciliação periódica.

### Sincronização loja ↔ ERP

O **ERP é a fonte de verdade** do estoque físico e do faturamento. A loja mantém uma projeção **vendável** reservável, autoritativa para a decisão de venda no curto prazo e **reconciliada** com o ERP periodicamente (ajusta divergências, trata pedidos que o ERP rejeitou, atualiza o read-model). Modelo de **consistência eventual** com a loja na ponta crítica.

### Plano de 30–90 dias

- **0–30 dias (risco baixo, maior impacto):** **read-model local** de produtos/estoque + **reserva local atômica** — **núcleo já implementado**. Já elimina o overselling (P02) e acelera a vitrine com leitura local + SSR (P01). O **cache de leitura** na frente da vitrine é a primeira evolução proposta sobre essa base.
- **30–60 dias:** **checkout assíncrono** (fila + worker + endpoint de status) com idempotência e compensação. Desacopla a jornada do ERP (P03).
- **60–90 dias:** sincronização robusta ERP→read-model (CDC/eventos), **reconciliação automática**, **observabilidade por pedido/requisição** (request-id + tracing), sweeper de reservas e circuit breaker no cliente do ERP.

---

## Pergunta 3 — Estoque, concorrência e idempotência

_Cenário: dois clientes tentam comprar a última unidade ao mesmo tempo._

- **Como evito a venda duplicada:** com **decremento atômico condicional** — `UPDATE products SET stock = stock - :q WHERE id = :id AND stock >= :q`. O banco serializa a operação: **uma** requisição afeta a linha (`changes === 1` → segue para o pagamento) e a outra afeta **zero** linhas → **409 INSUFFICIENT_STOCK**. Não há _check-then-act_; a decisão é uma única operação atômica. _(Implementado.)_
- **Reserva — quando é criada e quando expira:** no mini-projeto, a "reserva" **é** o próprio decremento atômico, criado no início do checkout, **antes** de chamar o ERP; se o faturamento falha, a **compensação** devolve o estoque na hora (libera a reserva). **Evolução proposta:** uma reserva explícita com **TTL** (ex.: 10–15 min) para o fluxo assíncrono, liberada por um **sweeper** se o faturamento não concluir a tempo (fecha o cenário de "reserva órfã" se o processo cair entre reservar e compensar — limitação conhecida e documentada).
- **Retry, timeout e duplo clique:**
  - **Duplo clique:** o front **desabilita o botão** durante o envio (e tem um guard de reentrada) — o segundo clique não dispara.
  - **Retry de rede / reenvio:** protegido por **idempotência** (abaixo).
  - **Timeout do ERP:** o checkout **falha rápido** (não reteima na lentidão) e **compensa** o estoque; só re-tenta em **erro transitório**, com orçamento de latência fechado.
- **Idempotência:** o cliente gera uma **`Idempotency-Key` por tentativa**; o servidor faz `INSERT` dessa chave na **chave primária (UNIQUE)** da tabela de idempotência e deixa o banco arbitrar (não _check-then-insert_). Duplicata **em andamento** → `202` ("processando"); duplicata **finalizada** → **replay** do mesmo desfecho gravado; falha **transitória** → a chave é **liberada** para permitir nova tentativa (padrão de idempotency-key usado em APIs de pagamento). Assim, reenvios nunca viram pedidos duplicados. _(Implementado.)_
- **Reconciliação loja ↔ ERP:** um **job periódico** compara os pedidos `CONFIRMED` da loja com o que o ERP efetivamente faturou e trata divergências — ex.: ERP rejeitou um pedido que a loja confirmou → compensar estoque/cancelar; estoque do ERP divergiu do read-model → ajustar. A **rastreabilidade por pedido** (request-id/order-id nos logs) e a idempotência tornam essa reconciliação segura e repetível. _(Evolução proposta; o request-id já está implementado.)_

---

## Pergunta 4 — SDD / Contrato de API e modelo de erros

> O contrato foi definido **spec-first (SDD)**: desenhei entradas, desfechos e o modelo de erros **antes** de implementar, e o código segue esse contrato.

**Endpoint principal:** `POST /checkout`
**Header:** `Idempotency-Key: <uuid por tentativa>`

### Payload mínimo

```json
{ "productId": "capa-silicone-preta", "quantity": 1 }
```

### Respostas

| Caso                                                       | HTTP                    | Corpo                                                                                                                           |
| ---------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Sucesso**                                                | `201`                   | `{ "order": { "id", "productId", "quantity", "totalCents", "status": "CONFIRMED" }, "requestId" }`                              |
| **Erro de validação**                                      | `400`                   | `{ "error": { "code": "VALIDATION_ERROR", "message": "Entrada inválida.", "details": { ... } }, "requestId" }`                  |
| **Produto inexistente**                                    | `404`                   | `{ "error": { "code": "PRODUCT_NOT_FOUND", "message": "Produto não encontrado." }, "requestId" }`                               |
| **Estoque insuficiente**                                   | `409`                   | `{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Estoque insuficiente.", "details": { "available": 0 } }, "requestId" }` |
| **Falha temporária do ERP**                                | `503` (+ `Retry-After`) | `{ "error": { "code": "ERP_UNAVAILABLE", "message": "Falha temporária ao processar. Tente novamente." }, "orderId", "requestId" }`         |
| **Em processamento (assíncrono / duplicata em andamento)** | `202`                   | `{ "idempotent": true, "order": { "id", "status": "PROCESSING" }, "requestId" }`                                                |

- **Envelope de erro padronizado:** `{ error: { code, message, details? }, requestId }`. O `code` é **estável**: o front decide a UI pelo `code`, não pela string da mensagem.
- **Rastreabilidade:** todo response ecoa `requestId` (header `x-request-id` + corpo), o que ajuda suporte e correlação de logs.
- **Endpoint de status:** `GET /orders/:id` → `PROCESSING | CONFIRMED | FAILED` (base para o fluxo assíncrono com polling). _(Implementado.)_
- **`202` com `order: null`:** numa duplicata concorrente que chega antes de o pedido ser criado, o `order` pode vir `null` (a chave já foi reivindicada, o pedido ainda não existe).
- **Escopo single-item:** o contrato cobre **um item por vez** (`productId` + `quantity`). Um carrinho multi-item exigiria reservar N SKUs numa única transação (all-or-nothing) — evolução proposta.

### Como o front reage a cada caso

- **201** → mensagem de sucesso e re-sincroniza o estoque na tela.
- **400** → destaca o campo inválido e pede correção.
- **404** → informa que o produto não está mais disponível e recarrega a vitrine.
- **409** → "estoque insuficiente" e re-busca o estoque (estado coerente).
- **503** → "falha temporária, tente novamente"; o usuário re-tenta com uma **nova `Idempotency-Key`** (backoff automático é evolução proposta).
- **202** → exibe "pedido em processamento". *(No fluxo assíncrono proposto, o front faria **polling** em `GET /orders/:id` até `CONFIRMED`/`FAILED`; o endpoint de status já existe, o polling no front é evolução.)*

---

## Pergunta 5 — TDD / Testes e estratégia de validação

> Implementei seguindo **TDD** (teste primeiro → falha → implementação mínima → verde → commit). **Eu defini os casos de teste e as invariantes** (o que provar) e validei que cada teste falhava pela razão certa antes de implementar; a IA acelerou a escrita. Há **37 testes automatizados** (34 back-end + 3 front-end).

- **Unitários:** lógica de domínio pura — resiliência do faturamento (timeout/retry/**fail-fast**), idempotência, validação (Zod) — e repositórios contra SQLite em memória (reserva atômica, compensação).
- **Integração da API:** `supertest` contra o handler HTTP real, cobrindo os desfechos **201 / 400 / 404 / 409 / 503** (e o replay idempotente).
- **Contrato front ↔ back:** o front consome o **`code` estável + envelope**; hoje a estabilidade do contrato é exercitada pelos testes de integração e por tipos TypeScript compartilhados na prática. _(Próximo passo: testes de contrato formais — schema/Pact — para travar o contrato entre os dois lados.)_
- **Concorrência / múltiplas tentativas:** teste que dispara **N checkouts concorrentes** (`Promise.all`) contra o endpoint real e afirma exatamente `floor(estoque/qty)` sucessos e **estoque nunca negativo**; testes de idempotência (mesma chave não reprocessa, `202` in-flight, liberação da chave em falha).
- **Estados do front-end:** testes de componente (Testing Library) — loading/botão desabilitado, mensagem correta por desfecho, estado "processando".
- **O que automatizei agora:** todo o acima (unit + integração + concorrência + componente).
- **O que deixaria documentado como próximo passo:** e2e em navegador (Playwright), testes de **contrato formais**, testes de **carga/stress** no checkout assíncrono, testes do **sweeper** de reservas e da **reconciliação**, e verificação de observabilidade (tracing por pedido).

> Nota de honestidade técnica: o teste de concorrência prova a **invariante** (sem overselling). A garantia _load-bearing_ é o `UPDATE ... WHERE stock >= qty`, que se mantém correto também sob acesso multiprocesso (WAL); o teste in-process demonstra a intenção de ponta a ponta.

---

## Pergunta 6 — Uso de IA no desenvolvimento

Usei IA (Claude Code) de forma **dirigida**, num fluxo spec-driven com revisão a cada etapa.

- **Que tipos de prompt usei:** direção de alto nível e decisões de arquitetura ("modelar o contrato de checkout e o modelo de erros"; "estratégia de consistência de estoque e idempotência"), geração de testes em **TDD**, **revisão de código** (inclusive adversarial, buscando bugs) e redação de documentação.
- **O que delego à IA:** scaffolding/boilerplate, primeira versão de testes, varredura de bugs, rascunho de docs e exploração de alternativas.
- **O que NÃO delego (ou só com revisão forte):** as **decisões de arquitetura e trade-offs** (julgamento que precisa considerar o contexto do negócio) e a **lógica crítica de consistência/idempotência/concorrência** — revisei essas linha a linha, porque é onde erros sutis (uma race condition, um _check-then-insert_) passam despercebidos.
- **Como verifico se a resposta está correta:** com **testes automatizados** (a IA pode escrever o código, mas os testes provam o comportamento), **revisão humana** + uma passada **adversarial** (a própria IA tentando refutar o que produziu), **execução real** (build + rodar a aplicação) e conferência contra a **spec/requisitos**.
- **Riscos de aceitar sugestão sem revisão:** código **plausível mas errado** (falsa sensação de correção), bugs sutis de concorrência/idempotência, **over-engineering**, decisões que não cabem no contexto e riscos de segurança. Mitigação: nada crítico entra sem **teste + revisão + verificação empírica**.
