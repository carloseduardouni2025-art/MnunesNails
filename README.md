# MnunesNails

Site de agendamento para manicure com suporte a Firestore e fallback local em SQLite.

## Como rodar

Use o servidor Python do projeto, porque ele serve o site e tambem expoe a API:

```powershell
python server.py
```

Depois abra:

```text
http://localhost:5500/
```

## Banco de dados

Por padrao, sem credenciais Firebase, o arquivo `mnunesnails.db` e criado automaticamente ao iniciar o servidor.

Para usar o Firestore do projeto `mnunesnails`, instale as dependencias Python:

```powershell
pip install -r requirements.txt
```

Depois copie `.env.example` para `.env`, baixe a chave JSON da conta de servico no Firebase Console e salve como `firebase-service-account.json` na raiz do projeto.

Variaveis esperadas:

```text
DATABASE_BACKEND=firestore
FIREBASE_PROJECT_ID=mnunesnails
FIREBASE_FIRESTORE_DATABASE=mnunesnails
FIREBASE_SERVICE_ACCOUNT=firebase-service-account.json
```

Com essas variaveis ativas, o `server.py` usa Firestore como banco principal.

Colecoes principais:

- `users`: guarda `name`, `phone`, `whatsapp` e credenciais de login.
- `admins`: guarda os administradores.
- `sessions`: guarda sessoes autenticadas.
- `appointments`: guarda servico, dia, horario, observacoes e status, ligado ao usuario.
- `services`: guarda servicos, preco, duracao e status ativo.
- `availability_slots`: guarda disponibilidade manual por data e horario.
- `counters`: controla IDs numericos de usuarios, servicos e admins.

Rotas principais:

- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/admin-login`
- `POST /api/auth/logout`
- `GET /api/users`
- `GET /api/appointments`
- `POST /api/appointments`
- `PUT /api/appointments/:id`
- `POST /api/appointments/:id/cancel`
- `POST /api/appointments/:id/duplicate`

## Acesso administrativo

Na primeira execucao, o servidor cria um administrador padrao:

- Celular: `00000000000`
- Senha: `admin123`

## Login e cadastro

- Login de cliente: celular e senha.
- Cadastro de cliente: nome, WhatsApp e senha.
- Login administrativo: celular e senha.
