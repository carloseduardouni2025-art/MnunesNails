## ADDED Requirements

### Requirement: Provisionamento de janela de disponibilidade apenas na inicialização
`ensure_availability_window` SHALL ser chamado exclusivamente durante a inicialização do servidor (`init_database()`), nunca durante o processamento de requisições individuais.

#### Scenario: Verificação de slot não dispara provisionamento em massa
- **WHEN** `is_slot_available` é chamado durante o processamento de um agendamento
- **THEN** o sistema SHALL NOT chamar `ensure_availability_window`, evitando dezenas de operações Firestore por requisição

#### Scenario: Janela de disponibilidade provisionada ao iniciar o servidor
- **WHEN** o servidor inicia e `init_database()` é executado
- **THEN** `ensure_availability_window` SHALL ser chamado para garantir que os slots futuros existam no Firestore

#### Scenario: Múltiplas requisições simultâneas não geram writes redundantes
- **WHEN** dois agendamentos são criados simultaneamente
- **THEN** nenhuma das requisições SHALL disparar `ensure_availability_window`, mantendo o custo de Firestore por requisição constante
