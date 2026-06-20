# MnunesNails

Site de agendamento para manicure usando Firestore/Firebase como banco de dados.

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

O sistema usa apenas o Firestore do projeto `mnunesnails`. Instale as dependencias Python:

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
FIREBASE_WEB_API_KEY=<apiKey do app web Firebase>
FIREBASE_AUTH_DOMAIN=mnunesnails.firebaseapp.com
FIREBASE_WEB_APP_ID=<appId do app web Firebase>
FIREBASE_MESSAGING_SENDER_ID=<messagingSenderId do app web Firebase>
```

As variaveis `FIREBASE_WEB_*` ficam no Firebase Console em **Configuracoes do projeto > Geral > Seus apps > App da Web > Configuracao do SDK**. Elas sao publicas e usadas pelo navegador para enviar o codigo SMS. A conta de servico continua sendo necessaria no servidor para validar o codigo recebido.

Na Render, configure as variaveis de ambiente assim:

```text
DATABASE_BACKEND=firestore
FIREBASE_PROJECT_ID=mnunesnails
FIREBASE_FIRESTORE_DATABASE=mnunesnails
FIREBASE_SERVICE_ACCOUNT_JSON=<conteudo completo do JSON da conta de servico>
FIREBASE_WEB_API_KEY=<apiKey do app web Firebase>
FIREBASE_AUTH_DOMAIN=mnunesnails.firebaseapp.com
FIREBASE_WEB_APP_ID=<appId do app web Firebase>
FIREBASE_MESSAGING_SENDER_ID=<messagingSenderId do app web Firebase>
```

Com essas variaveis ativas, o `server.py` usa Firestore como banco unico do sistema.

Para confirmar o banco ativo no deploy, acesse:

```text
/api/health
```

No Render, a resposta precisa mostrar `"database": "firestore"` e `"ready": true` dentro de `firestore`. Se `"ready"` estiver `false`, as variaveis de ambiente Firebase precisam ser corrigidas antes de usar cadastro, login e agendamentos.

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
- `GET /api/health`
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
