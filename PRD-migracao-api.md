# PRD — Migração Firebase + Python Server → API Node.js

**Versão:** 1.0  
**Data:** 2026-06-20  
**Autor:** Lucas  
**Status:** Rascunho

---

## 1. Contexto e Motivação

O frontend do MnunesNails possui atualmente **duas dependências externas** que precisam ser eliminadas:

1. **Firebase Auth (SMS)** — usado exclusivamente na recuperação de senha em `login.js`, via SDK carregado do CDN.
2. **Servidor Python + Firestore** — `server.py` e `firestore_backend.py` atuam como backend intermediário com banco de dados próprio (Firestore), expondo sua própria API REST.

O backend Node.js (`-MnunesNails.api`) já existe, usa PostgreSQL + JWT e é a fonte de verdade que deve substituir ambas as dependências. O objetivo é que o **frontend se comunique exclusivamente com a API Node.js**, removendo Firebase e o servidor Python do projeto.

---

## 2. Problema

| # | Problema Atual | Impacto |
|---|----------------|---------|
| 1 | Firebase SDK carregado no browser para SMS de recuperação de senha | Dependência de serviço externo pago, chave de API exposta no frontend, necessidade de projeto Firebase configurado |
| 2 | Servidor Python com Firestore roda em paralelo ao backend Node.js | Dois backends com dados separados, regras de negócio duplicadas, inconsistência entre Firestore e PostgreSQL |
| 3 | Autenticação por cookie de sessão (Python) convivendo com JWT (Node.js) | Dois sistemas de auth incompatíveis; o frontend mistura os dois mecanismos |
| 4 | Endpoints de disponibilidade (`/api/availability`) existem só no Python server | A API Node.js não cobre essa funcionalidade |
| 5 | Entidades do PostgreSQL incompletas | `users` sem `name`/`whatsapp`/`role`; `appointments` sem `service_id`/`status`/`notas`; sem tabela `availability` |

---

## 3. Objetivo

> Fazer o frontend se comunicar **exclusivamente** com a API Node.js (`-MnunesNails.api`), eliminando qualquer dependência de Firebase e do servidor Python.

**Fora de escopo:**
- Redesign de interface
- Mudança de tecnologia do frontend (continua HTML/CSS/JS vanilla)
- Deploy, CI/CD e migração de dados do Firestore para PostgreSQL

---

## 4. Estado atual das APIs

### 4.1 Endpoints que o frontend usa hoje (via Python server)

```
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/admin-login
POST   /api/auth/recover-password
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/firebase-config          ← exclusivo do Python server (remover)
GET    /api/appointments
POST   /api/appointments
PUT    /api/appointments/:id
DELETE /api/appointments/:id
POST   /api/appointments/:id/cancel
POST   /api/appointments/:id/duplicate
GET    /api/services
POST   /api/services
PUT    /api/services/:id
DELETE /api/services/:id
GET    /api/availability
PUT    /api/availability/:id
PUT    /api/availability/day/:date
GET    /api/health
```

### 4.2 O que a API Node.js já tem

```
POST   /api/auth/login          ✅ (phone + password → JWT)
POST   /api/users               ✅ (register — body diferente do frontend)
GET    /api/users               ✅
GET    /api/appointments        ✅ (auth required)
GET    /api/appointments/:id    ✅ (auth required)
POST   /api/appointments        ✅ (auth required)
PUT    /api/appointments/:id    ✅ (auth required)
DELETE /api/appointments/:id    ✅ (auth required)
GET    /api/services            ✅
GET    /api/services/:id        ✅
POST   /api/services            ✅ (auth required)
PUT    /api/services/:id        ✅ (auth required)
DELETE /api/services/:id        ✅ (auth required)
GET    /api/health              ✅
```

### 4.3 Gaps — o que falta na API Node.js

```
POST   /api/auth/register        ⚠️  Existe como POST /api/users, mas body diferente (falta name, whatsapp)
POST   /api/auth/admin-login     ❌  Não existe (admin identificado por role)
POST   /api/auth/logout          ❌  Não existe (JWT é stateless; só precisa retornar 200)
GET    /api/auth/me              ❌  Não existe
POST   /api/auth/request-recovery ❌ Não existe (substitui Firebase SMS)
POST   /api/auth/recover-password ❌ Não existe
POST   /api/appointments/:id/cancel    ❌ Não existe
POST   /api/appointments/:id/duplicate ❌ Não existe
GET    /api/availability         ❌  Tabela não existe
PUT    /api/availability/:id     ❌  Tabela não existe
PUT    /api/availability/day/:date ❌ Tabela não existe
```

---

## 5. Mudanças necessárias na API Node.js

### 5.1 Banco de dados — novas migrations

#### Migration 1: Adicionar campos em `users`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | VARCHAR(150) | Nome do cliente |
| `whatsapp` | VARCHAR(30) | Número WhatsApp (pode ser igual ao `phone`) |
| `role` | VARCHAR(10) DEFAULT 'client' | Papel: `'client'` ou `'admin'` |

#### Migration 2: Adicionar campos em `appointments`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `service_id` | INTEGER FK → services | Serviço agendado |
| `status` | VARCHAR(20) DEFAULT 'pendente' | `pendente`, `confirmado`, `alterado`, `cancelado` |
| `notas` | TEXT nullable | Observações |

#### Migration 3: Criar tabela `availability`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PK AUTO | - |
| `date` | DATE | Data do slot (ex: `2026-06-20`) |
| `time` | VARCHAR(10) | Horário (ex: `"14:30"`) |
| `available` | BOOLEAN DEFAULT true | Se o slot está disponível |
| `createdAt` | DATETIME | - |
| `updatedAt` | DATETIME | - |

#### Migration 4: Criar tabela `recovery_tokens`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER PK AUTO | - |
| `user_id` | INTEGER FK → users | Dono do token |
| `token` | VARCHAR(6) | Código numérico de 6 dígitos |
| `expires_at` | DATETIME | Expiração (10 minutos após criação) |
| `used` | BOOLEAN DEFAULT false | Se já foi utilizado |
| `createdAt` | DATETIME | - |

### 5.2 Novos endpoints

#### Auth

| Método | Endpoint | Body | Resposta | Notas |
|--------|----------|------|----------|-------|
| `POST` | `/api/auth/register` | `{ name, whatsapp, password }` | `{ token }` | Unificar com `POST /api/users`; salvar `phone = whatsapp`; retornar JWT |
| `GET` | `/api/auth/me` | — (JWT header) | `{ id, name, phone, role }` | Decodifica JWT e retorna dados do usuário |
| `POST` | `/api/auth/logout` | — | `{ message: "ok" }` | Stateless; só retorna 200 para o frontend limpar o token |
| `POST` | `/api/auth/admin-login` | `{ phone, password }` | `{ token }` | Igual ao login normal, mas verifica `role === 'admin'`; erro 403 se não for admin |
| `POST` | `/api/auth/request-recovery` | `{ phone }` | `{ message: "código enviado" }` | Gera token de 6 dígitos, salva com TTL de 10 min; envia via WhatsApp API ou exibe no log em dev |
| `POST` | `/api/auth/recover-password` | `{ phone, token, newPassword }` | `{ message: "senha alterada" }` | Valida token, verifica TTL e `used`, faz hash da nova senha, marca token como usado |

#### Agendamentos

| Método | Endpoint | Body | Resposta |
|--------|----------|------|----------|
| `POST` | `/api/appointments/:id/cancel` | — | `{ message: "cancelado" }` — atualiza `status = 'cancelado'` |
| `POST` | `/api/appointments/:id/duplicate` | — | Agendamento criado — cria cópia com `status = 'pendente'` |

#### Disponibilidade

| Método | Endpoint | Query/Body | Resposta |
|--------|----------|------------|----------|
| `GET` | `/api/availability` | `?date=YYYY-MM-DD` (opcional) | Lista de slots `{ id, date, time, available }` |
| `PUT` | `/api/availability/:id` | `{ available }` | Slot atualizado |
| `PUT` | `/api/availability/day/:date` | `{ available }` | Todos os slots da data atualizados |

### 5.3 Proteção de rotas admin

Criar middleware `requireAdmin` que verifica `req.user.role === 'admin'`. Aplicar em:
- `POST /api/services`
- `PUT /api/services/:id`
- `DELETE /api/services/:id`
- `PUT /api/availability/:id`
- `PUT /api/availability/day/:date`
- `GET /api/appointments` (admin vê todos; cliente vê só os seus — ajustar lógica)
- `DELETE /api/appointments/:id`

### 5.4 CORS

Adicionar `cors` middleware no `app.js` permitindo a origem do frontend (localhost em dev e domínio em prod).

---

## 6. Mudanças necessárias no Frontend

### 6.1 Criar `api.js` — camada de comunicação

Criar um arquivo `api.js` incluído em todas as páginas com:

```js
const API_BASE = 'http://localhost:3000'; // trocar por URL de prod via variável

function getToken() {
  return localStorage.getItem('authToken');
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: getAuthHeaders(),
    ...options
  });
  if (!res.ok) throw await res.json();
  return res.json();
}
```

### 6.2 Remover Firebase (`login.js`)

- Remover import dinâmico do Firebase SDK (CDN)
- Remover `initializeApp`, `getAuth`, `RecaptchaVerifier`, `signInWithPhoneNumber`
- Remover chamada `GET /api/firebase-config`
- Substituir o fluxo de SMS por:

**Novo fluxo de recuperação de senha:**
1. Tela 1: usuário informa o telefone → `POST /api/auth/request-recovery`
2. Tela 2: usuário informa o código de 6 dígitos recebido + nova senha → `POST /api/auth/recover-password`

### 6.3 Migrar autenticação de sessão para JWT

**Arquivos:** `login.js`, `script.js`, `agendamentos.js`, `admin.js`

- Após login/registro, salvar o JWT em `localStorage` com a chave `authToken`
- Substituir todos os checks de sessão por `GET /api/auth/me` (com JWT header)
- No logout: apagar `authToken` do `localStorage` e chamar `POST /api/auth/logout`
- Substituir todas as chamadas que usam cookie de sessão para usar `getAuthHeaders()`

### 6.4 Atualizar chamadas por arquivo

#### `login.js`
| Chamada atual | Ação |
|---------------|------|
| `GET /api/firebase-config` | **Remover** |
| Firebase SDK (SMS) | **Remover** — substituir por novo fluxo de recovery |
| `POST /api/auth/login` | Apontar para API Node.js; salvar JWT retornado |
| `POST /api/auth/register` | Apontar para `POST /api/auth/register` no Node.js |
| `POST /api/auth/recover-password` | Apontar para novos endpoints de recovery |

#### `script.js` (agendamento público)
| Chamada atual | Ação |
|---------------|------|
| `GET /api/services` | Apontar para API Node.js (sem auth) |
| `GET /api/availability` | Apontar para API Node.js (sem auth) |
| `GET /api/auth/me` | JWT header |
| `POST /api/appointments` | JWT header + incluir `service_id` no body |

#### `agendamentos.js` (área do cliente)
| Chamada atual | Ação |
|---------------|------|
| `GET /api/auth/me` | JWT header |
| `GET /api/appointments` | JWT header |
| `GET /api/appointments/:id` | JWT header |
| `PUT /api/appointments/:id` | JWT header |
| `POST /api/appointments/:id/cancel` | JWT header |
| `POST /api/appointments/:id/duplicate` | JWT header |
| `GET /api/availability` | JWT header |
| `GET /api/services` | Sem auth |
| `POST /api/auth/logout` | Limpar localStorage |

#### `admin.js` (painel admin)
| Chamada atual | Ação |
|---------------|------|
| `GET /api/auth/me` | JWT header; verificar `role === 'admin'` |
| Todos os endpoints de appointments | JWT header |
| Todos os endpoints de availability | JWT header |
| Todos os endpoints de services | JWT header |
| `POST /api/auth/logout` | Limpar localStorage |

### 6.5 Remover o servidor Python

Após migração completa, remover do repositório:

- `server.py`
- `firestore_backend.py`
- `tools/init_firestore.py`
- `requirements.txt`

O frontend passará a ser **arquivos estáticos puros** (HTML/CSS/JS) servidos por qualquer servidor estático ou CDN.

---

## 7. Plano de Implementação

### Fase 1 — Preparar a API (Backend primeiro)

| # | Tarefa | Tamanho |
|---|--------|---------|
| 1.1 | Migration: adicionar `name`, `whatsapp`, `role` em `users` | P |
| 1.2 | Migration: adicionar `service_id`, `status`, `notas` em `appointments` | P |
| 1.3 | Migration: criar tabela `availability` | P |
| 1.4 | Migration: criar tabela `recovery_tokens` | P |
| 1.5 | Atualizar `User.js` (entidade + service + controller) | P |
| 1.6 | Atualizar `Appointments.js` (entidade + service + controller) | P |
| 1.7 | Criar entidade + service + controller + rotas de `Availability` | M |
| 1.8 | Implementar `GET /api/auth/me` | P |
| 1.9 | Implementar `POST /api/auth/logout` | P |
| 1.10 | Implementar `POST /api/auth/admin-login` | P |
| 1.11 | Implementar `POST /api/auth/register` (unificar com `POST /api/users`) | P |
| 1.12 | Implementar `POST /api/auth/request-recovery` + `POST /api/auth/recover-password` | M |
| 1.13 | Implementar `POST /api/appointments/:id/cancel` | P |
| 1.14 | Implementar `POST /api/appointments/:id/duplicate` | P |
| 1.15 | Criar middleware `requireAdmin` e aplicar nas rotas | P |
| 1.16 | Ajustar `GET /api/appointments` para filtrar por usuário (cliente) ou retornar todos (admin) | P |
| 1.17 | Adicionar `cors` middleware | P |
| 1.18 | Script de seed para criar usuário admin padrão | P |

### Fase 2 — Migrar o Frontend

| # | Tarefa | Tamanho |
|---|--------|---------|
| 2.1 | Criar `api.js` com `API_BASE`, `getAuthHeaders()` e `apiFetch()` | P |
| 2.2 | Incluir `api.js` em todas as páginas HTML | P |
| 2.3 | Migrar `login.js`: remover Firebase, novo fluxo de recovery, salvar JWT | M |
| 2.4 | Migrar `script.js`: usar `api.js`, JWT, incluir `service_id` | P |
| 2.5 | Migrar `agendamentos.js`: usar `api.js`, JWT em todas as chamadas | M |
| 2.6 | Migrar `admin.js`: usar `api.js`, JWT, verificar role admin | M |

### Fase 3 — Limpeza

| # | Tarefa | Tamanho |
|---|--------|---------|
| 3.1 | Remover `server.py`, `firestore_backend.py`, `tools/init_firestore.py` | P |
| 3.2 | Remover `requirements.txt` | P |
| 3.3 | Remover variáveis Firebase do `.env.example` | P |
| 3.4 | Atualizar `package.json` (corrigir `main`, remover deps inválidas) | P |
| 3.5 | Testar fluxo completo E2E: cadastro → login → agendamento → admin | M |

**Legenda:** P = Pequeno (< 2h) · M = Médio (2–4h)

---

## 8. Critérios de Aceite

- [ ] Nenhuma referência ao Firebase SDK no código do frontend
- [ ] Nenhuma chamada ao servidor Python a partir do JS do frontend
- [ ] Cadastro e login de clientes funcionando via JWT
- [ ] Login de admin funcionando via JWT com verificação de `role`
- [ ] Recuperação de senha sem Firebase (token numérico via WhatsApp ou log em dev)
- [ ] Criar, editar, cancelar e duplicar agendamentos via API Node.js
- [ ] Gerenciamento de disponibilidade via API Node.js
- [ ] Gerenciamento de serviços via API Node.js
- [ ] `server.py` e `firestore_backend.py` removidos do repositório
- [ ] Frontend funciona como arquivos estáticos (sem servidor Python)
- [ ] Admin vê todos os agendamentos; cliente vê apenas os seus

---

## 9. Riscos e Decisões em Aberto

| # | Item | Risco | Decisão necessária |
|---|------|-------|-------------------|
| 1 | Canal do token de recuperação de senha | Sem Firebase SMS, como entregar o código ao usuário? | WhatsApp API (Z-API / Twilio), e-mail, ou exibir código na tela (só para MVP/dev) |
| 2 | Dados existentes no Firestore | Agendamentos e usuários existentes não estarão no PostgreSQL | Definir se migra dados ou inicia do zero |
| 3 | Seed do primeiro admin | Como criar o usuário admin inicial sem interface? | Script de seed ou endpoint temporário protegido por env secret |
| 4 | URL base da API em produção | Frontend precisa saber a URL do backend em prod | Definir estratégia: variável no HTML (meta tag), arquivo `config.js` substituído no deploy, ou proxy no servidor estático |
