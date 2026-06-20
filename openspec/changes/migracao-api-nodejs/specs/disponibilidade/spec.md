## ADDED Requirements

### Requirement: Listagem de slots de disponibilidade

O sistema SHALL implementar `GET /api/availability` que retorna todos os slots ou filtra por data via query param `?date=YYYY-MM-DD`.

#### Scenario: Listar todos os slots sem filtro
- **WHEN** requisição `GET /api/availability` é enviada sem query params
- **THEN** API retorna status 200 com array de `{ id, date, time, available }`

#### Scenario: Listar slots por data
- **WHEN** requisição `GET /api/availability?date=2026-06-20` é enviada
- **THEN** API retorna status 200 com array de slots onde `date = '2026-06-20'`

#### Scenario: Rota pública (sem autenticação)
- **WHEN** `GET /api/availability` é chamado sem token
- **THEN** API retorna status 200 (rota não requer autenticação)

---

### Requirement: Atualizar slot individual de disponibilidade

O sistema SHALL implementar `PUT /api/availability/:id` com `{ available }` que atualiza o campo `available` do slot.

#### Scenario: Admin atualiza slot
- **WHEN** admin envia `PUT /api/availability/:id` com `{ available: false }`
- **THEN** API atualiza `availability.available` para `false` e retorna status 200 com slot atualizado

#### Scenario: Slot inexistente
- **WHEN** `PUT /api/availability/:id` é enviado com `id` inexistente
- **THEN** API retorna status 404

#### Scenario: Rota protegida por requireAdmin
- **WHEN** cliente (não admin) envia `PUT /api/availability/:id`
- **THEN** API retorna status 403

---

### Requirement: Atualizar todos os slots de uma data

O sistema SHALL implementar `PUT /api/availability/day/:date` com `{ available }` que atualiza o campo `available` de todos os slots onde `date = :date`.

#### Scenario: Admin bloqueia dia inteiro
- **WHEN** admin envia `PUT /api/availability/day/2026-06-20` com `{ available: false }`
- **THEN** API atualiza `available = false` em todos os slots com `date = '2026-06-20'` e retorna status 200

#### Scenario: Data sem slots cadastrados
- **WHEN** `PUT /api/availability/day/:date` é enviado para data sem slots
- **THEN** API retorna status 200 com `{ updated: 0 }`

#### Scenario: Rota protegida por requireAdmin
- **WHEN** cliente (não admin) envia `PUT /api/availability/day/:date`
- **THEN** API retorna status 403

---

### Requirement: Tabela availability armazena slots de horário

O sistema SHALL criar a tabela `availability` com colunas: `id` (INTEGER PK AUTO), `date` (DATE), `time` (VARCHAR(10)), `available` (BOOLEAN DEFAULT true), `createdAt` (DATETIME), `updatedAt` (DATETIME).

#### Scenario: Estrutura da tabela
- **WHEN** migration é aplicada
- **THEN** tabela `availability` existe com todas as colunas definidas

#### Scenario: Slot padrão disponível
- **WHEN** slot é inserido sem especificar `available`
- **THEN** `available` recebe valor `true` como default
