# PROMPTS

Projeto desenvolvido com apoio de IA (Claude Code) num fluxo **spec-driven**, com revisão a cada etapa. Este arquivo registra, de forma curada, o processo e as **decisões técnicas** que guiaram a implementação — com o raciocínio por trás de cada uma.

---

## Processo

1. **Brainstorming → spec.** Escopo, modelagem dos 3 problemas (vitrine, overselling, resiliência do checkout) e decisões de arquitetura definidos **antes** de escrever código.
2. **Plano de implementação.** Spec quebrado em tarefas verificáveis (TDD), arquivo por arquivo.
3. **Implementação com revisão por etapa.** Cada parte revisada quanto a conformidade com o spec e qualidade de código antes de seguir.
4. **Code review final.** Revisão do diff completo, com correções verificadas por testes.

---

## Decisões técnicas (e por quê)

### Consistência de estoque — reserva atômica
**Decisão:** `UPDATE products SET stock = stock - :q WHERE id = :id AND stock >= :q`.
**Por quê:** elimina overselling sem lock explícito nem transação longa — o banco rejeita atomicamente se `stock < qty`, sem janela de race entre leitura e escrita. É o cerne do Problema 02 e o que o teste de concorrência verifica empiricamente.

### Resiliência do checkout — reservar-então-faturar com compensação
**Decisão:** reservar o estoque atomicamente e só **depois** chamar o ERP, **fora** da transação de reserva; em falha, compensar (devolver o estoque) em outro `UPDATE` atômico.
**Por quê:** não serializa a latência do ERP na seção crítica, e a janela de race nunca toca o estoque. Trata o Problema 03 sem bloquear leitores.

### Idempotência — `INSERT` em coluna UNIQUE
**Decisão:** o cliente envia uma `Idempotency-Key` por tentativa; o servidor faz `INSERT` numa coluna UNIQUE e deixa o banco arbitrar (não check-then-insert). Falha transitória do ERP **libera** a chave, permitindo retry com a mesma chave.
**Por quê:** fecha a corrida de duplo-clique e retry concorrente de forma simples e correta, sem lock de aplicação nem estado em memória.

### Timeout vs. retry — falhar rápido na lentidão
**Decisão:** timeout por tentativa; **lentidão/timeout → falha rápida**, **erro transitório → retry limitado**, com orçamento de latência total fechado.
**Por quê:** retry sobre lentidão comporia timeouts e pioraria justamente o cenário lento do ERP — a distinção é o que torna a resiliência correta, não apenas aparente.

### Teste de concorrência — `Promise.all` contra o handler HTTP real
**Decisão:** disparar N checkouts concorrentes contra `POST /checkout` e afirmar exatamente `floor(estoque / qty)` sucessos e estoque nunca negativo.
**Por quê:** prova a ausência de overselling exercitando o caminho completo (HTTP → handler → `UPDATE` → SQLite) com concorrência real — evidência, não só inspeção de código.
