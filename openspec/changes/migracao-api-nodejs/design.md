## Context

O MnunesNails possui um frontend HTML/CSS/JS vanilla que hoje se comunica com dois backends simultâneos: um servidor Python (Flask + Firestore) e uma API Node.js (Express + PostgreSQL + JWT). O frontend também carrega o Firebase SDK via CDN para o fluxo de recuperação de senha via SMS. O objetivo é eliminar os backends Python e Firebase, tornando a API Node.js a única fonte de verdade.

**Stack atual:**
- Frontend: HTML/CSS/JS vanilla, `login.html`, `agendamentos.html`, `script.js`, `admin.js`
- Backend Python: `server.py` + `firestore_backend.py` (autenticação via cookie de sessão, Firestore como DB)
- Backend Node.js (`-MnunesNails.api`): Express, Sequelize, PostgreSQL, JWT
- Firebase Auth: SDK carregado no browser via CDN, usado exclusivamente para SMS de recovery

**Estrutura da API Node.js:** Segue o padrão `entity → service → controller → router`. Entidades Sequelize em `src/models/`, controllers em `src/controllers/`, rotas em `src/routes/`.

## Goals / Non-Goals

**Goals:**
- Frontend comunica exclusivamente com a API Node.js
- Todos os endpoints listados no PRD implementados na API Node.js
- PostgreSQL como único banco de dados
- JWT como único mecanismo de autenticação (substituir cookies de sessão do Python)
- Recuperação de senha sem Firebase (token numérico armazenado no PostgreSQL)
- Frontend tem camada `api.js` centralizada (sem fetch direto espalhado nos arquivos)
- Rotas admin protegidas por middleware `requireAdmin`

**Non-Goals:**
- Redesign de UI ou mudança de tecnologia do frontend
- Deploy, CI/CD ou configuração de servidor de produção
- Migração de dados do Firestore para PostgreSQL
- Configuração de canal real de WhatsApp para recovery em produção (MVP usa log)
- Testes automatizados (fora do escopo desta mudança)

## Decisions

### D1: Recuperação de senha via token numérico próprio (sem Firebase)

**Decisão:** Gerar token de 6 dígitos no backend Node.js, armazenar com TTL de 10 min na tabela `recovery_tokens`, e entregar ao usuário via WhatsApp API ou log em dev.

**Alternativas consideradas:**
- Manter Firebase Auth → requer projeto Firebase configurado, chave exposta no frontend, custo por SMS
- E-mail → usuários são identificados por telefone/WhatsApp, sem e-mail cadastrado
- Token em JWT → não permite invalidação; não há vantagem sobre token simples no banco

**Rationale:** Token armazenado no banco é simples, auditável e permite invalidação (campo `used`). A entrega por WhatsApp é natural para um salão de beleza onde os clientes já interagem por este canal.

### D2: `phone` como identificador único de usuário (sem mudança de campo)

**Decisão:** Manter `phone` como identificador primário em `users`. O registro via `POST /api/auth/register` recebe `whatsapp` no body e salva como `phone` (são o mesmo número).

**Alternativas consideradas:**
- Criar campo separado `whatsapp` distinto de `phone` → desnecessário; o telefone do WhatsApp é o mesmo número de login

**Rationale:** Simplifica o modelo e mantém compatibilidade com o login existente (`POST /api/auth/login` usa `phone + password`).

### D3: Admin identificado por campo `role` na tabela `users`

**Decisão:** Adicionar `role VARCHAR(10) DEFAULT 'client'` em `users`. Admin faz login pelo mesmo endpoint de login regular (`POST /api/auth/login`), mas existe um endpoint adicional `POST /api/auth/admin-login` que retorna erro 403 se `role !== 'admin'`. O JWT inclui `role` no payload.

**Alternativas consideradas:**
- Tabela separada de admins → sobrecomplexidade; o sistema tem apenas dois papéis
- Verificação de role só no middleware → não comunica claramente ao frontend que o login falhou por falta de permissão de admin

**Rationale:** Campo `role` no JWT permite que o frontend faça verificações de UI sem chamadas extras, e o middleware `requireAdmin` centraliza a autorização no backend.

### D4: `api.js` como única camada de comunicação no frontend

**Decisão:** Criar `api.js` incluído em todos os HTMLs com funções `getToken()`, `getAuthHeaders()` e `apiFetch()`. Todo fetch passa por `apiFetch`, que lida com o header Authorization e a URL base.

**Alternativas consideradas:**
- Refatorar cada arquivo independentemente sem abstração → código duplicado, difícil de trocar a URL base ou o mecanismo de auth no futuro
- Usar fetch nativo direto em cada arquivo → já é o que existe; é o problema a resolver

**Rationale:** Centralizar em `api.js` minimiza as mudanças nos arquivos existentes (substituir `fetch(url, ...)` por `apiFetch(path, ...)`) e torna a troca de `localStorage` para outra estratégia de auth trivial.

### D5: Sequência de migration com Sequelize

**Decisão:** Usar `queryInterface.addColumn` para migrations destrutivamente seguras em `users` e `appointments`; `queryInterface.createTable` para `availability` e `recovery_tokens`. Colunas novas em tabelas existentes são nullable inicialmente para não quebrar registros existentes, com default definido via `defaultValue`.

**Rationale:** Evita lock de tabela em produção e permite rollback limpo com `queryInterface.removeColumn` / `queryInterface.dropTable`.

## Risks / Trade-offs

| Risco | Mitigação |
|-------|-----------|
| Dados existentes no Firestore ficam inacessíveis após remoção do Python server | Decisão explícita de não migrar dados (PostgreSQL começa do zero); documentar no PRD |
| Canal de entrega do token de recovery não funcional em produção (sem WhatsApp API configurada) | MVP usa log em `console.log`; integração real é tarefa separada |
| Frontend sem `server.py` rodando localmente fica sem backend durante desenvolvimento | Desenvolvedores devem rodar a API Node.js localmente (`npm start` em `-MnunesNails.api`) |
| JWT no `localStorage` é vulnerável a XSS | Escopo aceito; o sistema não usa `httpOnly` cookies nem Content Security Policy atualmente; não é regressão em relação ao estado atual |
| Seed de admin sem interface | Script de seed (`npm run seed:admin`) ou variável de ambiente para criar admin inicial |

## Migration Plan

1. **Fase 1 — Backend:** Aplicar migrations, implementar novos endpoints, adicionar middleware, CORS
2. **Fase 2 — Frontend:** Criar `api.js`, migrar cada arquivo JS um por vez (login → script → agendamentos → admin), incluir `api.js` nos HTMLs
3. **Fase 3 — Limpeza:** Remover arquivos Python e referências Firebase após validação E2E

**Rollback:** Durante a Fase 2, o servidor Python pode continuar rodando em paralelo enquanto cada arquivo JS é migrado. Não há rollback automático — se necessário, reverter via git.

## Open Questions

1. **Canal de delivery do token de recovery:** WhatsApp API (Z-API, Twilio) ou apenas log em dev até decisão do cliente?
2. **URL base da API em produção:** `config.js` substituído no deploy, meta tag HTML, ou variável de ambiente injetada no build?
3. **Seed do usuário admin:** Script `npm run seed:admin` com credenciais via `.env`, ou endpoint temporário protegido por `SEED_SECRET`?
