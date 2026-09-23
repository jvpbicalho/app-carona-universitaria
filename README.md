# 🚗 Carona Universitária

Sistema cooperativo de caronas intermunicipais para a comunidade acadêmica.
Motoristas (alunos ou professores) cadastram rotas e horários; passageiros
buscam e solicitam vagas; a avaliação é mútua e o custo do combustível é
dividido de forma estimada.

Projeto da disciplina **Gestão Ágil de Projetos** — PUC-SP, Ciência da
Computação (Prof. Mário Farah).

> **Status:** Autenticação (EP01), perfil e veículo (EP02) e rotas (EP03:
> publicar, editar e cancelar) já estão implementados — ver a
> [documentação](#documentação).

---

## Sobre o projeto

O acesso ao app é restrito a quem tem vínculo comprovado com a universidade: o
cadastro só aceita e-mail institucional. A partir daí, o fluxo cobre o ciclo
completo de uma carona:

```
cadastro institucional → perfil → publicar rota → buscar/solicitar vaga
→ aceitar/recusar → notificar → avaliar
```

O MVP está dividido em 7 épicos. Os três primeiros — autenticação, perfil e
rotas — já estão implementados; busca/matching (EP04) e notificações em tempo
real (EP06) são os núcleos de maior complexidade técnica do projeto.

### Equipe

| Integrante | Função |
|---|---|
| João Victor Pereira Bicalho | Gerente do Projeto |
| João Guilherme Costa Couto | Scrum Master |
| Carlos Gabriel Gouveia | UX Designer |
| Matheus Giampaoli Silva | QA (Quality Assurance) |
| Mateus Munhoz Guimarães | Desenvolvedor |

## Stack

| Camada | Tecnologia |
|---|---|
| App | React Native 0.86 + Expo (SDK 57), `expo-router`, TypeScript 6 (strict) |
| Backend | Supabase — Postgres, Auth, Edge Functions (Deno) |
| Testes | Jest + `ts-jest` |
| Projeto Supabase | organização `GAP 2026` · projeto `app-carona-universitaria` |

## Funcionalidades implementadas

**EP01 — Autenticação**
- ✅ **Cadastro com e-mail institucional** — domínio validado no app antes de
  qualquer chamada de rede, e reforçado por um trigger no banco. Link de
  confirmação enviado por e-mail.
- ✅ **Login** — redireciona para a Home ao validar as credenciais.
- ✅ **Bloqueio temporário** — 3 tentativas inválidas bloqueiam a conta por 15
  minutos, controlado no servidor (não é possível burlar reinstalando o app).

**EP02 — Perfil e veículo**
- ✅ **Perfil** — foto, nome, curso, campus, telefone e bio. Perfil incompleto
  exibe um aviso que diz exatamente o que falta.
- ✅ **Alternância passageiro/motorista** — perfil único, sem conta separada.
  O modo motorista só existe para quem cadastrou veículo.
- ✅ **Veículo** — modelo, cor, placa (Mercosul ou antiga) e nº de vagas, que
  passa a limitar todas as caronas do motorista.

**EP03 — Rotas**
- ✅ **Publicar carona** — origem e destino por busca de endereço com
  geocodificação, data, horário, vagas e observações.
- ✅ **Minhas caronas** — lista das viagens publicadas, com detalhe de cada uma.
- ✅ **Editar e cancelar carona** — origem, destino, data e horário editáveis;
  cancelamento com motivo obrigatório, preservando a carona no histórico.
  Passageiros com vaga confirmada recebem aviso na mesma transação da mudança
  (a entrega em push/tempo real chega com o EP06).

**Próximos**
- ⏳ Busca e matching de caronas (EP04) · notificações em tempo real (EP06)

## Como rodar

### Pré-requisitos

- [Node.js](https://nodejs.org) 20 ou superior
- Uma conta [Expo](https://expo.dev) (opcional, só para publicar builds)
- App **Expo Go** no celular, ou um emulador Android/iOS configurado

### 1. Instalar as dependências

```bash
npm install
```

### 2. Configurar as variáveis de ambiente

```bash
cp .env.example .env
```

Preencha `.env` com a URL e a publishable key do projeto Supabase (peça ao
time se não tiver acesso ao dashboard).

### 3. Iniciar o app

```bash
npm start
```

Isso abre o Metro Bundler no terminal — escaneie o QR code com o app Expo Go,
ou pressione `a` / `i` para abrir num emulador Android/iOS.

Atalhos diretos:

```bash
npm run android
```

```bash
npm run ios
```

```bash
npm run web
```

### Se as libs do Expo ficarem desalinhadas

```bash
npx expo install --fix
```

## Testes e verificação de tipos

```bash
npm test
```

```bash
npm run typecheck
```

## Estrutura do projeto

```
app/                            rotas (expo-router, file-based)
  _layout.tsx                   AuthProvider na raiz
  index.tsx                     redireciona conforme a sessão
  (auth)/                       grupo público — redireciona quem já tem sessão
    sign-in.tsx                  login
    sign-up.tsx                  cadastro
    verify-email.tsx             "confirme seu e-mail" (pós-cadastro)
  (app)/                        grupo protegido — exige sessão
    home.tsx                     destino do login; aviso de perfil incompleto
    complete-profile.tsx         onboarding do perfil
    profile/index.tsx            perfil + alternância passageiro/motorista
    profile/personal.tsx         editar dados pessoais
    profile/vehicle.tsx          cadastro do veículo
    routes/new.tsx               publicar carona
    routes/index.tsx             minhas caronas
    routes/[id]/index.tsx        detalhe da carona
    routes/[id]/edit.tsx         editar carona
    routes/[id]/cancel.tsx       cancelar carona
src/
  auth/                         sessão, validação de domínio, erros em pt-BR
  profile/                      contexto, API, formulário e regras de completude
  vehicle/                      API e regras (placa, vagas)
  routes/                       API e regras (horário, limite de vagas)
  geocode/                      cliente da busca de endereço
  components/                   campos, selects, estados vazio/erro/carregando
  lib/                          client Supabase e listas de referência
  theme/tokens.ts               cores, espaçamentos, tipografia
supabase/
  config.toml                   config do CLI + settings de Auth versionadas
  migrations/                   schema versionado (já aplicado no projeto)
  functions/auth-login/         Edge Function do login
  functions/geocode/            Edge Function da busca de endereço
docs/                           decisões de arquitetura e wireframes
__tests__/                      testes das funções puras
```

O guard de sessão vive nos layouts de grupo, não nas telas: toda rota nova
dentro de `(app)/` já nasce exigindo autenticação.

## Backend (Supabase)

A pasta `supabase/` é o código-fonte do backend, versionado junto com o app —
migrations, Edge Functions e configurações de Auth, não só o schema final.

```bash
npx supabase link --project-ref scfazxgfzcvjfxtckqic
```

```bash
npx supabase db push
```

```bash
npx supabase functions deploy auth-login
```

```bash
npx supabase functions deploy geocode
```

## Documentação

- [Arquitetura de autenticação](docs/autenticacao.md) — EP01: validação de
  domínio institucional e bloqueio por tentativas.
- [Perfil, veículo e rotas](docs/perfil-veiculo-rotas.md) — EP02 e EP03:
  completude de perfil, limite de vagas, geocodificação e limitações conhecidas.
- [Editar e cancelar rota](docs/editar-cancelar-rota.md) — soft delete, avisos
  a passageiros confirmados e o contrato que EP05 e EP06 vão usar.
- [Wireframes](docs/wireframes/) — esboços de referência de todos os épicos.
- Backlog completo, Kanban e cronograma vivem no Notion (workspace `GAP 2026`).

## Licença

[MIT](LICENSE)
