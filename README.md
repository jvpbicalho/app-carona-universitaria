# 🚗 Carona Universitária

Sistema cooperativo de caronas intermunicipais para a comunidade acadêmica.
Motoristas (alunos ou professores) cadastram rotas e horários; passageiros
buscam e solicitam vagas; a avaliação é mútua e o custo do combustível é
dividido de forma estimada.

Projeto da disciplina **Gestão Ágil de Projetos** — PUC-SP, Ciência da
Computação (Prof. Mário Farah).

> **Status:** Sprint 1 em andamento. Cadastro com e-mail institucional e login
> (com bloqueio temporário por tentativas inválidas) já estão implementados —
> ver [detalhes da arquitetura de autenticação](docs/autenticacao.md).

---

## Sobre o projeto

O acesso ao app é restrito a quem tem vínculo comprovado com a universidade: o
cadastro só aceita e-mail institucional. A partir daí, o fluxo cobre o ciclo
completo de uma carona:

```
cadastro institucional → perfil → publicar rota → buscar/solicitar vaga
→ aceitar/recusar → notificar → avaliar
```

O MVP está dividido em 7 épicos. Os dois primeiros — cadastro e perfil — são o
foco do Sprint 1; busca/matching (EP04) e notificações em tempo real (EP06) são
os núcleos de maior complexidade técnica do projeto.

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
| App | React Native + Expo (SDK 54), `expo-router`, TypeScript (strict) |
| Backend | Supabase — Postgres, Auth, Edge Functions (Deno) |
| Testes | Jest + `ts-jest` |
| Projeto Supabase | organização `GAP 2026` · projeto `app-carona-universitaria` |

## Funcionalidades implementadas

- ✅ **Cadastro com e-mail institucional** — domínio validado no app antes de
  qualquer chamada de rede, e reforçado por um trigger no banco. Link de
  confirmação enviado por e-mail.
- ✅ **Login** — redireciona para a Home ao validar as credenciais.
- ✅ **Bloqueio temporário** — 3 tentativas inválidas bloqueiam a conta por 15
  minutos, controlado no servidor (não é possível burlar reinstalando o app).
- ⏳ Perfil do usuário (foto, curso, campus, veículo) — em andamento.

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
app/                          rotas (expo-router, file-based)
  _layout.tsx                 AuthProvider na raiz
  index.tsx                   redireciona conforme a sessão
  (auth)/                     grupo público — redireciona quem já tem sessão
    sign-in.tsx                login
    sign-up.tsx                cadastro
    verify-email.tsx           "confirme seu e-mail" (pós-cadastro)
  (app)/                      grupo protegido — exige sessão
    home.tsx                   destino do login válido
src/
  auth/
    AuthContext.tsx           sessão, signUp, signIn, signOut
    institutionalEmail.ts     validação de domínio (função pura)
    authErrors.ts             erros → mensagens em pt-BR
  components/                 TextField, PrimaryButton, Banner, AuthScreen
  lib/supabase.ts             client com sessão no SecureStore (fatiada)
  theme/tokens.ts             cores, espaçamentos, tipografia
supabase/
  config.toml                 config do CLI + settings de Auth versionadas
  migrations/                 schema versionado (já aplicado no projeto)
  functions/auth-login/       Edge Function do login
__tests__/                    testes das funções puras
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

## Documentação

- [Arquitetura de autenticação](docs/autenticacao.md) — decisões de design,
  esquema do banco e como verificar os critérios de aceite do Sprint 1.
- Backlog completo, Kanban e cronograma vivem no Notion (workspace `GAP 2026`).

## Licença

[MIT](LICENSE)
