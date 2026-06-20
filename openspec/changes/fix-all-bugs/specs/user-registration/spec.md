## ADDED Requirements

### Requirement: Confirmação de senha no cadastro
O formulário de cadastro de cliente SHALL incluir um campo de confirmação de senha e validar que ambos os campos coincidem antes de enviar o formulário.

#### Scenario: Cadastro bem-sucedido com senhas iguais
- **WHEN** o usuário preenche os campos de senha e confirmação com o mesmo valor e submete o formulário
- **THEN** o sistema SHALL prosseguir com o cadastro normalmente

#### Scenario: Cadastro bloqueado com senhas diferentes
- **WHEN** o usuário preenche senha e confirmação com valores diferentes e tenta submeter
- **THEN** o formulário SHALL NOT ser submetido e SHALL exibir uma mensagem de erro indicando que as senhas não coincidem

#### Scenario: Campo de confirmação visível no formulário de cadastro
- **WHEN** o usuário acessa a aba "Criar conta" em `login.html`
- **THEN** o formulário SHALL exibir dois campos de senha: "Senha" e "Confirmar senha"
