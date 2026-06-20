## ADDED Requirements

### Requirement: Cookie de sessão com flag Secure em HTTPS
O cookie de sessão SHALL incluir a flag `Secure` quando o servidor estiver operando em ambiente HTTPS (produção no Render).

#### Scenario: Cookie inclui Secure em ambiente de produção
- **WHEN** a variável de ambiente `RENDER` ou `HTTPS` está definida no servidor
- **THEN** o header `Set-Cookie` de sessão SHALL conter `; Secure`

#### Scenario: Cookie não inclui Secure em desenvolvimento local
- **WHEN** nem `RENDER` nem `HTTPS` estão definidas no ambiente
- **THEN** o header `Set-Cookie` SHALL NOT incluir `; Secure`, permitindo o uso em HTTP local

#### Scenario: Login continua funcionando em produção após a mudança
- **WHEN** um cliente faz login em `https://mnunesnails.onrender.com`
- **THEN** o cookie SHALL ser enviado corretamente pelo navegador nas requisições subsequentes
