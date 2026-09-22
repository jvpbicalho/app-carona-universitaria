# Editar e cancelar rota — e o ponto de extensão de avisos

História do EP03: *como motorista, quero cancelar ou editar uma rota publicada,
para ajustar minha disponibilidade quando necessário.*

Critério de aceite: **passageiros com vaga confirmada são notificados
imediatamente após o cancelamento ou edição da rota.**

Complementa [perfil, veículo e rotas](perfil-veiculo-rotas.md).

## O que o motorista pode fazer

| Ação | Campos | Quando |
|---|---|---|
| Editar | origem, destino, data, horário | rota `publicada` que ainda não partiu |
| Cancelar | motivo obrigatório | rota `publicada` que ainda não partiu |

Vagas e observações **não** são editáveis: a história pede os quatro campos
acima, e reduzir vagas com passageiros confirmados exige uma regra que é do
EP05 (o que fazer com quem passa do novo limite).

Fluxo de telas, seguindo o wireframe: **Minhas caronas (3.3)** → toca no cartão
→ **Detalhe (3.4)**, com a lista de passageiros confirmados → **Editar** ou
**Cancelar (3.5)**.

## Cancelar é soft delete

Nunca `DELETE`. A rota continua no banco com:

| Coluna | Valor |
|---|---|
| `status` | `'cancelada'` — estado terminal, não volta |
| `cancellation_reason` | o motivo escolhido; vai no aviso ao passageiro |
| `cancelled_at` | preenchido **pelo trigger**; o valor enviado pelo app é ignorado |

Duas constraints garantem a coerência nos dois sentidos: rota cancelada sem
motivo é recusada, e motivo numa rota publicada também. Não há policy de
`DELETE` em `routes`.

Por que não apagar: a rota é histórico do motorista e dos passageiros (EP09),
e o aviso de cancelamento aponta para ela — o passageiro que toca no aviso
precisa ver a carona com o motivo. Por isso a policy de leitura deixa quem
tinha pedido na rota continuar vendo-a depois de cancelada.

O motivo é obrigatório porque o wireframe 3.5 diz que ele "entra na
notificação". É uma lista fechada com a opção "Outro" (texto livre de 3 a 200
caracteres), para o aviso não chegar vazio ou como "asdf".

## Horário não-passado: a mesma regra do cadastro

`src/routes/routeValidation.ts` foi reorganizado em peças (`validatePlaces`,
`validateDeparture`, ...). O cadastro (`validateRouteForm`) e a edição
(`validateRouteEdit`) compõem **as mesmas** peças — "horário não pode ser no
passado" é uma função só, com a mesma mensagem nas duas telas.

Detalhe da edição: o horário só é revalidado **se mudou**. Quem edita só a
origem de uma carona que sai em 2 minutos não deve ler "o horário não pode ser
no passado" sobre um horário que nem tocou. O bloqueio certo para esse caso
vem antes, de `canModifyRoute`: "esta carona já partiu".

No banco, o trigger `routes_validate` aplica a mesma regra só quando
`departure_at` muda.

## Correção no trigger do Sprint 2

O `routes_validate` original revalidava capacidade do veículo e perfil
completo em **todo** `UPDATE`. Com cancelamento isso vira armadilha:

- motorista reduz o carro de 4 para 2 vagas, com uma carona de 3 publicada →
  **não consegue cancelar** (`seats_exceed_vehicle`);
- motorista troca a foto e o perfil fica incompleto por um instante →
  **não consegue cancelar** (`profile_incomplete`).

Cancelar precisa ser sempre possível. Agora cada regra roda só quando o que
ela protege muda: perfil completo só no `INSERT` (é condição para *publicar*),
capacidade só quando `seats_total` ou `vehicle_id` mudam. Verificado contra o
banco real: reduzir o carro para 2 vagas e cancelar a carona de 3 funciona.

O trigger também passou a proteger o que o app nunca deve escrever:

| Proteção | Motivo |
|---|---|
| `seats_taken` não muda pela API | é do EP05 (aceite de solicitação) |
| status só vai de `publicada` para `cancelada` pela API | `concluida` é do sistema |
| `driver_id` é imutável | — |
| cancelar e editar no mesmo `UPDATE` é recusado | o aviso ficaria ambíguo |

A distinção "escrita do app" é `current_user = 'authenticated'` — o papel com
que o PostgREST executa. Funções `SECURITY DEFINER` rodam como o dono e passam,
que é como o EP05 vai poder mexer em `seats_taken`.

## O ponto de extensão de avisos

### Como funciona hoje

```
UPDATE routes  (app, API REST, dashboard — qualquer caminho)
  │
  ├─ BEFORE: routes_validate           valida, recusa o que não pode
  │
  └─ AFTER:  routes_notify_passengers  ─► private.on_route_changed()
                                            │  decide o tipo e o que mudou
                                            ▼
                               private.notify_affected_passengers(
                                   route_id, kind, reason, details)
                                            │  consulta ride_requests 'confirmada'
                                            ▼
                               INSERT em public.notifications
                               (uma linha por passageiro, delivery_status = 'pendente')
```

**O aviso é gravado na mesma transação da mudança.** Consequências:

- não existe rota cancelada ou editada sem aviso — nem se o app fechar entre
  duas chamadas, nem se alguém mudar a rota pela API direto;
- o reverso também vale: se a gravação do aviso falhar, a edição é revertida.
  Isso aconteceu de verdade durante o desenvolvimento (um bug de tipo de array
  bloqueou todas as edições) e foi pego nos testes.

Por isso o app **não** chama nenhuma função de notificar depois de salvar —
`updateRoute` e `cancelRoute` só fazem o `UPDATE`.

### O que vai no aviso

| Campo | Cancelamento | Edição |
|---|---|---|
| `kind` | `rota_cancelada` | `rota_alterada` |
| `title` | "Carona cancelada" | "Carona alterada" |
| `body` | "A carona de 15/10 às 08:15 para PUC Perdizes foi cancelada. Motivo: …" | "O motorista alterou o horário e o destino da sua carona. Agora: saída …" |
| `payload` | `route_id`, `reason` | `route_id`, `changed_summary`, `previous` (valores antigos) |

Horários formatados em `America/Sao_Paulo`: `timestamptz` sem fuso sairia em
UTC, três horas adiantado. Texto curto porque o push precisa caber em duas
linhas (wireframe 6.2).

Edição que não afeta o passageiro (ex.: o EP05 incrementando `seats_taken`)
não gera aviso.

### Quem é avisado

Somente solicitações com status `confirmada`. Quem está `aguardando` não tem
vaga e não é avisado — o que acontece com esses pedidos quando a rota é
cancelada é decisão do EP05 (ver abaixo).

## Para o EP05 (solicitação e confirmação de vagas)

A tabela `ride_requests` já existe no formato **mínimo**: `route_id`,
`passenger_id`, `status` com os quatro estados do wireframe 5.3
(`aguardando`, `confirmada`, `recusada`, `cancelada`). Ela foi criada aqui para
a notificação consultar destinatários reais, em vez de um stub que o EP05
teria de reescrever.

O EP05 deve:

- **estender** a tabela (ponto de embarque, mensagem, motivo de recusa) em vez
  de criar outra;
- criar a escrita — hoje não há policy de `INSERT`/`UPDATE`, então o app não
  consegue escrever nela;
- atualizar `routes.seats_taken` por uma função `SECURITY DEFINER` (a API
  direta é barrada pelo trigger);
- decidir o que acontece com pedidos `aguardando` de uma rota cancelada
  (provavelmente virar `cancelada`) e se passageiros confirmados precisam
  reconfirmar depois de uma edição de horário;
- revelar a placa (`vehicles.plate`) ao passageiro confirmado.

Nada disso exige mudar esta história: confirmar uma vaga já faz o passageiro
passar a receber avisos.

## Para o EP06 (notificações em tempo real)

`public.notifications` é uma fila (outbox). Esta história decide **quem** é
avisado e **com que texto**; o EP06 decide **como entregar**. Formas previstas,
nenhuma exigindo alterar esta história:

- **Realtime**: o app assina `INSERT` em `notifications` filtrado pelo próprio
  `recipient_id`. A RLS já garante que cada um só recebe os seus.
- **Push**: Database Webhook em `INSERT` → Edge Function que envia via Expo
  Push e atualiza `delivery_status` para `enviada` ou `falhou`. O índice
  parcial `notifications_pending_idx` existe para essa varredura.

O EP06 também precisa: acrescentar os tipos dele à constraint
`notifications_kind_check`, criar a policy de `UPDATE` para marcar como lida
(`read_at`), e a tela "Avisos" (6.1). Aviso de cancelamento é crítico e não
pode ser desligado nas preferências (wireframe 6.4).

## Segurança

| Objeto | Acesso |
|---|---|
| `ride_requests` | leitura: o próprio passageiro e o motorista da rota; escrita: ninguém pelo app (EP05) |
| `notifications` | leitura: só o destinatário; escrita: ninguém pelo app |
| `private.notify_affected_passengers` | só `service_role`; não é exposta como RPC |
| `private.is_route_driver`, `private.has_request_on_route` | auxiliares de RLS |

As policies de `routes` e `ride_requests` precisam consultar uma à outra, e
policies que se referenciam em ciclo dão "infinite recursion detected in
policy". As duas funções auxiliares `SECURITY DEFINER` quebram o ciclo. Elas
ficam no schema `private`, que o PostgREST não expõe — então não viram
`/rest/v1/rpc/...` e não disparam o lint de função `SECURITY DEFINER` exposta.

## Como foi verificado

Contra o banco real, com um motorista, um passageiro **confirmado**, um
**aguardando** e um usuário sem relação com a rota, todos via API REST com JWT:

- editar o horário → 1 aviso para o confirmado, 0 para o aguardando;
- editar origem e destino → aviso "alterou a origem e o destino";
- editar para o passado → `400` "A partida não pode ser no passado.";
- cancelar sem motivo → `400`;
- cancelar e editar juntos → `400`;
- reduzir o carro abaixo das vagas da carona e cancelar → `200`;
- `cancelled_at` falso enviado pelo app → ignorado, gravado o instante real;
- editar ou cancelar de novo uma rota cancelada → `400`;
- usuário sem relação tentando cancelar → nenhuma linha afetada;
- motorista mexendo em `seats_taken` ou marcando `concluida` → `400`;
- cada usuário lê só os próprios avisos; o confirmado continua vendo a rota
  cancelada; ninguém forja aviso nem se autoconfirma (`403`);
- a função de notificação não é chamável por RPC (`404`).

Validações do app: `__tests__/routeEditCancel.test.ts`.
