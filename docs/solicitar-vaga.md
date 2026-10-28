# Solicitar vaga e aceitar/recusar — EP05

*Como passageiro, quero solicitar uma vaga em uma rota encontrada, para
reservar meu lugar na viagem.* — e — *Como motorista, quero aceitar ou recusar
uma solicitação de vaga, para controlar quem embarca no meu veículo.*

## Onde está cada coisa

| Parte | Arquivo |
|---|---|
| Status, vaga derivada, regras, `request_seat`, busca e "minhas solicitações" | `supabase/migrations/20261021232157_request_seat.sql` |
| Decisão (`decide_request`), data da decisão, nova tentativa | `supabase/migrations/20261021233055_decide_request.sql` |
| Testes do SQL | `supabase/tests/request_seat.test.sql`, `supabase/tests/decide_request.test.sql` |
| App: API, status, erros | `src/requests/` |
| Telas | botão nos resultados (`app/(app)/search/results.tsx`), `app/(app)/requests/index.tsx` (passageiro), seção de pendentes em `app/(app)/routes/[id]/index.tsx` (motorista) |
| Testes do app | `__tests__/rideRequests.test.ts` |

## Status

`pendente` (inicial) → `aceita` ou `recusada` (decisão do motorista) ·
`cancelada` (a rota foi cancelada com o pedido ainda pendente) · `encerrada`
(as vagas esgotaram antes de o motorista responder). Check constraint, não
enum: cada história só amplia a lista.

### Vagas esgotadas (28/10/2026)

- **"Vagas esgotadas" não é um status guardado**: é `seats_available = 0`
  numa rota publicada. A busca já não mostra (filtro `seats_available > 0`),
  `request_seat` recusa com "As vagas desta carona se esgotaram" (`no_seats`),
  e as telas do motorista mostram "Vagas esgotadas".
- **Encerramento das pendentes** num lugar só, `private.close_pending_if_full`
  (reutiliza `seats_available`), na mesma transação: chamado por
  `decide_request` depois de um aceite e pelo trigger
  `routes_close_pending_when_full` quando o motorista reduz `seats_total`.
- `encerrada`, e não `recusada`: o passageiro vê "Vagas esgotadas — a carona
  lotou antes de o motorista responder". Não tem `decided_at` (não foi decisão).
  Decidir um pedido encerrado responde `request_closed_full`.
- Dois aceites simultâneos para a última vaga (verificado pela API em
  paralelo): 200 `aceita` + 400 `request_closed_full`.
- **Reabertura** (fora do escopo): como o estado é derivado, se uma aceita for
  desfeita no futuro a vaga volta e a rota reaparece na busca sozinha. Os
  pedidos `encerrada` continuam encerrados, mas `encerrada` não bloqueia pedir
  de novo.

Os nomes antigos do EP03 (`aguardando`, `confirmada`) foram renomeados — a
tabela estava vazia. A notificação de rota alterada/cancelada (EP03) passou a
avisar quem está `aceita`.

## Vaga: um lugar só

**Vaga disponível = vagas da carona − solicitações aceitas.** Pendentes não
descontam. A regra mora em duas funções SQL:

- `public.seats_taken(routes)` — conta as aceitas;
- `public.seats_available(routes)` — `seats_total − seats_taken`.

Não há contador guardado: a coluna `routes.seats_taken` (que ninguém mantinha)
e a gerada `seats_available` foram removidas. As funções recebem a linha da
rota, então o PostgREST as expõe como **colunas computadas** — o app continua
lendo `seats_taken` e `seats_available` no `select`, sem mudar. A busca, o
pedido, a decisão e as telas usam essas funções; a próxima história ("fechar
solicitações quando as vagas acabarem") também deve usar.

"Vagas da carona" é `routes.seats_total`, que já é limitado à capacidade do
veículo no cadastro. Reduzir `seats_total` abaixo das aceitas é recusado
(`seats_below_accepted`).

## Regras (no banco, não só no app)

Trigger `ride_requests_validate` (vale para qualquer caminho de escrita):
rota publicada, horário futuro, não é do próprio motorista, há vaga, não foi
recusado antes nesta rota, perfil do passageiro completo. Índice único parcial:
um pedido ativo (pendente ou aceita) por passageiro por rota.

**Concorrência.** `request_seat` e `decide_request` travam a linha da rota
(`FOR UPDATE`) antes de checar: pedidos e decisões sobre a mesma rota
acontecem um de cada vez. Verificado pela API com chamadas **em paralelo**:

- clique duplo (2 × `request_seat` simultâneos do mesmo passageiro): 200 +
  409 `already_requested`, uma linha só;
- dois "Aceitar" simultâneos para a última vaga: 200 `aceita` + 400
  `no_seats` — o segundo pedido continua pendente.

**RLS.** Sem policy de INSERT/UPDATE/DELETE em `ride_requests`: escrita só
pelas RPCs. O passageiro "cria só as próprias" porque `request_seat` usa
sempre `auth.uid()`. Leitura: passageiro vê as próprias; motorista vê as das
rotas dele (policy do EP03).

## Decisões tomadas

- **Nova tentativa após recusa: não na mesma rota.** A resposta do motorista
  vale para aquela viagem; sem isso, dá para insistir. Outras rotas
  (inclusive do mesmo motorista) continuam livres. Muda numa linha
  (`refused_before` em `private.validate_ride_request`).
- **Pedir vaga exige perfil completo**: o motorista decide vendo nome, foto,
  curso e campus.
- **Rota cancelada encerra os pendentes** (`cancelada`), senão o passageiro
  veria "pendente" para sempre. Aceitos continuam `aceita` e são avisados.
- **Aceitar não pede confirmação; recusar pede** (é irreversível).
- Dois pedidos para a última vaga entram os dois como pendentes (pendente não
  reserva); quem decide é o motorista, e o segundo aceite falha com mensagem
  clara.

## Pontos de extensão

- **EP06 (feito em 28/10)**: avisos de pedido novo e de decisão — ver
  [notificacoes.md](notificacoes.md).
- **Avisar quem foi encerrado por vagas esgotadas**: comentário `PONTO DE
  EXTENSÃO EP06` em `private.close_pending_if_full` (não pedido ainda).

## Fora destas histórias

Cancelar a própria solicitação, revelar placa/contato a quem foi aceito,
histórico completo (EP09), chat, avaliação e custos.

## Advisors do Supabase

`request_seat`, `decide_request`, `seats_taken` e `seats_available` aparecem
como WARN "SECURITY DEFINER executável por autenticado". É intencional: as
RPCs aplicam as regras e travam a rota; as funções de vaga precisam contar
pedidos de outros passageiros e devolvem só números.
