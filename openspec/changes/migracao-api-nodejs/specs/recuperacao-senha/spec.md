## ADDED Requirements

### Requirement: Solicitação de recuperação de senha gera token numérico

O sistema SHALL implementar `POST /api/auth/request-recovery` com `{ phone }` que gera um código numérico de 6 dígitos, armazena na tabela `recovery_tokens` com TTL de 10 minutos e retorna mensagem de sucesso.

#### Scenario: Solicitação para telefone cadastrado
- **WHEN** usuário envia `POST /api/auth/request-recovery` com `phone` existente em `users`
- **THEN** API cria registro em `recovery_tokens` com `token` de 6 dígitos, `expires_at = agora + 10min`, `used = false`, e retorna status 200 com `{ message: "código enviado" }`

#### Scenario: Solicitação para telefone não cadastrado
- **WHEN** usuário envia `POST /api/auth/request-recovery` com `phone` inexistente
- **THEN** API retorna status 404

#### Scenario: Token entregue via log em dev
- **WHEN** ambiente é desenvolvimento (`NODE_ENV !== 'production'`)
- **THEN** token SHALL ser exibido via `console.log` para fins de teste

---

### Requirement: Alteração de senha valida token e atualiza senha

O sistema SHALL implementar `POST /api/auth/recover-password` com `{ phone, token, newPassword }` que valida o token, verifica TTL e `used`, faz hash da nova senha e marca o token como usado.

#### Scenario: Token válido e não expirado
- **WHEN** usuário envia `POST /api/auth/recover-password` com `phone`, `token` correto, `expires_at` no futuro e `used = false`
- **THEN** API atualiza `users.password` com hash de `newPassword`, marca `recovery_tokens.used = true` e retorna status 200 com `{ message: "senha alterada" }`

#### Scenario: Token expirado
- **WHEN** usuário envia `POST /api/auth/recover-password` com token onde `expires_at` é passado
- **THEN** API retorna status 400

#### Scenario: Token já utilizado
- **WHEN** usuário envia `POST /api/auth/recover-password` com token onde `used = true`
- **THEN** API retorna status 400

#### Scenario: Token incorreto
- **WHEN** usuário envia `POST /api/auth/recover-password` com `token` que não corresponde a nenhum registro para o `phone`
- **THEN** API retorna status 400

---

### Requirement: Tabela recovery_tokens armazena tokens de recuperação

O sistema SHALL criar a tabela `recovery_tokens` com colunas: `id` (PK), `user_id` (FK → users), `token VARCHAR(6)`, `expires_at DATETIME`, `used BOOLEAN DEFAULT false`, `createdAt`, `updatedAt`.

#### Scenario: Estrutura da tabela
- **WHEN** migration é aplicada
- **THEN** tabela `recovery_tokens` existe com todas as colunas definidas e FK para `users.id`

---

### Requirement: Frontend substitui fluxo Firebase por fluxo de token numérico

O sistema SHALL remover toda referência ao Firebase SDK do frontend e implementar o novo fluxo de recovery em duas etapas.

#### Scenario: Fluxo de recovery no frontend
- **WHEN** usuário solicita recuperação de senha
- **THEN** frontend exibe formulário de telefone → chama `POST /api/auth/request-recovery` → exibe formulário de código + nova senha → chama `POST /api/auth/recover-password`

#### Scenario: Sem Firebase no frontend
- **WHEN** páginas HTML são carregadas
- **THEN** NENHUMA referência ao Firebase SDK (CDN, `initializeApp`, `getAuth`, `RecaptchaVerifier`, `signInWithPhoneNumber`) SHALL existir no código
