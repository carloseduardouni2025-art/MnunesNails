# MnunesNails

Site de agendamento para manicure com banco de dados local em SQLite.

## Como rodar

Use o servidor Python do projeto, porque ele serve o site e tambem expõe a API:

```powershell
python server.py
```

Depois abra:

```text
http://localhost:5500/
```

## Banco de dados

O arquivo `mnunesnails.db` e criado automaticamente ao iniciar o servidor.

Tabelas:

- `users`: guarda apenas `name` e `phone` como dados solicitados da cliente.
- `appointments`: guarda servico, dia, horario, observacoes e status, ligado ao usuario.

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

Na primeira execução, o servidor cria um administrador padrão:

- Celular: `00000000000`
- Senha: `admin123`

## Login e cadastro

- Login de cliente: celular e senha.
- Cadastro de cliente: nome, WhatsApp e senha.
- Login administrativo: celular e senha.
