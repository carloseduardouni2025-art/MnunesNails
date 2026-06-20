## ADDED Requirements

### Requirement: Arquivo api.js centraliza todas as chamadas HTTP do frontend

O sistema SHALL conter arquivo `api.js` incluído em todas as páginas HTML que expõe `apiFetch(path, options)` como ponto único de comunicação com a API Node.js.

#### Scenario: apiFetch adiciona header de autorização automaticamente
- **WHEN** `apiFetch('/api/auth/me')` é chamado com JWT presente em `localStorage.authToken`
- **THEN** requisição inclui header `Authorization: Bearer <token>`

#### Scenario: apiFetch usa URL base configurável
- **WHEN** `apiFetch('/api/services')` é chamado
- **THEN** requisição é feita para `API_BASE + '/api/services'` onde `API_BASE` é configurável

#### Scenario: apiFetch lança erro em resposta não-ok
- **WHEN** API retorna status >= 400
- **THEN** `apiFetch` lança o corpo da resposta como erro (`throw await res.json()`)

#### Scenario: api.js incluído em todas as páginas HTML
- **WHEN** qualquer página do frontend é carregada (`login.html`, `index.html`, `agendamentos.html`)
- **THEN** `api.js` SHALL estar incluído via `<script src="api.js">` antes dos scripts que o utilizam

---

### Requirement: Token JWT armazenado em localStorage

O sistema SHALL armazenar o JWT retornado pelo login/registro em `localStorage` com a chave `authToken`.

#### Scenario: Login bem-sucedido salva token
- **WHEN** `POST /api/auth/login` retorna `{ token }`
- **THEN** frontend executa `localStorage.setItem('authToken', token)`

#### Scenario: Logout limpa token
- **WHEN** usuário faz logout
- **THEN** frontend executa `localStorage.removeItem('authToken')` e chama `POST /api/auth/logout`

#### Scenario: Verificação de sessão ativa usa /api/auth/me
- **WHEN** página que requer autenticação é carregada
- **THEN** frontend chama `GET /api/auth/me` com JWT; se retornar 401, redireciona para `login.html`

---

### Requirement: Nenhuma chamada direta ao servidor Python no frontend

O sistema SHALL não conter nenhuma referência a endpoints do servidor Python ou ao URL do servidor Python em nenhum arquivo JS do frontend.

#### Scenario: Chamadas migradas para API Node.js
- **WHEN** qualquer arquivo JS do frontend (`login.js`, `script.js`, `agendamentos.js`, `admin.js`) é executado
- **THEN** todas as chamadas HTTP SHALL usar `apiFetch` apontando para a API Node.js

#### Scenario: Endpoint firebase-config removido
- **WHEN** qualquer arquivo JS do frontend é executado
- **THEN** NENHUMA chamada para `GET /api/firebase-config` SHALL existir

---

### Requirement: Servidor Python removido do repositório

O sistema SHALL não conter os arquivos do servidor Python após conclusão da migração.

#### Scenario: Arquivos Python removidos
- **WHEN** migração é concluída
- **THEN** os arquivos `server.py`, `firestore_backend.py`, `tools/init_firestore.py` e `requirements.txt` SHALL não existir no repositório

#### Scenario: Frontend funciona como arquivos estáticos
- **WHEN** frontend é servido sem o servidor Python rodando
- **THEN** todas as funcionalidades SHALL operar corretamente via API Node.js

---

### Requirement: CORS configurado na API Node.js

O sistema SHALL adicionar middleware CORS na API Node.js permitindo requisições do domínio do frontend.

#### Scenario: Requisição cross-origin aceita
- **WHEN** frontend em domínio diferente envia requisição para API Node.js
- **THEN** API retorna headers CORS adequados e processa a requisição
