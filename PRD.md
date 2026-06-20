# PRD — Studio MNunesnails · Sistema de Agendamento Online

**Versão:** 1.0  
**Data:** 2026-06-20  
**Status:** Revisão técnica para entrega acadêmica

---

## 1. Visão geral do produto

Sistema web de agendamento para um studio de manicure. Permite que clientes escolham serviços e horários online, e que a administradora gerencie a agenda, disponibilidade, serviços e clientes por um painel dedicado.

### Stack técnica
| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla |
| Backend | Python 3 (`http.server` puro, sem framework) |
| Banco de dados | Google Cloud Firestore (primário e único ativo) |
| Autenticação | Sessões com cookie HTTP + Firebase Auth SMS (recuperação de senha) |
| Hospedagem | Render (conforme commits recentes) |

---

## 2. Funcionalidades implementadas

### 2.1 Página pública — `index.html`
- [x] Exibição de serviços carregados dinamicamente da API
- [x] Seleção de serviço via cards ou `<select>`
- [x] Calendário de datas disponíveis (dialog customizado)
- [x] Grid de horários disponíveis (carregados da API)
- [x] Painel de resumo do agendamento em tempo real
- [x] Botão "Enviar para WhatsApp" com mensagem pré-formatada
- [x] Salvar agendamento no banco ao confirmar
- [x] Progresso visual em 3 etapas (Dados / Serviço / Horário)
- [x] Rascunho de agendamento em `sessionStorage` para restaurar após login
- [x] Redirecionamento automático para cadastro se não autenticado

### 2.2 Autenticação — `login.html` + `admin-login.html`
- [x] Login de cliente por telefone + senha
- [x] Cadastro de cliente (nome, WhatsApp, senha)
- [x] Recuperação de senha via SMS (Firebase Auth / reCAPTCHA)
- [x] Login administrativo separado (`admin-login.html`)
- [x] Toggle de visibilidade de senha
- [x] Redirecionamento pós-login com parâmetro `?next=booking`

### 2.3 Área da cliente — `agendamentos.html`
- [x] Listagem de agendamentos do usuário logado
- [x] Métricas (total, confirmados, alterados, cancelados)
- [x] Filtro por status + busca por texto (client-side)
- [x] Editor inline: alterar serviço, data, horário, status, observações
- [x] Cancelar agendamento
- [x] Duplicar agendamento
- [x] Logout

### 2.4 Painel administrativo — `admin.html`
- [x] Visão geral de todos os agendamentos com filtros (data, status, busca)
- [x] Editor de agendamentos (criar, editar, cancelar, excluir, duplicar)
- [x] Gerenciamento de disponibilidade (ativar/bloquear horários por slot ou dia inteiro)
- [x] Calendário de disponibilidade com navegador mensal
- [x] Gerenciamento de serviços (criar, editar, ativar/desativar, excluir)
- [x] Gerenciamento de clientes (editar, excluir)
- [x] Logout

### 2.5 Backend — `server.py` + `firestore_backend.py`
- [x] API REST completa (`/api/appointments`, `/api/users`, `/api/services`, `/api/availability`)
- [x] Autenticação por cookie de sessão (HttpOnly, SameSite=Lax)
- [x] Controle de conflito de horários com base na duração do serviço
- [x] Verificação de token Firebase para recuperação de senha
- [x] Servir arquivos estáticos (HTML, CSS, JS)
- [x] Inicialização automática de admin padrão, serviços padrão e janela de disponibilidade

---

## 3. Bugs encontrados

### BUG-01 — Crítico · `agendamentos.js` usa horários estáticos, não a API
**Arquivo:** [agendamentos.js:1-52](agendamentos.js#L1-L52)  
**Impacto:** Ao editar um agendamento, os seletores de data e horário do editor mostram horários gerados localmente de forma estática (baseados apenas no dia da semana). O sistema não consulta a API `/api/availability` em nenhum momento nessa página.

**Consequência prática:**
- O cliente pode selecionar um horário bloqueado pelo admin
- O cliente pode selecionar um horário já ocupado por outra cliente
- A tentativa de salvar retorna erro 400, mas sem orientação clara de qual horário está livre
- Domingos não existem no `dailySlots` (chave `0` ausente), tornando impossível editar agendamentos de domingo

**Correção necessária:** Carregar `GET /api/availability` ao iniciar a página, como o `index.html` já faz, e usar esses dados nos seletores do editor.

---

### BUG-02 — Crítico · Número de WhatsApp hardcoded como placeholder
**Arquivo:** [script.js:525](script.js#L525)  
**Linha:** `https://wa.me/5511999999999?text=${text}`

O botão "Enviar para WhatsApp" sempre abre uma conversa com `5511999999999` (número fictício). Qualquer cliente que clique nesse botão será redirecionado para um número que não é o studio.

**Correção necessária:** Substituir pelo número real do studio, ou carregar de uma variável de ambiente exposta via `/api/firebase-config` ou similar.

---

### BUG-03 — Médio · `agendamentos.html` — serviços do editor são hardcoded
**Arquivo:** [agendamentos.html:103-110](agendamentos.html#L103-L110)  
O `<select name="service">` no editor da área da cliente lista os 6 serviços originais fixos no HTML. Se o admin adicionar, remover ou renomear um serviço, o editor da cliente não reflete essas mudanças — podendo gerar um agendamento com um serviço inválido ou inexistente.

**Correção necessária:** Carregar a lista de serviços via `GET /api/services` e popular o select dinamicamente (como o `admin.js` já faz para o editor admin).

---

### BUG-04 — Médio · Código morto — `dailySlots` e `buildAvailability` em todos os arquivos JS
**Arquivos:** [script.js:1-8](script.js#L1-L8), [agendamentos.js:1-52](agendamentos.js#L1-L52), [admin.js:1-65](admin.js#L1-L65)

- Em `script.js`: `dailySlots`, `weekdayFormatter` e `shortDateFormatter` são declarados mas **nunca usados**
- Em `admin.js`: `buildAvailability()` é definida mas **nunca chamada** (sobreposta pelo `loadAvailability()` via API)
- Em `agendamentos.js`: `buildAvailability()` é chamada, mas deveria ser substituída pela API (ver BUG-01)

Esse código cria confusão sobre de onde vêm os dados reais e deixa a manutenção mais difícil.

---

### BUG-05 — Médio · `login.html` — divider "ou" sem contexto
**Arquivo:** [login.html:35](login.html#L35), [login.html:68](login.html#L68)

Ambos os formulários (login e cadastro) têm um `<div class="auth-divider"><span>ou</span></div>` logo abaixo do cabeçalho, mas **não há nenhum elemento acima dele** (como login social ou por biometria) com o qual o "ou" faça sentido. É um remanescente de uma funcionalidade removida.

**Correção:** Remover os dois dividers.

---

### BUG-06 — Médio · Métricas do admin contam apenas agendamentos filtrados
**Arquivo:** [admin.js:784-807](admin.js#L784-L807)  
Os números de "Total / Confirmados / Alterados / Cancelados" são calculados sobre `appointments`, que já é a lista filtrada pelos filtros ativos (data, status, busca). Ao filtrar por "Confirmados", o painel mostrará "0 cancelados" — não o total real.

**Correção:** Manter uma cópia separada do total geral de agendamentos para calcular as métricas, independente do filtro ativo.

---

### BUG-07 — Médio · `firestore_backend.py` — `ensure_availability_window` chamado em cada verificação de slot
**Arquivo:** [firestore_backend.py:812-813](firestore_backend.py#L812-L813)

`is_slot_available` → `ensure_availability_window`, que percorre **todos os dias do ano** e tenta criar slots no Firestore para cada um que ainda não existe. Isso gera dezenas a centenas de operações Firestore por requisição de agendamento. O custo escala linearmente com o número de dias restantes no ano.

**Correção:** Chamar `ensure_availability_window` apenas na inicialização do servidor (`init_database()`), não a cada verificação.

---

### BUG-08 — Baixo · Cookie de sessão sem flag `Secure`
**Arquivo:** [server.py:2105](server.py#L2105)  
`f"{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax"`

Em produção no Render (HTTPS), a ausência da flag `Secure` permite que o cookie seja enviado em conexões HTTP. Embora o Render force HTTPS, a flag deve estar presente por boa prática de segurança.

**Correção:** Adicionar `; Secure` quando `os.environ.get("RENDER")` ou `HTTPS` estiver ativo.

---

### BUG-09 — Baixo · `package.json` descreve dependências Node.js que nunca são usadas
**Arquivo:** [package.json](package.json)  
O backend é Python puro. O `package.json` lista `express`, `pg`, `typeorm` e `dotenv` — dependências de um backend Node.js que não existe no projeto. A descrição ainda diz "banco de dados local em SQLite", desatualizada. Não causa erro funcional, mas é enganoso para quem lê o projeto.

---

### BUG-10 — Baixo · `package.json` aponta `"main": "admin.js"` incorretamente
**Arquivo:** [package.json:6](package.json#L6)  
`"main": "admin.js"` indica um entrypoint Node.js para o frontend JavaScript. O entrypoint real do servidor é `server.py`.

---

### BUG-11 — Baixo · Rótulo de data não inclui ano — problema em virada de ano
**Arquivo:** [server.py:567-569](server.py#L567-L569), [firestore_backend.py:144-146](firestore_backend.py#L144-L146)

As datas são salvas no formato `"Segunda-feira, 20/06"` sem o ano. A função `date_from_label` reconstrói a data usando `today.replace(month=month, day=day)` com o **ano atual**. Isso significa que agendamentos criados em dezembro para janeiro do ano seguinte serão tratados como se fossem de janeiro do ano anterior (já passado), e não aparecerão na disponibilidade.

---

### BUG-12 — Baixo · Cadastro sem confirmação de senha
**Arquivo:** [login.html:62-97](login.html#L62-L97)

O formulário de cadastro tem apenas um campo de senha, sem "confirmar senha". Uma digitação errada cria uma conta com senha desconhecida, e o usuário só descobre ao tentar fazer login.

---

## 4. Melhorias necessárias (não são bugs, mas impactam qualidade)

### M-01 · Não há nenhum teste automatizado
Nenhum teste unitário, de integração ou E2E. Para um trabalho acadêmico, mesmo testes simples nas funções críticas (`is_slot_available`, `appointment_overlaps_existing`) demonstrariam qualidade de software.

---

### M-02 · Sem proteção CSRF explícita
As requisições de mutação (POST/PUT/DELETE) aceitam qualquer origem desde que o cookie de sessão seja enviado. `SameSite=Lax` mitiga o principal vetor, mas um ataque com redirecionamento (link externo → navegação top-level) pode acionar GETs — e se houver ações destrutivas via GET, seriam vulneráveis.

---

### M-03 · Senha padrão do admin nunca expira
**Arquivo:** [server.py:30-34](server.py#L30-L34)  
O admin padrão `(telefone: 00000000000, senha: admin123)` é criado automaticamente em qualquer nova instalação. Não há aviso na interface ou mecanismo para forçar troca na primeira sessão.

---

### M-04 · Nenhuma paginação nos agendamentos do admin
Se o studio acumular centenas de agendamentos, todos são carregados de uma vez via `GET /api/appointments`. Sem paginação, o painel fica lento e o Firestore é cobrado por leitura de todos os documentos.

---

### M-05 · Código duplicado entre `script.js`, `agendamentos.js` e `admin.js`
As funções `escapeHtml`, `showToast`, `getStatusClass`, `getDateParts` e `requestJson` são copiadas e coladas nos três arquivos JS. Se houver um bug em uma delas, precisa ser corrigido em três lugares.

**Sugestão:** Extrair para um `utils.js` compartilhado com `<script src="utils.js">` nas três páginas.

---

### M-06 · `server.py` tem ~800 linhas de código SQLite que nunca executam
**Arquivo:** [server.py:311-1677](server.py#L311-L1677)  
Toda a lógica SQLite é código morto desde que `use_firestore()` retorna sempre `True`. Isso aumenta o tamanho do arquivo, dificulta leitura e manutenção, e pode confundir colaboradores.

---

### M-07 · Sem confirmação antes de cancelar agendamento (área da cliente)
**Arquivo:** [agendamentos.js:379-410](agendamentos.js#L379-L410)  
O botão "Cancelar agendamento" na área da cliente executa imediatamente ao clique, sem nenhum `window.confirm`. O admin tem o confirm; a cliente, não.

---

### M-08 · Disponibilidade no `index.html` exibe apenas slots livres, ocultando os ocupados
**Arquivo:** [script.js:392-401](script.js#L392-L401)  
`availability` é populado filtrando apenas slots disponíveis. O cliente não consegue ver que horários estão ocupados — simplesmente não aparecem no seletor de datas. Um dia com todos os horários ocupados desaparece do calendário sem explicação, podendo parecer que o studio está fechado naquele dia.

---

### M-09 · Sem favicon ou ícone de app
Nenhuma das páginas declara um `<link rel="icon">`. Navegadores exibem o ícone genérico, o que reduz o nível de acabamento visual do projeto.

---

### M-10 · `server.py` sem tratamento de exceção no `main()`
**Arquivo:** [server.py:2140-2157](server.py#L2140-L2157)  
Se `init_database()` falhar (Firestore indisponível ou credenciais ausentes), o servidor lança uma exceção não tratada e termina com stack trace no terminal, sem mensagem de erro clara.

---

## 5. Resumo prioritário para entrega

| Prioridade | Item | Esforço estimado |
|---|---|---|
| 🔴 Crítico | BUG-01: Carregar disponibilidade da API em `agendamentos.js` | Alto |
| 🔴 Crítico | BUG-02: Corrigir número de WhatsApp hardcoded | Baixo |
| 🟠 Alto | BUG-03: Carregar serviços dinamicamente em `agendamentos.html` | Médio |
| 🟠 Alto | BUG-12: Adicionar campo "confirmar senha" no cadastro | Baixo |
| 🟠 Alto | M-07: Adicionar confirm antes de cancelar (cliente) | Baixo |
| 🟡 Médio | BUG-04: Remover código morto (`dailySlots`, `buildAvailability`) | Baixo |
| 🟡 Médio | BUG-05: Remover dividers "ou" sem contexto em `login.html` | Baixo |
| 🟡 Médio | BUG-06: Corrigir métricas do admin para usar total real | Médio |
| 🟡 Médio | BUG-07: Mover `ensure_availability_window` para fora do hot path | Médio |
| 🔵 Baixo | BUG-08: Adicionar flag `Secure` ao cookie de sessão | Baixo |
| 🔵 Baixo | BUG-09/10: Corrigir `package.json` | Baixo |
| 🔵 Baixo | M-09: Adicionar favicon | Baixo |

---

## 6. O que está funcionando bem

- Controle de conflito de horários considerando duração do serviço é sofisticado e correto
- `escapeHtml` aplicado consistentemente nos templates — sem risco de XSS
- Senhas com PBKDF2 + salt aleatório (180.000 iterações) — segurança adequada
- Recuperação de senha via SMS com verificação server-side do token Firebase é um fluxo correto
- Cookie de sessão com `HttpOnly` e `SameSite=Lax` — boas práticas aplicadas
- Rascunho de agendamento em `sessionStorage` — UX cuidadosa para o fluxo de cadastro
- Painel admin com tabs acessíveis via teclado (setas + Enter)
- `escapeHtml` antes de injetar qualquer dado no DOM em todos os três arquivos JS
