## Why

O sistema de agendamento do Studio MNunesnails possui doze bugs documentados no PRD, sendo dois críticos que permitem ao cliente selecionar horários bloqueados ou já ocupados — levando a erros 400 sem orientação útil — e dez de severidade média/baixa que comprometem a confiabilidade, a segurança e a manutenibilidade do sistema antes da entrega acadêmica.

## What Changes

- **agendamentos.js**: substituir horários estáticos por chamada à `/api/availability`; substituir lista hardcoded de serviços por chamada à `/api/services`
- **script.js**: corrigir número de WhatsApp de `5511999999999` para o número real do studio (carregado de variável de ambiente)
- **firestore_backend.py**: mover `ensure_availability_window` para fora do caminho quente de `is_slot_available`; incluir ano nas labels de data para evitar bug na virada de ano
- **server.py**: adicionar flag `Secure` ao cookie de sessão quando rodando em HTTPS; corrigir reconstrução de data com suporte a virada de ano
- **admin.js**: calcular métricas sobre o total não filtrado de agendamentos
- **login.html**: adicionar campo "confirmar senha" no formulário de cadastro; remover dividers "ou" órfãos
- **package.json**: corrigir dependências Node.js fantasma e `"main"` incorreto
- Remover código morto: `dailySlots`, `weekdayFormatter`, `shortDateFormatter` (script.js); `buildAvailability` não chamada (admin.js)

## Capabilities

### New Capabilities

- `client-booking-editor`: Editor de agendamento da área do cliente com disponibilidade e serviços carregados dinamicamente da API
- `whatsapp-integration`: Configuração do número de WhatsApp via variável de ambiente, sem hardcode no frontend
- `admin-metrics`: Métricas do painel admin calculadas sobre o total real de agendamentos, independente dos filtros ativos
- `session-security`: Cookie de sessão com flag `Secure` em ambientes HTTPS
- `user-registration`: Formulário de cadastro com campo de confirmação de senha
- `date-handling`: Labels de data incluem ano; reconstrução de data suporta virada de ano corretamente
- `availability-service`: `ensure_availability_window` chamado apenas na inicialização do servidor, não a cada requisição

### Modified Capabilities

<!-- Nenhum spec existente para modificar -->

## Impact

- **Arquivos afetados**: `agendamentos.js`, `agendamentos.html`, `script.js`, `admin.js`, `login.html`, `server.py`, `firestore_backend.py`, `package.json`
- **API**: nenhuma rota nova; `GET /api/availability` e `GET /api/services` passam a ser consumidas por `agendamentos.js`
- **Variável de ambiente**: nova variável `WHATSAPP_NUMBER` lida pelo servidor e exposta ao frontend
- **Segurança**: cookie com `Secure` muda comportamento apenas em HTTP puro (sem impacto no Render/HTTPS)
- **Performance**: redução significativa de escritas no Firestore por requisição (BUG-07)
- **Sem breaking changes** para clientes já autenticados ou para a API pública
