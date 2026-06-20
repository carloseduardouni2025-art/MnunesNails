## ADDED Requirements

### Requirement: Login de cliente retorna JWT

O sistema SHALL autenticar um cliente via `POST /api/auth/login` com `{ phone, password }` e retornar `{ token }` em caso de sucesso.

#### Scenario: Login com credenciais válidas
- **WHEN** cliente envia `POST /api/auth/login` com `phone` e `password` corretos
- **THEN** API retorna status 200 com `{ token }` contendo JWT assinado com `id`, `phone` e `role` no payload

#### Scenario: Login com senha incorreta
- **WHEN** cliente envia `POST /api/auth/login` com `phone` válido e `password` incorreto
- **THEN** API retorna status 401

#### Scenario: Login com telefone inexistente
- **WHEN** cliente envia `POST /api/auth/login` com `phone` não cadastrado
- **THEN** API retorna status 401

---

### Requirement: Login de admin verifica role

O sistema SHALL implementar `POST /api/auth/admin-login` com `{ phone, password }` que retorna JWT apenas se `role === 'admin'`.

#### Scenario: Admin faz login com sucesso
- **WHEN** usuário com `role === 'admin'` envia `POST /api/auth/admin-login` com credenciais corretas
- **THEN** API retorna status 200 com `{ token }`

#### Scenario: Cliente tenta login de admin
- **WHEN** usuário com `role === 'client'` envia `POST /api/auth/admin-login` com credenciais corretas
- **THEN** API retorna status 403

---

### Requirement: Registro de cliente cria conta e retorna JWT

O sistema SHALL implementar `POST /api/auth/register` com `{ name, whatsapp, password }` que cria o usuário e retorna JWT.

#### Scenario: Registro com dados válidos
- **WHEN** novo usuário envia `POST /api/auth/register` com `name`, `whatsapp` e `password`
- **THEN** API cria usuário com `phone = whatsapp`, `role = 'client'` e retorna status 201 com `{ token }`

#### Scenario: Registro com telefone já cadastrado
- **WHEN** usuário envia `POST /api/auth/register` com `whatsapp` já existente em `users.phone`
- **THEN** API retorna status 409

---

### Requirement: Endpoint GET /api/auth/me retorna dados do usuário autenticado

O sistema SHALL implementar `GET /api/auth/me` que decodifica o JWT e retorna os dados do usuário.

#### Scenario: Token válido presente
- **WHEN** cliente envia `GET /api/auth/me` com header `Authorization: Bearer <token>` válido
- **THEN** API retorna status 200 com `{ id, name, phone, role }`

#### Scenario: Token ausente ou inválido
- **WHEN** cliente envia `GET /api/auth/me` sem token ou com token expirado
- **THEN** API retorna status 401

---

### Requirement: Logout retorna 200

O sistema SHALL implementar `POST /api/auth/logout` que retorna sucesso sem invalidar o token (JWT é stateless).

#### Scenario: Logout chamado com ou sem token
- **WHEN** cliente envia `POST /api/auth/logout`
- **THEN** API retorna status 200 com `{ message: "ok" }`

---

### Requirement: Middleware requireAdmin protege rotas administrativas

O sistema SHALL verificar `req.user.role === 'admin'` antes de permitir acesso às rotas administrativas.

#### Scenario: Admin acessa rota protegida
- **WHEN** usuário com `role === 'admin'` no JWT acessa rota protegida por `requireAdmin`
- **THEN** requisição prossegue normalmente

#### Scenario: Cliente acessa rota protegida
- **WHEN** usuário com `role === 'client'` no JWT acessa rota protegida por `requireAdmin`
- **THEN** API retorna status 403

#### Scenario: Rotas protegidas por requireAdmin
- **WHEN** sistema é configurado
- **THEN** as seguintes rotas SHALL exigir `role === 'admin'`: `POST/PUT/DELETE /api/services`, `PUT /api/availability/:id`, `PUT /api/availability/day/:date`, `DELETE /api/appointments/:id`

---

### Requirement: Tabela users contém campos name, whatsapp e role

O sistema SHALL adicionar colunas `name VARCHAR(150)`, `whatsapp VARCHAR(30)` e `role VARCHAR(10) DEFAULT 'client'` na tabela `users`.

#### Scenario: Usuário criado via registro
- **WHEN** usuário se registra via `POST /api/auth/register`
- **THEN** registro em `users` contém `name`, `whatsapp`, `role = 'client'`

#### Scenario: Role padrão para usuários existentes
- **WHEN** migration é aplicada em banco com usuários existentes
- **THEN** usuários existentes recebem `role = 'client'` como valor default
