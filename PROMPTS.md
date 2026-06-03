# PROMPTS

Este projeto foi desenvolvido com assistência de IA em fluxo spec-driven. O spec e o plano de implementação internos ficaram fora do repositório por opção — este arquivo registra, de forma curada, os prompts e decisões que mais moldaram a implementação.

---

## 1. Spec-driven development + calibração de escopo

> "Fazer SDD e mirar 'Equilibrado + curado', cravando os 4 bônus sem over-engineering."

**Por que importou:** manteve a entrega focada nos requisitos reais e diferenciada (bônus) sem inflar escopo com infraestrutura desnecessária. O spec antecipou os três problemas centrais (vitrine, overselling, resiliência) e os mapeou explicitamente para decisões de implementação — evitando deriva durante o desenvolvimento.

---

## 2. Consistência de estoque

> "Usar `UPDATE products SET stock = stock - :q WHERE id = :id AND stock >= :q` como reserva atômica."

**Por que importou:** elimina overselling sem lock explícito ou transação longa. O banco rejeita atomicamente se `stock < qty` — não há janela de race entre leitura e escrita. É o coração do Problema 02 e a garantia que os testes de concorrência verificam empiricamente.

---

## 3. Resiliência do checkout

> "Reservar-então-faturar com compensação, com a chamada ao ERP fora da transação de reserva."

**Por que importou:** não serializa toda a latência do ERP no gargalo da seção crítica. O estoque é reservado atomicamente no banco; só depois o ERP é chamado. Se o ERP falhar, a compensação devolve o estoque em outro UPDATE atômico. A janela de race nunca toca o estoque — o Problema 03 tratado sem bloquear leitores.

---

## 4. Idempotência

> "INSERT em coluna UNIQUE deixando o banco arbitrar — não check-then-insert. O cliente gera uma `Idempotency-Key` por tentativa."

**Por que importou:** fecha a corrida de duplo-clique e retry concorrente de forma simples e correta. Dois requests simultâneos com a mesma chave: um insere e retorna o desfecho, o outro recebe `SQLITE_CONSTRAINT` e replica o mesmo desfecho. Sem lock de aplicação, sem estado em memória.

---

## 5. Timeout vs retry

> "Falhar rápido na lentidão (timeout por tentativa) e re-tentar apenas erro transitório, com orçamento de latência total limitado."

**Por que importou:** retry em lentidão comporia timeouts — pioraria exatamente o cenário `slow` do ERP. A distinção `timeout → falha rápida, erro_transitório → retry` é o que torna a estratégia de resiliência correta e não apenas aparente.

---

## 6. Teste de concorrência

> "Disparar N checkouts via `Promise.all` contra o handler HTTP real e afirmar exatamente `floor(estoque / qty)` sucessos e estoque nunca negativo."

**Por que importou:** prova empiricamente a ausência de overselling — não apenas por inspeção de código, mas exercitando o caminho completo (HTTP → handler → UPDATE → SQLite) com requisições concorrentes reais. É o bônus que transforma a garantia do Problema 02 de afirmação em evidência.
