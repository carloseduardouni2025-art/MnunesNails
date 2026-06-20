## 1. Migrations — Banco de dados (API Node.js)

- [x] 1.1 Criar migration para adicionar `name VARCHAR(150)`, `whatsapp VARCHAR(30)` e `role VARCHAR(10) DEFAULT 'client'` na tabela `users`
- [x] 1.2 Criar migration para adicionar `service_id INTEGER FK → services`, `status VARCHAR(20) DEFAULT 'pendente'` e `notas TEXT nullable` na tabela `appointments`
- [x] 1.3 Criar migration para criar tabela `availability` com colunas `id`, `date`, `time`, `available`, `createdAt`, `updatedAt`
- [x] 1.4 Criar migration para criar tabela `recovery_tokens` com colunas `id`, `user_id FK → users`, `token VARCHAR(6)`, `expires_at`, `used BOOLEAN DEFAULT false`, `createdAt`, `updatedAt`
- [x] 1.5 Aplicar todas as migrations e verificar schema no banco

## 2. Modelos Sequelize (API Node.js)

- [x] 2.1 Atualizar model `User` para incluir campos `name`, `whatsapp`, `role`
- [x] 2.2 Atualizar model `Appointment` para incluir campos `service_id`, `status`, `notas`
- [x] 2.3 Criar model `Availability` com todos os campos da tabela
- [x] 2.4 Criar model `RecoveryToken` com todos os campos da tabela e associação FK com `User`

## 3. Autenticação — Novos endpoints (API Node.js)

- [x] 3.1 Implementar `POST /api/auth/register` — recebe `{ name, whatsapp, password }`, salva `phone = whatsapp`, retorna JWT
- [x] 3.2 Implementar `GET /api/auth/me` — decodifica JWT do header e retorna `{ id, name, phone, role }`
- [x] 3.3 Implementar `POST /api/auth/logout` — retorna `{ message: "ok" }` com status 200 (stateless)
- [x] 3.4 Implementar `POST /api/auth/admin-login` — igual ao login mas retorna 403 se `role !== 'admin'`
- [x] 3.5 Criar middleware `requireAdmin` que verifica `req.user.role === 'admin'` e retorna 403 se não for admin
- [x] 3.6 Aplicar `requireAdmin` nas rotas: `POST/PUT/DELETE /api/services`, `PUT /api/availability/:id`, `PUT /api/availability/day/:date`, `DELETE /api/appointments/:id`
- [x] 3.7 Incluir `role` no payload do JWT gerado em login e registro

## 4. Recuperação de senha (API Node.js)

- [x] 4.1 Implementar `POST /api/auth/request-recovery` — gera token de 6 dígitos, salva em `recovery_tokens` com TTL de 10 min, exibe no `console.log` em dev
- [x] 4.2 Implementar `POST /api/auth/recover-password` — valida token, verifica TTL e campo `used`, faz hash da nova senha, marca token como `used = true`

## 5. Agendamentos — Novos endpoints (API Node.js)

- [x] 5.1 Implementar `POST /api/appointments/:id/cancel` — atualiza `status = 'cancelado'`
- [x] 5.2 Implementar `POST /api/appointments/:id/duplicate` — cria cópia do agendamento com `status = 'pendente'`
- [x] 5.3 Ajustar `GET /api/appointments` — admin retorna todos; cliente retorna apenas onde `user_id = req.user.id`

## 6. Disponibilidade (API Node.js)

- [x] 6.1 Implementar `GET /api/availability` com filtro opcional `?date=YYYY-MM-DD`
- [x] 6.2 Implementar `PUT /api/availability/:id` com `{ available }` (requer `requireAdmin`)
- [x] 6.3 Implementar `PUT /api/availability/day/:date` com `{ available }` — atualiza todos os slots da data (requer `requireAdmin`)
- [x] 6.4 Registrar rotas de availability no router principal da API

## 7. Infraestrutura da API (API Node.js)

- [x] 7.1 Adicionar middleware `cors` no `app.js` permitindo origem do frontend
- [x] 7.2 Criar script de seed `npm run seed:admin` para criar usuário admin padrão via variáveis de ambiente

## 8. Frontend — Camada api.js

- [x] 8.1 Criar arquivo `api.js` com `API_BASE`, funções `getToken()`, `getAuthHeaders()` e `apiFetch(path, options)`
- [x] 8.2 Incluir `<script src="api.js">` em `login.html` antes de `login.js`
- [x] 8.3 Incluir `<script src="api.js">` em `index.html` (ou equivalente) antes de `script.js`
- [x] 8.4 Incluir `<script src="api.js">` em `agendamentos.html` antes de `agendamentos.js`
- [x] 8.5 Incluir `<script src="api.js">` em qualquer HTML que carregue `admin.js`

## 9. Frontend — Migrar login.js

- [x] 9.1 Remover import dinâmico do Firebase SDK (CDN) e toda referência a `initializeApp`, `getAuth`, `RecaptchaVerifier`, `signInWithPhoneNumber`
- [x] 9.2 Remover chamada `GET /api/firebase-config`
- [x] 9.3 Migrar `POST /api/auth/login` para usar `apiFetch`; salvar JWT retornado em `localStorage.authToken`
- [x] 9.4 Migrar `POST /api/auth/register` para usar `apiFetch` com `{ name, whatsapp, password }`; salvar JWT retornado
- [x] 9.5 Implementar novo fluxo de recuperação de senha em duas etapas: formulário de telefone → `POST /api/auth/request-recovery` → formulário de código + nova senha → `POST /api/auth/recover-password`

## 10. Frontend — Migrar script.js

- [x] 10.1 Substituir chamadas de `GET /api/services` e `GET /api/availability` para usar `apiFetch`
- [x] 10.2 Migrar `GET /api/auth/me` para usar `apiFetch` com JWT; redirecionar para `login.html` em 401
- [x] 10.3 Migrar `POST /api/appointments` para incluir `service_id` no body e usar `apiFetch`

## 11. Frontend — Migrar agendamentos.js

- [x] 11.1 Migrar `GET /api/auth/me` para usar `apiFetch`; redirecionar para `login.html` em 401
- [x] 11.2 Migrar `GET /api/appointments` e `GET /api/appointments/:id` para usar `apiFetch`
- [x] 11.3 Migrar `PUT /api/appointments/:id` para usar `apiFetch`
- [x] 11.4 Migrar `POST /api/appointments/:id/cancel` e `POST /api/appointments/:id/duplicate` para usar `apiFetch`
- [x] 11.5 Migrar `GET /api/availability` e `GET /api/services` para usar `apiFetch`
- [x] 11.6 Migrar `POST /api/auth/logout` para usar `apiFetch` e apagar `localStorage.authToken`

## 12. Frontend — Migrar admin.js

- [x] 12.1 Migrar `GET /api/auth/me` para usar `apiFetch`; verificar `role === 'admin'` e redirecionar se não for
- [x] 12.2 Migrar todos os endpoints de appointments para usar `apiFetch`
- [x] 12.3 Migrar todos os endpoints de availability para usar `apiFetch`
- [x] 12.4 Migrar todos os endpoints de services para usar `apiFetch`
- [x] 12.5 Migrar `POST /api/auth/logout` para usar `apiFetch` e apagar `localStorage.authToken`

## 13. Limpeza

- [x] 13.1 Remover `server.py`, `firestore_backend.py`, `tools/init_firestore.py` do repositório
- [x] 13.2 Remover `requirements.txt` do repositório
- [x] 13.3 Remover variáveis de configuração do Firebase do `.env.example`
- [x] 13.4 Atualizar `package.json` do frontend (corrigir campo `main`, remover dependências inválidas)
- [ ] 13.5 Testar fluxo completo E2E: cadastro → login → agendamento → painel admin → logout
