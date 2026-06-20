## ADDED Requirements

### Requirement: Labels de data incluem o ano
As labels de data geradas pelo sistema SHALL incluir o ano no formato `"Dia-da-semana, DD/MM/AAAA"` para evitar ambiguidade na virada de ano.

#### Scenario: Agendamento criado em dezembro para janeiro é salvo com o ano correto
- **WHEN** um agendamento é criado em dezembro com data em janeiro do ano seguinte
- **THEN** a label salva SHALL conter o ano correto (ex: `"Quarta-feira, 15/01/2027"`)

#### Scenario: Reconstrução de data com label sem ano usa lógica de rollover
- **WHEN** o sistema encontra uma label no formato antigo sem ano (ex: `"Segunda-feira, 20/06"`)
- **THEN** `date_from_label` SHALL inferir o ano usando rollover: se o mês/dia já passou no ano atual, assumir o ano seguinte; caso contrário, assumir o ano atual

#### Scenario: Reconstrução de data com label com ano é determinística
- **WHEN** o sistema processa uma label no formato novo com ano (ex: `"Segunda-feira, 20/06/2026"`)
- **THEN** `date_from_label` SHALL retornar exatamente a data representada, sem inferência
