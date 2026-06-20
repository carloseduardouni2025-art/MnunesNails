## Context

O sistema é uma aplicação web de agendamento para studio de manicure com stack: HTML/CSS/JS vanilla no frontend, Python `http.server` no backend e Firestore como banco de dados. O código está em produção no Render (HTTPS). Foram identificados 12 bugs no PRD, agrupados em 7 áreas de capacidade. Nenhuma rota nova de API é necessária — todos os bugs se resolvem com ajustes no cliente, no servidor e no inicializador do banco.

## Goals / Non-Goals

**Goals:**
- Corrigir os 12 bugs documentados no PRD (BUG-01 a BUG-12)
- Remover código morto que cria confusão sobre a fonte de dados real
- Melhorar segurança do cookie de sessão em produção
- Garantir que o editor da cliente nunca ofereça horários inválidos

**Non-Goals:**
- Introduzir testes automatizados (M-01)
- Adicionar proteção CSRF além do `SameSite=Lax` existente (M-02)
- Paginação de agendamentos no admin (M-04)
- Extração de `utils.js` compartilhado (M-05)
- Remoção do código SQLite morto em `server.py` (M-06)
- Adicionar favicon (M-09)

## Decisions

### 1. Disponibilidade no editor da cliente: chamada à API em vez de reconstrução local

**Decisão:** Em `agendamentos.js`, carregar `GET /api/availability` uma vez no `DOMContentLoaded` e armazenar o resultado em memória. Quando o usuário abrir o editor de um agendamento, popular o seletor de datas e de horários a partir desses dados, seguindo o mesmo padrão de `index.html`.

**Alternativa descartada:** Reusar `buildAvailability()` com a data do agendamento existente. Descartada porque a função gera slots estáticos sem considerar bloqueios do admin ou conflitos reais no Firestore.

**Rationale:** `index.html` já tem a lógica correta e funcionando. Replicar o mesmo fluxo em `agendamentos.js` é a mudança de menor risco.

---

### 2. Número de WhatsApp: variável de ambiente exposta via endpoint existente

**Decisão:** Adicionar `WHATSAPP_NUMBER` como variável de ambiente no servidor. Expô-la no payload de `GET /api/firebase-config` (endpoint já existe e é chamado por `script.js` no carregamento). O frontend lê o valor e o usa no link `wa.me/`.

**Alternativa descartada:** Hardcode direto do número correto no JS. Descartada porque qualquer mudança de número exigiria um novo deploy de código.

**Alternativa descartada:** Novo endpoint `/api/config`. Desnecessário — `/api/firebase-config` já tem exatamente esse papel de fornecer configuração ao cliente.

---

### 3. Serviços no editor da cliente: chamada à `/api/services`

**Decisão:** Em `agendamentos.js`, ao abrir o modal de edição, fazer `GET /api/services?active=true` e popular o `<select>` dinamicamente, substituindo as options hardcoded em `agendamentos.html`.

**Rationale:** `admin.js` já faz isso no editor admin. Reutilizar o mesmo padrão.

---

### 4. `ensure_availability_window`: mover para `init_database()`

**Decisão:** Remover a chamada a `ensure_availability_window` dentro de `is_slot_available`. Garantir que ela seja chamada apenas em `init_database()` durante a inicialização do servidor.

**Risco:** Se o servidor for reiniciado sem que novos dias tenham sido provisionados, os slots futuros podem não existir. Mitigação: a janela provisionada por `ensure_availability_window` já cobre um ano inteiro. Uma reinicialização diária ou semanal é suficiente para manter a janela atualizada.

---

### 5. Labels de data com ano

**Decisão:** Alterar o formato de `"Segunda-feira, 20/06"` para `"Segunda-feira, 20/06/2026"` tanto na geração (Firestore/backend) quanto na interpretação (`date_from_label`). A função de parsing precisará extrair o ano da string ou, quando ausente, inferir com lógica de rollover (se o mês/dia já passou neste ano, usar ano+1).

**Alternativa:** Usar formato ISO `YYYY-MM-DD` internamente. Descartada porque mudaria o contrato de dados com registros existentes no Firestore, exigindo migração.

---

### 6. Cookie Secure: condicional ao ambiente

**Decisão:** Em `server.py`, ao montar o header `Set-Cookie`, adicionar `; Secure` se `os.environ.get("RENDER") or os.environ.get("HTTPS")` estiver definido.

**Rationale:** Em desenvolvimento local (HTTP), o flag `Secure` impede que o cookie seja enviado, quebrando o fluxo de login. A condicionalidade mantém o DX local intacto.

---

### 7. Métricas do admin: variável separada para o total não filtrado

**Decisão:** Em `admin.js`, manter uma variável `allAppointments` com a lista completa retornada pela API. As métricas de totais são calculadas sobre `allAppointments`. A variável `appointments` (usada na tabela) continua sendo o subconjunto filtrado.

---

### 8. Confirmação de senha no cadastro

**Decisão:** Adicionar campo `<input type="password" id="confirmPassword">` abaixo do campo de senha no formulário de cadastro em `login.html`. O JavaScript de `login.html` valida client-side que os dois campos são iguais antes de submeter. O backend não muda (a validação server-side de senha já existe no fluxo de login).

---

### 9. Remoção de código morto e limpeza

**Decisão:** Remover `dailySlots`, `weekdayFormatter`, `shortDateFormatter` de `script.js`; remover `buildAvailability` e `dailySlots` de `admin.js`; remover `buildAvailability` e `dailySlots` de `agendamentos.js` após substituir pela chamada à API; remover os dois `<div class="auth-divider">` de `login.html`; corrigir `package.json` para refletir a stack real (Python/Firestore, sem dependências Node.js).

## Risks / Trade-offs

- [Dados existentes no Firestore com datas sem ano] → Lógica de rollover em `date_from_label` garante compatibilidade retroativa: se a string não tem ano, inferir com base no mês/dia vs. data atual
- [Variável `WHATSAPP_NUMBER` não definida no Render] → Fallback para string vazia com log de aviso; o botão de WhatsApp deve mostrar erro visual em vez de abrir número fictício
- [Remoção de `buildAvailability` em `agendamentos.js`] → A função é a única fonte de horários nessa página; remover antes de conectar a API cria regressão. A implementação DEVE conectar a API antes de remover o código morto

## Migration Plan

1. Aplicar todas as mudanças em um único PR
2. Definir a variável `WHATSAPP_NUMBER` no painel do Render antes do deploy
3. Deploy no Render (sem migrações de banco necessárias)
4. Verificar manualmente: (a) editor da cliente carrega horários reais, (b) botão WhatsApp abre número correto, (c) cadastro valida senha, (d) métricas do admin somam corretamente sem filtro ativo

## Open Questions

~~Qual é o número de WhatsApp real do studio?~~ **Resolvido:** número é `11976779251` (Brasil → `5511976779251` no formato `wa.me`). Configurar `WHATSAPP_NUMBER=5511976779251` no painel do Render antes do deploy.
