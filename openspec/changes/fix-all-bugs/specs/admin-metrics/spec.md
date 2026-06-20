## ADDED Requirements

### Requirement: Métricas calculadas sobre o total não filtrado
Os contadores de "Total / Confirmados / Alterados / Cancelados" no painel admin SHALL refletir o total real de agendamentos, independentemente dos filtros de data, status ou busca ativos na tabela.

#### Scenario: Métricas não mudam ao aplicar filtro de status
- **WHEN** o admin aplica o filtro "Confirmados"
- **THEN** o contador de "Cancelados" SHALL exibir o número real de cancelados em todo o banco, não zero

#### Scenario: Métricas não mudam ao aplicar filtro de data
- **WHEN** o admin filtra por uma data específica
- **THEN** os contadores SHALL continuar refletindo os totais globais, não apenas os do dia filtrado

#### Scenario: Métricas refletem a lista completa ao limpar filtros
- **WHEN** o admin remove todos os filtros
- **THEN** as métricas SHA exibir os mesmos valores que antes de qualquer filtro ser aplicado
