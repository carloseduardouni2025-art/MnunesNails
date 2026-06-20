## Why

O frontend MnunesNails depende de dois backends distintos — um servidor Python com Firestore e o Firebase Auth para SMS — enquanto uma API Node.js com PostgreSQL já existe e deve ser a única fonte de verdade. A duplicação gera inconsistência de dados, dois sistemas de autenticação incompatíveis e uma dependência de serviço externo pago (Firebase), bloqueando a simplificação da stack.

## What Changes

- **Remover** dependência do Firebase SDK (CDN) do frontend — todo fluxo de recuperação de senha passa a usar token numérico próprio
- **Remover** servidor Python (`server.py`, `firestore_backend.py`) — frontend deixa de fazer chamadas para ele
- **Adicionar** endpoints faltantes na API Node.js: `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/admin-login`, `POST /api/auth/register`, `POST /api/auth/request-recovery`, `POST /api/auth/recover-password`, `POST /api/appointments/:id/cancel`, `POST /api/appointments/:id/duplicate`, e todos os endpoints de `/api/availability`
- **Adicionar** migrations no PostgreSQL: campos `name/whatsapp/role` em `users`; campos `service_id/status/notas` em `appointments`; tabelas `availability` e `recovery_tokens`
- **Adicionar** middleware `requireAdmin` na API Node.js para proteção de rotas administrativas
- **Adicionar** `cors` middleware na API Node.js
- **Criar** `api.js` no frontend — camada única de comunicação HTTP com autenticação JWT via `localStorage`
- **Migrar** `login.js`, `script.js`, `agendamentos.js` e `admin.js` para usar `api.js` e JWT, eliminando toda chamada ao servidor Python ou ao Firebase

## Capabilities

### New Capabilities

- `autenticacao`: Autenticação completa via JWT — login de cliente e admin, registro, logout e endpoint `GET /api/auth/me`; middleware `requireAdmin` para proteção de rotas
- `recuperacao-senha`: Recuperação de senha sem Firebase — geração de token numérico de 6 dígitos com TTL de 10 min, armazenado na tabela `recovery_tokens`, entregue via WhatsApp API ou log em dev
- `disponibilidade`: Gestão de slots de disponibilidade — tabela `availability`, endpoints GET/PUT para slots individuais e por data
- `agendamentos`: Gerenciamento completo de agendamentos — campos adicionais (`service_id`, `status`, `notas`), ações de cancelamento e duplicação, filtro por usuário (cliente) ou todos (admin)
- `frontend-api-layer`: Camada `api.js` no frontend centralizando todas as chamadas HTTP com JWT, substituindo dependências do servidor Python e do Firebase

### Modified Capabilities

<!-- Nenhuma: não existem specs anteriores neste repositório -->

## Impact

- **Backend** (`-MnunesNails.api`): 4 migrations, novos controllers/services/rotas para auth/availability/recovery, ajustes em appointments e users, novo middleware `requireAdmin`, `cors`
- **Frontend** (`MnunesNails`): novo arquivo `api.js`; reescrita de `login.js`, `script.js`, `agendamentos.js`, `admin.js`; inclusão de `api.js` em todos os HTMLs
- **Remoção**: `server.py`, `firestore_backend.py`, `tools/init_firestore.py`, `requirements.txt`, referências Firebase no `.env.example`
- **Dependências externas eliminadas**: Firebase Auth SDK, Firestore, servidor Python
- **Banco de dados**: PostgreSQL (já em uso); sem migração de dados do Firestore (inicia do zero ou decide-se separadamente)
