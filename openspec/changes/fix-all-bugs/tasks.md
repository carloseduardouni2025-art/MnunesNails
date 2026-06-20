## 1. BUG-07 — Mover ensure_availability_window para fora do hot path

- [x] 1.1 Em `firestore_backend.py`, remover a chamada a `ensure_availability_window` dentro de `is_slot_available`
- [x] 1.2 Confirmar que `init_database()` chama `ensure_availability_window` corretamente (já deve chamar; verificar e ajustar se necessário)
- [x] 1.3 Testar manualmente que criar um agendamento não gera operações de provisionamento no log

## 2. BUG-11 — Incluir ano nas labels de data

- [x] 2.1 Em `firestore_backend.py`, alterar a função que gera a label de data para usar o formato `"Dia-da-semana, DD/MM/AAAA"`
- [x] 2.2 Em `server.py`, alterar a função equivalente de geração de label para o mesmo formato
- [x] 2.3 Em `firestore_backend.py`, atualizar `date_from_label` para extrair o ano da string quando presente
- [x] 2.4 Em `server.py`, atualizar `date_from_label` equivalente com a mesma lógica
- [x] 2.5 Adicionar lógica de rollover em ambas as funções: se o label não tem ano, inferir com base em mês/dia vs. data atual

## 3. BUG-08 — Flag Secure no cookie de sessão

- [x] 3.1 Em `server.py`, adicionar `; Secure` ao header `Set-Cookie` condicionalmente quando `os.environ.get("RENDER") or os.environ.get("HTTPS")` estiver definido

## 4. BUG-02 — Número de WhatsApp via variável de ambiente

- [x] 4.1 Em `server.py`, ler `os.environ.get("WHATSAPP_NUMBER", "")` e incluir o valor no payload de resposta de `GET /api/firebase-config`
- [x] 4.2 Em `script.js`, ler `whatsappNumber` da resposta de `/api/firebase-config` e armazenar na variável global que constrói o link `wa.me/`
- [x] 4.3 Em `script.js`, remover o hardcode `5511999999999`
- [x] 4.4 Em `script.js`, desabilitar o botão de WhatsApp e exibir aviso se `whatsappNumber` for vazio

## 5. BUG-01 — Disponibilidade da API no editor da cliente

- [x] 5.1 Em `agendamentos.js`, adicionar chamada a `GET /api/availability` no `DOMContentLoaded` e armazenar o resultado em variável de módulo
- [x] 5.2 Adaptar a função que popula o seletor de datas do editor para usar os dados da API (replicar padrão de `index.html`)
- [x] 5.3 Adaptar a função que popula o seletor de horários do editor para filtrar slots disponíveis da API para a data selecionada
- [x] 5.4 Remover `buildAvailability()` e `dailySlots` de `agendamentos.js` após confirmar que a API os substitui corretamente

## 6. BUG-03 — Serviços dinâmicos no editor da cliente

- [x] 6.1 Em `agendamentos.js`, adicionar chamada a `GET /api/services` ao abrir o modal de edição
- [x] 6.2 Popular o `<select name="service">` dinamicamente com os serviços ativos retornados pela API
- [x] 6.3 Em `agendamentos.html`, remover as `<option>` hardcoded do `<select name="service">` (linhas 103-110)

## 7. BUG-06 — Métricas do admin sobre total não filtrado

- [x] 7.1 Em `admin.js`, introduzir variável `allAppointments` que armazena a lista completa retornada pela API, sem filtros
- [x] 7.2 Atualizar a função `updateMetrics` (ou equivalente) para calcular os contadores a partir de `allAppointments`
- [x] 7.3 Garantir que `appointments` (lista filtrada exibida na tabela) não afete mais as métricas

## 8. BUG-12 — Campo de confirmação de senha no cadastro

- [x] 8.1 Em `login.html`, adicionar `<input type="password" id="confirmPassword" placeholder="Confirmar senha">` após o campo de senha no formulário de cadastro
- [x] 8.2 Em `login.html` (script inline ou arquivo JS de login), adicionar validação client-side que compara `password` e `confirmPassword` antes de submeter
- [x] 8.3 Exibir mensagem de erro se as senhas não coincidirem, impedindo o submit

## 9. BUG-05 — Remover dividers "ou" órfãos do login

- [x] 9.1 Em `login.html`, remover o `<div class="auth-divider"><span>ou</span></div>` do formulário de login (linha 35)
- [x] 9.2 Em `login.html`, remover o `<div class="auth-divider"><span>ou</span></div>` do formulário de cadastro (linha 68)

## 10. BUG-04 — Remover código morto dos arquivos JS

- [x] 10.1 Em `script.js`, remover declarações de `dailySlots`, `weekdayFormatter` e `shortDateFormatter` (linhas 1-8)
- [x] 10.2 Em `admin.js`, remover a função `buildAvailability` que não é chamada (linhas 1-65, confirmar o escopo exato)
- [x] 10.3 Em `admin.js`, remover `dailySlots` se ainda presente

## 11. BUG-09/10 — Corrigir package.json

- [x] 11.1 Em `package.json`, remover dependências Node.js que não são usadas (`express`, `pg`, `typeorm`, `dotenv`)
- [x] 11.2 Em `package.json`, corrigir `"main"` de `"admin.js"` para `"server.py"` ou remover o campo
- [x] 11.3 Em `package.json`, atualizar a descrição para refletir a stack real (Python + Firestore)

## 12. Verificação final

- [ ] 12.1 Testar o editor da cliente: abrir agendamento, confirmar que datas e horários vêm da API, incluindo domingo
- [ ] 12.2 Testar o botão WhatsApp com `WHATSAPP_NUMBER` definido e sem ele
- [ ] 12.3 Testar o cadastro com senhas iguais e com senhas diferentes
- [ ] 12.4 Testar métricas do admin com e sem filtros ativos
- [ ] 12.5 Confirmar que o cookie de sessão contém `Secure` nos headers de resposta em produção
- [ ] 12.6 Definir `WHATSAPP_NUMBER=5511976779251` no painel do Render antes do deploy
