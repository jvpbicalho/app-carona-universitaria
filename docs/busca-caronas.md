# Buscar caronas — EP04

*Como passageiro, quero buscar caronas informando origem, destino e horário
desejado, para encontrar viagens compatíveis com minha necessidade.*

Critérios de aceite: **resultados ordenados por relevância (proximidade +
horário)** e **tempo de resposta menor que 3 segundos**.

## Onde está cada coisa

| Parte | Arquivo |
|---|---|
| Busca (filtro + ordenação) | `supabase/migrations/20260930222538_search_rides.sql` — função `public.search_rides` |
| **Limites (lugar único)** | `public.search_limits()`, que lê `public.matching_settings` (migration `20261021230424_matching_settings.sql`) |
| Tela do admin | `app/(app)/admin/matching.tsx` + `src/admin/` |
| Teste do SQL | `supabase/tests/search_rides.test.sql` e `supabase/tests/matching_settings.test.sql` |
| Regras do app (validação, "ampliar", formatação) | `src/search/searchValidation.ts` |
| Chamada da RPC | `src/search/searchApi.ts` |
| Telas | `app/(app)/search/index.tsx` (4.1) e `app/(app)/search/results.tsx` (4.2 e 4.6) |
| Testes do app | `__tests__/searchValidation.test.ts` |

## Abordagem

Uma função SQL chamada por RPC (`supabase.rpc('search_rides', …)`), e não
filtro no app. É no banco que os índices funcionam, e é o que garante os 3 s
com milhares de rotas. A função é `SECURITY INVOKER`: roda com a RLS de quem
busca, sem atalho de permissão. Nome, foto e curso do motorista vêm de
`public_profiles`; modelo e cor do carro de `public_vehicles` (sem placa).

### O que entra

Todas as condições precisam valer:

- `status = 'publicada'` — rota cancelada é soft delete e fica de fora;
- saída **no futuro**. Nada marca `concluida` sozinho, então uma rota que já
  partiu continua `publicada` — este filtro é indispensável;
- saída dentro da **janela** em torno do horário desejado;
- **com vaga** (`seats_available > 0`). Rota lotada some da busca (wireframe 5.4);
- de **outro** motorista — quem busca não vê as próprias caronas;
- origem da carona a até **R km** da origem do passageiro, **e** destino da
  carona a até R km do destino dele.

### Relevância, em linguagem simples

Cada carona recebe uma **penalidade de 0 a 1**, somando três partes de mesmo
peso:

1. distância entre o seu ponto de saída e o da carona;
2. distância entre o seu destino e o da carona;
3. diferença entre o horário que você quer e o da carona.

Cada parte é medida **em relação ao próprio limite**: 1 km num raio de 2 km
conta 0,5; 15 min numa janela de 30 conta 0,5. A lista sai da menor penalidade
para a maior; empate vai para quem sai mais cedo.

Exemplo real da verificação: buscando às 21:30, uma carona das 20:02 (a mais
próxima no horário) ficou **atrás** de duas das 19:52 e 19:57, porque sai a
1 km do passageiro e as outras saem do mesmo ponto. É proximidade + horário,
não só horário.

A penalidade **não aparece na tela**, nem como nota nem como percentual. Score
de compatibilidade explicável é Fase 2 (wireframe 4.3).

## Limites em um lugar só

`public.search_limits()` devolve raio, janela, teto da janela e os três pesos.
`search_rides` lê dela, e o app também (`fetchSearchLimits`) — não há cópia
dos valores no TypeScript.

| Limite | Valor inicial | Origem |
|---|---|---|
| Raio (origem **e** destino) | **2 km** | wireframe 4.4, "distância máxima do embarque" |
| Janela | **± 30 min** | wireframe 4.4 |
| Teto da janela ("Ampliar") | **± 120 min** | — |
| Pesos | 1/3 cada | — |

### Configurável pelo admin (história "Regras de tolerância", 21/10/2026)

Raio e janela moram em `public.matching_settings` (linha única) e
`search_limits()` lê de lá — `stable`, sem cache no app: **a busca seguinte já
usa o valor novo, sem redeploy**. Os valores iniciais são os mesmos de antes
(2 km, ±30 min).

- **Faixas aceitas** (constraint no banco, espelhadas em
  `src/admin/matchingValidation.ts`): raio **0,5–50 km**, janela **5–240 min**.
- **Teto do "Ampliar"** = 4 × janela, até 240 min (com 30 dá 120, o valor
  anterior). O admin edita só dois campos; o teto acompanha.
- **Quem altera**: só administradores (`public.app_admins`). Leitura para
  qualquer autenticado. A escrita é pela RPC `update_matching_settings`, que
  recusa não-admin com erro explícito (um UPDATE direto de não-admin passaria
  pela RLS sem efeito e sem erro). `updated_by`/`updated_at` são preenchidos
  pelo banco.
- **Primeiro admin**: nenhum. Para promover:
  `insert into public.app_admins (user_id) select id from auth.users where email = '…';`
- O limite é inclusivo (rota a exatamente R km entra), até a precisão do
  ponto flutuante do PostGIS: a 3000 m exatos, `st_dwithin(…, 3000)` pode dar
  falso por erro sub-milimétrico. Irrelevante na prática; documentado no teste.

## Vagas — ponto de extensão do EP05

A estrutura de solicitações existe (`ride_requests`, criada em "editar e
cancelar rota"), mas ninguém escreve nela ainda. A busca usa
`routes.seats_available` (`seats_total − seats_taken`), coluna gerada. Hoje
`seats_taken` é sempre 0, então vale o total de vagas **da carona** (que já é
limitado pela capacidade do veículo). Quando o EP05 confirmar vagas e mantiver
`seats_taken`, a busca passa a mostrar as vagas realmente livres — e a esconder
as lotadas — sem mudar nada aqui.

## Desempenho (critério de 3 s)

**Índices usados** — nenhum novo foi necessário:

| Índice | Criado em | Papel |
|---|---|---|
| `routes_open_departure_idx` (parcial, `status = 'publicada'`) | Sprint 2 | janela de horário |
| `routes_origin_geog_idx` (GiST) | Sprint 2 | raio na origem |

**Como foi validado:** 200 motoristas e **50.000 rotas** gerados na Grande São
Paulo nos próximos 30 dias, 70% indo para os campi e 5% canceladas; depois,
apagados.

- `EXPLAIN ANALYZE`, no pior caso (destino no campus, onde estão 70% das
  rotas): **1,9 ms** de execução. O Postgres cruzou o índice de horário (82
  linhas na janela) com o GiST da origem (596 no raio) e **não** usou o GiST do
  destino, que casaria com ~35 mil.
- **Ponta a ponta**, pela API com JWT real, 15 chamadas por cenário: mediana
  **~770 ms**, pior caso **1,27 s**. A chamada trivial `search_limits` mede
  **~750 ms** sozinha — ou seja, quase tudo é rede (daqui até us-east-1); a
  busca soma ~20 ms.

O plano deve ser revisto se a distribuição mudar muito (por exemplo, quase
todas as origens num mesmo ponto).

## Testes

- **SQL** (`supabase/tests/search_rides.test.sql`): cria fixtures e verifica cada
  filtro (cancelada, passada, própria, lotada, fora do raio na origem, fora do
  raio no destino, fora da janela), a ordem, o desempate, as penalidades exatas,
  o "Ampliar" e o teto. Tudo numa transação com `ROLLBACK` no fim. Rodar o
  arquivo inteiro no SQL Editor do Supabase (ou `psql`); sem erro = passou.
  **Validado que o teste reprova**: com o raio adulterado para 5 km, falhou
  como deveria.
- **Jest** (`__tests__/searchValidation.test.ts`): validação do formulário
  antes da rede, "ampliar" até o teto, formatação de distância/horário e
  tradução de erros.

## Fora desta entrega

- Detalhe da carona e **solicitar vaga** (4.5 / EP05): o cartão do resultado
  ainda não é clicável.
- Score de compatibilidade e sua explicação (4.3), filtros (4.4) — Fase 2.
- "Avisar quando surgir" do estado vazio (4.6) — depende do EP06.
- "Trajetos recentes" da tela de busca (4.1).
- **Na versão web**, data e horário não abrem (limitação já conhecida do
  seletor). A busca funciona com o horário sugerido (próximo quarto de hora).
