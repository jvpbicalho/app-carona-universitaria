# Notificações em tempo real — EP06

*Como passageiro, quero receber uma notificação quando minha solicitação for
aceita ou recusada.* — e — *Como motorista, quero receber uma notificação
quando um passageiro solicitar vaga.*

## Onde está cada coisa

| Parte | Arquivo |
|---|---|
| Aviso de aceite/recusa, marcar como lida, Realtime | `supabase/migrations/20261028230605_notify_request_decision.sql` |
| Aviso de nova solicitação, contagem do badge | `supabase/migrations/20261028231422_notify_new_request.sql` |
| Testes do SQL | `supabase/tests/notify_request_decision.test.sql`, `supabase/tests/notify_new_request.test.sql` |
| App: modelo, API, inscrição, contexto | `src/notifications/` |
| Aviso ao vivo | `src/components/NotificationToast.tsx` (por cima de todas as telas, em `app/(app)/_layout.tsx`) |
| Lista de avisos | `app/(app)/notifications/index.tsx` |
| Badge do motorista | `src/components/PendingRequestsBadge.tsx`, `src/requests/usePendingRequests.tsx`, `src/requests/pendingBadge.ts` |
| Testes do app | `__tests__/notifications.test.ts`, `__tests__/pendingBadge.test.ts` |

## Como funciona

**A tabela já existia.** `public.notifications` foi criada no EP03 como fila
de avisos (rota cancelada/alterada). Foi **estendida**: `request_id`, tipos
`solicitacao_aceita`, `solicitacao_recusada`, `solicitacao_recebida`.

**O banco gera o aviso, o app nunca.** `private.notify_request_event` é o
lugar único de "quem recebe e com que texto" para avisos de solicitação,
chamado na **mesma transação**:

- de `decide_request` (aceite/recusa → passageiro);
- de `request_seat` (nova solicitação → motorista da rota).

Se o aviso falhar, a ação é revertida. Índice único `(request_id, kind)`:
nunca dois avisos iguais (e `decide_request` já recusa decidir duas vezes).

**RLS.** Cada um lê só os próprios avisos (policy do EP03). O app não insere
nem apaga (privilégios revogados, sem policy); só pode mudar `read_at`, das
próprias linhas (privilégio por coluna + policy de UPDATE). "Marcar como
lidas" é a RPC `mark_notifications_read`.

**Entrega: Supabase Realtime (WebSocket).** A tabela está na publicação
`supabase_realtime`. O app assina `INSERT` com filtro
`recipient_id=eq.<próprio id>`; o Realtime aplica a RLS de leitura ao
assinante, então mesmo sem filtro ninguém recebe aviso de outra pessoa.

- **Reconexão:** o cliente do Supabase reconecta sozinho; quando o canal
  volta a `SUBSCRIBED` depois de cair, o app recarrega a lista do banco (o
  Realtime não reenvia o que se perdeu). Também recarrega ao voltar o app ao
  primeiro plano (celular) ou a aba ficar visível (web).
- **Token:** o cliente repassa o token renovado ao Realtime sozinho.
- **Logout:** o layout de `(app)` desmonta o `NotificationsProvider`, que
  cancela a inscrição.
- **Offline:** a lista sempre vem do banco ao abrir; o que chegou com o app
  fechado aparece.

**Aviso ao vivo:** cartão no topo, texto completo (título + mensagem), sem
depender de cor, anunciado pelo leitor de tela; "Ver" leva à tela da ação,
"Fechar" dispensa; some em 8 s e fica guardado em Avisos.

**Avisos de rota (EP03).** "Carona cancelada" e "Carona alterada" já eram
gravados desde o EP03; a lista e o aviso ao vivo os mostram também (decisão de
28/10). Nada novo foi implementado para eles.

## Badge de pendências do motorista

- **Contagem derivada**, a cada chamada, das solicitações `pendente` nas rotas
  do motorista que ainda valem (publicadas e futuras):
  `public.my_pending_requests_summary()`. Nenhum contador guardado.
- **Tempo real reaproveitando o evento de aviso**, e não uma segunda inscrição
  em `ride_requests`:
  - o que **sobe** o badge (pedido novo) sempre gera o aviso
    `solicitacao_recebida` → recontagem;
  - o que **desce** (aceitar, recusar, encerrar por vagas esgotadas) é sempre
    ação do próprio motorista → recontagem ao voltar à Home;
  - uma conexão WebSocket só, já filtrada e protegida pela RLS. Assinar
    `ride_requests` exigiria filtrar por uma lista de rotas que muda (a
    tabela não tem `driver_id`) e publicar também os UPDATEs dela.
- Some quando é zero. Rótulo acessível: "3 solicitações pendentes. Toque para
  responder." Toque: direto para a carona se todas as pendências estão numa
  só; senão, "Minhas caronas" (que mostra quantas esperam em cada uma).
- Limite conhecido: se o motorista responder em **outro aparelho**, este só
  recontará ao ganhar foco.

## Tempos medidos (critério: até 5 s)

Web local (`localhost:8081`) contra o Supabase remoto (us-east-1), usuários de
teste reais, 28/10/2026:

| Medição | Amostras |
|---|---|
| Motorista decide → aviso na tela do passageiro | 451 ms, 869 ms, 337 ms |
| Passageiro pede vaga → badge do motorista muda | 852 ms, 941 ms |
| Passageiro pede vaga → aviso na tela do motorista | 594 ms, 770 ms |
| Motorista volta à Home depois de aceitar → badge recontado | 696 ms |

## Push nativo — não implementado (decisão de 28/10)

`expo-notifications` não funciona na web e, no iPhone, não funciona no Expo
Go. Para ter push seria preciso:

1. instalar `expo-notifications` e configurar o projeto no EAS (`projectId`);
2. Android: credenciais FCM (Firebase) no EAS; iOS: chave APNs (conta Apple
   Developer paga);
3. gerar um build de desenvolvimento ou de loja (não roda no Expo Go);
4. tabela de tokens por usuário (RLS própria) e uma Edge Function disparada
   por Database Webhook no INSERT de `notifications`, que envia pela API de
   push do Expo e atualiza `delivery_status`.

A web não registraria token e continuaria só com o Realtime.
