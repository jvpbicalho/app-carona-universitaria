# app-carona-universitaria

Sistema Cooperativo de Caronas Intermunicipais para Universitários — PUC-SP,
disciplina de Gestão Ágil de Projetos.

**Sprint 1 implementado:** EP01 (cadastro com e-mail institucional) e login com
bloqueio temporário após tentativas inválidas.

## Stack

- **App:** React Native + Expo (SDK 54), `expo-router`, TypeScript
- **Backend:** Supabase — Postgres + Auth + Edge Functions (Deno)
- **Projeto Supabase:** organização `GAP 2026`, projeto `app-carona-universitaria`

## Como rodar

```bash
npm install
```

```bash
cp .env.example .env
```

Preencha `.env` com a URL e a publishable key do projeto Supabase, então:

```bash
npm start
```

Alinhar as versões das libs do Expo, se necessário:

```bash
npx expo install --fix
```

### Testes e verificação de tipos

```bash
npm test
```

```bash
npm run typecheck
```

## Estrutura

```
app/                          rotas (expo-router, file-based)
  _layout.tsx                 AuthProvider na raiz
  index.tsx                   redireciona conforme a sessão
  (auth)/                     grupo público — redireciona quem já tem sessão
    sign-in.tsx               login
    sign-up.tsx               cadastro
    verify-email.tsx          "confirme seu e-mail" (pós-cadastro)
  (app)/                      grupo protegido — exige sessão
    home.tsx                  destino do login válido
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

## Para que serve a pasta `supabase/`

Ela é o **código-fonte do backend**, versionado no git. Nada ali é
"pendente": as migrations já estão aplicadas no projeto e a Edge Function já
está deployada. O que a pasta resolve:

- **Reprodutibilidade.** Quem clonar o repo consegue recriar o banco inteiro do
  zero — num projeto Supabase novo, ou local com `supabase start`. Sem isso, o
  schema só existiria dentro do dashboard, sem histórico e sem code review.
- **Rastreabilidade.** Cada mudança de schema é um arquivo num commit, com o
  motivo escrito ao lado. Clicar no dashboard não deixa esse rastro.
- **A Edge Function é código.** `functions/auth-login/` é o fonte real que roda
  em produção, não uma cópia.
- **Config como código.** `config.toml` versiona settings de Auth que hoje
  vivem no dashboard (confirmação de e-mail obrigatória, redirect URLs,
  tamanho mínimo de senha).

Comandos, a partir da raiz do repo:

```bash
npx supabase link --project-ref scfazxgfzcvjfxtckqic
```

```bash
npx supabase db push
```

```bash
npx supabase functions deploy auth-login
```

O `db push` acima é um **no-op hoje** — os nomes dos arquivos de migration
correspondem às versões já registradas no projeto, então o CLI não tem nada
para aplicar. Ele passa a agir quando alguém adicionar uma migration nova.

## Documentação

- [Arquitetura de autenticação](docs/autenticacao.md) — decisões, esquema do
  banco e como verificar os critérios de aceite.
