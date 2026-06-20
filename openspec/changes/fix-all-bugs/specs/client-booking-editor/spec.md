## ADDED Requirements

### Requirement: Disponibilidade carregada da API
O editor de agendamento da área da cliente SHALL carregar a disponibilidade real de horários via `GET /api/availability` durante o carregamento da página, não a partir de listas estáticas locais.

#### Scenario: Carregar disponibilidade no DOMContentLoaded
- **WHEN** a página `agendamentos.html` é carregada
- **THEN** o sistema SHALL fazer `GET /api/availability` e armazenar a resposta em memória

#### Scenario: Editor mostra apenas datas com horários disponíveis
- **WHEN** o usuário abre o editor de um agendamento
- **THEN** o seletor de data SHALL exibir apenas datas com pelo menos um slot disponível, conforme retornado pela API

#### Scenario: Editor mostra apenas horários disponíveis para a data selecionada
- **WHEN** o usuário seleciona uma data no editor
- **THEN** o seletor de horário SHALL exibir apenas os slots marcados como disponíveis para aquela data na resposta da API

#### Scenario: Domingo com todos os horários bloqueados não trava o editor
- **WHEN** o usuário tenta editar um agendamento de domingo
- **THEN** o editor SHALL abrir sem erro e exibir os horários disponíveis para o domingo conforme a API (podendo ser nenhum)

### Requirement: Serviços carregados dinamicamente
O `<select>` de serviços no editor da área da cliente SHALL ser populado via `GET /api/services`, não com opções hardcoded no HTML.

#### Scenario: Editor reflete serviços ativos cadastrados pelo admin
- **WHEN** o usuário abre o editor de um agendamento
- **THEN** o seletor de serviço SHALL exibir exatamente os serviços ativos retornados por `GET /api/services`

#### Scenario: Serviço removido pelo admin não aparece no editor
- **WHEN** o admin desativa ou exclui um serviço
- **THEN** esse serviço SHALL NOT aparecer no seletor de serviços do editor da cliente na próxima abertura da página
