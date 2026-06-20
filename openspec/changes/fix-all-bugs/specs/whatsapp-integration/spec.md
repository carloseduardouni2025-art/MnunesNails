## ADDED Requirements

### Requirement: Número de WhatsApp configurável via variável de ambiente
O número de WhatsApp do studio SHALL ser lido da variável de ambiente `WHATSAPP_NUMBER` no servidor e entregue ao frontend via `GET /api/firebase-config`, nunca hardcoded no código-fonte.

#### Scenario: Botão WhatsApp usa número configurado no ambiente
- **WHEN** `WHATSAPP_NUMBER` está definido no ambiente do servidor
- **THEN** o botão "Enviar para WhatsApp" SHALL abrir `https://wa.me/<WHATSAPP_NUMBER>?text=...` com o número correto

#### Scenario: Número ausente no ambiente gera aviso visual
- **WHEN** `WHATSAPP_NUMBER` não está definido no ambiente
- **THEN** o botão "Enviar para WhatsApp" SHALL estar desabilitado ou exibir um aviso ao usuário em vez de abrir um número fictício

#### Scenario: Número exposto no payload de firebase-config
- **WHEN** o frontend faz `GET /api/firebase-config`
- **THEN** a resposta SHALL incluir o campo `whatsappNumber` com o valor da variável de ambiente (ou string vazia se não definida)
