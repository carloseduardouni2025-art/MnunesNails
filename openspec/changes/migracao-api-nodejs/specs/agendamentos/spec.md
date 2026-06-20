## ADDED Requirements

### Requirement: Agendamento associado a serviço e com status

O sistema SHALL adicionar colunas `service_id` (FK → services), `status VARCHAR(20) DEFAULT 'pendente'` e `notas TEXT nullable` na tabela `appointments`.

#### Scenario: Criação de agendamento com service_id
- **WHEN** cliente envia `POST /api/appointments` com `service_id` válido
- **THEN** agendamento é criado com `service_id`, `status = 'pendente'` e `notas = null` por padrão

#### Scenario: Status padrão ao criar agendamento
- **WHEN** agendamento é criado sem `status` no body
- **THEN** `status` recebe valor `'pendente'`

#### Scenario: Valores válidos de status
- **WHEN** agendamento tem status atribuído
- **THEN** status SHALL ser um dos valores: `'pendente'`, `'confirmado'`, `'alterado'`, `'cancelado'`

---

### Requirement: Cancelamento de agendamento

O sistema SHALL implementar `POST /api/appointments/:id/cancel` que atualiza `status = 'cancelado'`.

#### Scenario: Cliente cancela próprio agendamento
- **WHEN** cliente envia `POST /api/appointments/:id/cancel` para agendamento que lhe pertence
- **THEN** API atualiza `status = 'cancelado'` e retorna status 200 com `{ message: "cancelado" }`

#### Scenario: Agendamento inexistente
- **WHEN** `POST /api/appointments/:id/cancel` é enviado com `id` inexistente
- **THEN** API retorna status 404

---

### Requirement: Duplicação de agendamento

O sistema SHALL implementar `POST /api/appointments/:id/duplicate` que cria uma cópia do agendamento com `status = 'pendente'`.

#### Scenario: Duplicação bem-sucedida
- **WHEN** usuário envia `POST /api/appointments/:id/duplicate` para agendamento existente
- **THEN** API cria novo agendamento com mesmos dados do original porém `status = 'pendente'` e retorna status 201 com o novo agendamento

#### Scenario: Agendamento original inexistente
- **WHEN** `POST /api/appointments/:id/duplicate` é enviado com `id` inexistente
- **THEN** API retorna status 404

---

### Requirement: Listagem de agendamentos filtrada por papel do usuário

O sistema SHALL ajustar `GET /api/appointments` para que admin veja todos os agendamentos e cliente veja apenas os seus.

#### Scenario: Admin lista todos os agendamentos
- **WHEN** usuário com `role === 'admin'` envia `GET /api/appointments`
- **THEN** API retorna todos os agendamentos do sistema

#### Scenario: Cliente lista apenas seus agendamentos
- **WHEN** usuário com `role === 'client'` envia `GET /api/appointments`
- **THEN** API retorna somente agendamentos onde `user_id = req.user.id`

#### Scenario: Requisição sem autenticação
- **WHEN** `GET /api/appointments` é enviado sem token
- **THEN** API retorna status 401
