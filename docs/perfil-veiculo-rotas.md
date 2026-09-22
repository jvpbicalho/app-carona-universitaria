# Perfil, veículo e rotas — EP02 e EP03

Decisões de projeto das três histórias do Sprint 2 e como verificar cada
critério de aceite. Complementa [a arquitetura de autenticação](autenticacao.md).

## Decisões que vieram do wireframe

O [wireframe](wireframes/wireframesunirota.html) já havia fechado pontos que
não estavam no backlog, e o código segue todos:

| Decisão do desenho | Como ficou no código |
|---|---|
| Perfil único com alternância de papel, não duas contas | Uma linha em `profiles`; `active_role` guarda só o modo da UI |
| "Sem veículo salvo, o modo motorista fica indisponível" | Poder dirigir é **derivado** de existir linha em `vehicles` |
| Nº de vagas do veículo limita a carona | Trigger `routes_validate` barra `seats_total > vehicles.seats` |
| Destino sugerido: campus do perfil | `campuses.latitude/longitude` alimentam o atalho na tela 3.1 |
| Contato só após confirmação | E-mail e telefone ficam fora de `public_profiles` |

## História 1 — Preenchimento do perfil

### Critério: campos obrigatórios são nome, foto, curso e campus

A regra existe em dois lugares, de propósito:

- **`src/profile/profileValidation.ts`** — funções puras, sem React e sem
  Supabase. É o que a tela chama **antes** de qualquer requisição, e o que os
  testes exercitam.
- **`profiles.is_complete`** — coluna **gerada** no Postgres. Coluna gerada em
  vez de trigger porque não há como ficar dessincronizada.

A do banco é a autoridade: o trigger de `routes` a consulta para impedir que
alguém publique carona com perfil incompleto. Ao mudar os obrigatórios num
lugar, mude no outro.

Telefone e "sobre mim" são opcionais e **não** entram na conta de completude.

### Critério: perfil incompleto exibe um aviso

`profileIncompleteWarning()` devolve a mensagem, ou `null` quando não há nada a
avisar. O aviso **nomeia o que falta** ("falta foto e campus") em vez do
genérico "seu perfil está incompleto", e é clicável — leva direto ao
formulário.

Aparece em três lugares: na Home (primeira tela após o login), no topo do
perfil, e como bloqueio em "Nova carona".

### Visibilidade entre usuários

A história existe para que "outros usuários me reconheçam e confiem em mim", o
que exige que o perfil seja legível por terceiros. Mas não inteiro.

Tentativa que **não** funciona: liberar a tabela com `using (true)` e filtrar
pela view. `public.profiles` é exposta por PostgREST, então qualquer cliente
faria `GET /rest/v1/profiles` e leria os e-mails de todo mundo — a view não
protege nada. O desenho correto é o inverso:

| Caminho | O que devolve |
|---|---|
| tabela `profiles` (RLS) | só a própria linha, completa |
| view `public_profiles` | de todos: nome, foto, bio, curso, campus |

A view é `security_invoker = false` de propósito. O linter do Supabase marca
isso como ERROR (`security_definer_view`); é aceito conscientemente, e a
justificativa está na migration `20260916225512`. A alternativa (policy aberta
+ grants por coluna) não serve, porque grant de coluna não depende da linha: o
usuário perderia acesso ao próprio e-mail.

## História 2 — Dados do veículo

### Critério: o nº de vagas define o limite máximo por viagem

É o critério com mais consequência, porque outras histórias dependem dele:

```
vehicles.seats                      capacidade do carro (1 a 7, motorista não conta)
  └── routes.seats_total            vagas desta carona   (trigger barra se exceder)
        ├── routes.seats_taken      EP05 incrementa ao confirmar vaga
        └── routes.seats_available  coluna gerada; EP04 filtra por ela
```

`seats_taken` e `seats_available` já existem para que EP04 e EP05 não precisem
de migration nem recalcular nada — o critério pede explicitamente que o limite
esteja acessível para elas.

A validação roda no client (`validateRouteForm`, com a capacidade do veículo
como parâmetro) e no trigger `routes_validate`.

### Placa

Aceita os dois padrões que circulam: Mercosul `ABC1D23` e antigo `ABC1234`.
Normalizada para maiúscula sem hífen, tanto no client quanto num trigger, para
o usuário poder digitar `abc-1d23`.

Não é única globalmente: irmãos dividindo o mesmo carro é caso real numa
comunidade universitária.

**A placa não sai em `public_vehicles`.** Placa identifica pessoa, e expor a de
todos os motoristas a qualquer aluno autenticado seria enumerável. Divulgação
progressiva, seguindo o que o wireframe 3.4 já faz com o contato:

- buscando caronas (EP04): modelo e cor bastam para reconhecer o carro;
- com vaga confirmada (EP05): aí sim a placa.

A segunda etapa entra com EP05, que é quem sabe dizer se há reserva confirmada
entre duas pessoas.

### Um veículo por motorista

`unique (owner_id)`. O wireframe fala em "Meu veículo", singular. Frota por
motorista seria mudança de escopo.

### CNH e consumo médio

- **CNH**: a coluna `cnh_document_path` existe, nullable, sem UI. Exigir CNH no
  cadastro do veículo ou só na primeira publicação é pendência registrada no
  próprio wireframe, e não está nos critérios de aceite desta história.
- **Consumo médio (km/l)**: marcado "Fase 2" no wireframe. Coluna criada para
  não exigir migration quando EP08 chegar; sem UI.

## História 3 — Cadastro de rota

### Critério: origem e destino via busca de endereço com geocodificação

**Provedor escolhido: Nominatim (OpenStreetMap), atrás da Edge Function
`geocode`.** Gratuito, sem chave de API e sem cartão de crédito — o que
importa num projeto de disciplina. Alternativas descartadas: Google Places
(melhor qualidade no Brasil, mas exige conta de faturamento) e Mapbox (boa
cota grátis, mas ainda exige chave).

O app nunca fala com o Nominatim direto, por três motivos:

1. **Política de uso.** O Nominatim exige User-Agent identificável e limita a
   1 req/s por cliente. Do app, cada celular seria um cliente anônimo — o
   caminho rápido para o IP do projeto ser bloqueado.
2. **Cache.** Numa turma inteira buscando os mesmos campi, a segunda busca por
   "PUC Perdizes" não deveria sair da nossa infraestrutura. `geocode_cache`
   guarda por termo normalizado, TTL de 30 dias. Resultado vazio também é
   cacheado.
3. **Troca de provedor.** Migrar para Google ou Mapbox muda só a Edge
   Function; o contrato com o app continua igual.

> **Cuidado verificado em ambiente:** `verify_jwt = true` **não** é suficiente
> para proteger uma Edge Function. O gateway aceita a publishable key sozinha
> no header `apikey`, e essa chave é pública, embutida no bundle. Por isso a
> função valida o Bearer como JWT de usuário de verdade (`requireUser`). Sem
> isso, seria um proxy aberto de geocodificação.

No client, `AddressSearchField` faz debounce de 450 ms e cancela a busca
anterior. Só vale como endereço o que foi **escolhido na lista** — texto
digitado não tem coordenada. Editar o texto depois de escolher limpa a
seleção, senão o rótulo na tela diria uma coisa e as coordenadas salvas outra.

### Critério: o horário não pode ser no passado

Três camadas:

1. **No seletor** — `minimumDate` bloqueia datas passadas no próprio
   calendário. Impedir de escolher é melhor que deixar escolher e reclamar.
2. **`validateRouteForm`** — roda no submit, **antes** de qualquer chamada ao
   Supabase. É o que o critério pede. Recalcula `now` no momento do submit,
   para pegar o caso de o formulário ter ficado aberto até a hora passar.
3. **Trigger `routes_validate`** — backstop, com 1 minuto de tolerância. A
   publishable key é pública e a API REST é chamável direto.

`isDepartureInPast(departureAt, now)` recebe `now` como parâmetro em vez de
chamar `new Date()` internamente — senão o teste ficaria dependente do relógio.

### Coordenadas e PostGIS

O client escreve apenas `latitude`/`longitude`. As colunas `origin_geog` e
`destination_geog` são **geradas** a partir delas, com índice GiST. Assim o
EP04 já tem índice espacial pronto para `ST_DWithin`, e o app não precisa saber
o que é PostGIS.

PostGIS foi instalado no schema `extensions`, não em `public`: instalar no
public despeja centenas de funções no schema exposto pela API REST.

## Esquema do banco

Migrations em `supabase/migrations/`, todas já aplicadas.

| Tabela | Papel |
|---|---|
| `campuses` | campi, com coordenadas para sugerir destino |
| `courses` | cursos de graduação |
| `profiles` | estendida com foto, telefone, curso, campus, bio, `active_role`, `is_complete` |
| `vehicles` | um por motorista; `seats` é o teto de vagas |
| `routes` | uma viagem específica; recorrência é Fase 2 |
| `geocode_cache` | respostas do Nominatim por termo |

| View | Papel |
|---|---|
| `public_profiles` | perfil de terceiros, sem e-mail e sem telefone |
| `public_vehicles` | veículo de terceiros, sem placa, CNH ou consumo |

### Storage

| Bucket | Acesso |
|---|---|
| `avatars` | leitura pública; escrita só na pasta `<uid>/` do dono |
| `documents` | privado; CNH, só o dono em qualquer operação |

A convenção de caminho em ambos é `<uid>/arquivo`, porque é o que as policies
usam para autorizar.

## Como verificar os critérios de aceite

Validações de client (sem rede):

```bash
npm test
```

Cobrem: campos obrigatórios e o texto do aviso, formato de placa nos dois
padrões, limite de vagas pela capacidade do veículo, e horário no passado com
instante fixo.

Backstops de servidor, chamando a API REST direto com um JWT válido — é o
caminho que ignora a validação do app:

```bash
curl -s -X POST "$URL/rest/v1/routes" -H "apikey: $KEY" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"driver_id":"...","vehicle_id":"...","origin_label":"Rua X","origin_latitude":-23.55,"origin_longitude":-46.63,"destination_label":"PUC","destination_latitude":-23.53,"destination_longitude":-46.67,"departure_at":"2020-01-01T08:00:00Z","seats_total":2}'
```

Esperado: `400` com "A partida não pode ser no passado." Trocar a data por uma
futura e `seats_total` por um valor acima da capacidade do veículo devolve "A
carona não pode oferecer N vagas: o veículo tem M."

## Limitações conhecidas

- **Coordenadas de campus incompletas.** Perdizes e Consolação foram
  geocodificados e conferidos; Santana, Ipiranga, Barueri e Sorocaba não
  retornaram resultado no Nominatim e ficaram nulos. O atalho "usar meu campus
  como destino" só aparece para campus com coordenada. A equipe precisa
  preencher os quatro (pelo mapa ou com um termo de busca melhor).
- **Lista de cursos não é oficial.** A carga inicial foi montada pela equipe de
  desenvolvimento, não extraída do catálogo da universidade. Revisar com a
  coordenação antes de usar com a turma.
- **Tab bar não implementada.** O wireframe mostra Buscar/Caronas/Avisos/Perfil
  na base. Como EP04 e EP06 não existem, a navegação hoje é por Stack a partir
  da Home — criar abas com telas vazias seria prometer o que não há.
- **Detalhe, edição e cancelamento de carona** (wireframe 3.4 e 3.5) foram
  implementados na história seguinte — ver
  [editar e cancelar rota](editar-cancelar-rota.md).
- **Limite de e-mails do Supabase.** O SMTP padrão estoura a cota em poucos
  cadastros por hora (`over_email_send_rate_limit`). Continua sendo a pendência
  número um antes de qualquer teste com a turma.
