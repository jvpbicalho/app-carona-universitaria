# Arquitetura de autenticação — Sprint 1

Decisões de projeto das duas primeiras histórias, e como verificar cada critério
de aceite.

## Domínio institucional

**`@pucsp.edu.br`**, domínio único, sem curinga de subdomínio.

Configurado em dois lugares que precisam ser mantidos em sincronia:

| Onde | O quê | Papel |
|---|---|---|
| `.env` → `EXPO_PUBLIC_INSTITUTIONAL_EMAIL_DOMAINS` | lista no client | UX: bloqueia antes da chamada de rede |
| `public.allowed_email_domains` | tabela no Postgres | autoridade: alimenta o trigger |

Para aceitar `@aluno.pucsp.edu.br` no futuro, há duas opções: inserir a linha
explicitamente, ou marcar `include_subdomains = true` em `pucsp.edu.br`. A
primeira é preferível — curinga amplia a superfície de cadastro para qualquer
subdomínio que a TI da universidade venha a criar.

A comparação é sempre por **igualdade exata de domínio**, nunca `endsWith`.
`endsWith` aceitaria `aluno@pucsp.edu.br.invasor.com`. Há teste para esse caso.

## História 1 — Cadastro

### Critério: e-mail no domínio da universidade recebe link de confirmação

O `signUp` do Supabase Auth com **Confirm email** ligado cria o usuário sem
sessão e dispara o link. `data.session === null` é o sinal de que a confirmação
está pendente, e a tela `verify-email` é exibida.

O trigger `on_auth_user_created` cria a linha em `public.profiles` na mesma
transação, com o `full_name` vindo de `raw_user_meta_data`.

### Critério: e-mail fora do domínio é bloqueado antes de qualquer confirmação

Três camadas, da mais superficial à autoritativa:

1. **Blur do campo** (`sign-up.tsx`) — erro aparece antes do submit.
2. **`AuthContext.signUp`** — `validateInstitutionalEmail` roda antes de
   `supabase.auth.signUp`. Reprovado, a função retorna erro e **nenhum pacote
   sai do dispositivo**. É o que o critério pede literalmente.
3. **Trigger `enforce_institutional_email`** em `auth.users` — backstop. A
   validação do client é apenas UX: a publishable key é pública e está embutida
   no bundle, então qualquer pessoa pode chamar `POST /auth/v1/signup` direto.
   O trigger é `BEFORE INSERT`, roda dentro da transação do GoTrue e aborta o
   insert, de modo que o e-mail nunca é enfileirado.

Efeito colateral conhecido da camada 3: o GoTrue traduz a exceção de banco como
HTTP 500 com `"Database error saving new user"`. Mensagem feia, mas só é vista
por quem burlou o app. `describeSignUpError` mapeia isso para texto legível.

> Alternativa considerada: o Auth Hook `before-user-created` do Supabase, que
> devolve erro estruturado em vez de 500. Não foi adotado porque exige
> configuração no dashboard, fora do controle das migrations — o trigger
> funciona já no `db push`. Vale trocar se a mensagem incomodar.

## História 2 — Login

### Onde fica o bloqueio após 3 tentativas: a decisão

Três opções foram avaliadas.

**Contador no client — descartado.** É burlável por reinstalação do app, limpeza
de storage, ou simplesmente ignorando o app e chamando a API REST direto. Serve
como feedback visual, nunca como controle de acesso.

**Rate limiting nativo do Supabase Auth — descartado.** Existe e é útil, mas
resolve outro problema: é por **IP**, com janela fixa. Dois motivos para não
atender este critério:

- Não bloqueia *a conta*. Um atacante com IPs rotativos continua tentando na
  mesma conta indefinidamente.
- Num campus atrás de NAT, centenas de alunos compartilham o IP de saída. Um
  limite por IP bloquearia gente inocente durante o pico de acesso, sem nunca
  ter bloqueado a conta que estava sob ataque.

Ele continua ligado como defesa em profundidade — as duas coisas são
complementares, não alternativas.

**Edge Function + tabela no Postgres — adotado.** É o único desenho em que o
contador é por conta e inviolável pelo client:

- `public.login_attempts` tem RLS ligado e **zero policies** → deny-all para
  `anon` e `authenticated`.
- As RPCs (`login_lock_status`, `register_failed_login`, `clear_failed_logins`)
  têm `EXECUTE` revogado de `anon`/`authenticated`, concedido só a
  `service_role`.
- A Edge Function `auth-login` é o único portador da `service_role`, que nunca
  chega ao dispositivo.

Custo aceito: o login passa a ter um hop extra, e o rate limit por IP do GoTrue
passa a ver o IP da Edge Function em vez do IP do aluno — o que aqui é até
desejável, dado o problema do NAT.

### Fluxo

```
app  ──POST /functions/v1/auth-login──▶  Edge Function (service_role)
                                          │
                                          ├─ is_institutional_email?  não → 400
                                          ├─ login_lock_status?    bloqueado → 423
                                          ├─ signInWithPassword (anon)
                                          │    erro → register_failed_login
                                          │            3ª falha → 423 (15 min)
                                          │            senão   → 401 + attempts_left
                                          └─ ok → clear_failed_logins → 200 + session
```

O app instala a sessão devolvida com `supabase.auth.setSession`, e daí em diante
o refresh automático do SDK funciona normalmente.

### Parâmetros

| Parâmetro | Valor | Onde |
|---|---|---|
| Tentativas até bloquear | 3 | `MAX_ATTEMPTS` em `auth-login/index.ts` |
| Duração do bloqueio | 15 min | `LOCK_MINUTES` em `auth-login/index.ts` |

Ambos são passados às RPCs como argumento — o banco não os fixa, então mudar a
política não exige migration.

Após o bloqueio expirar, a próxima falha reinicia o ciclo em 1 (não em 4). Um
login bem-sucedido apaga a linha.

### Critério: login válido redireciona para a Home

O redirecionamento **não** está na tela de login. `signIn` instala a sessão, o
`AuthProvider` emite o novo estado e o layout de `(auth)/` redireciona para
`/home`. Um único caminho de navegação por sessão, que vale também para quem
reabre o app já autenticado.

### Decisões de segurança acessórias

- **Mensagem genérica de credencial.** "E-mail ou senha incorretos" não
  distingue conta inexistente de senha errada — evita enumerar quem tem conta.
- **Tentativas contadas mesmo para e-mails sem conta.** Se só contássemos contas
  reais, o tempo de resposta viraria um oráculo de existência.
- **`email_not_confirmed` não consome tentativa.** A senha estava certa; não é
  chute. Isso revela que a conta existe, mas é o comportamento padrão do GoTrue
  e o ganho de UX ("confirme seu e-mail") compensa.
- **`verify_jwt = false`** na Edge Function: é o endpoint de login, o JWT ainda
  não existe. O que protege o endpoint é o próprio bloqueio por e-mail.

## Esquema do banco

Migrations em `supabase/migrations/`, aplicadas em ordem.

### `public.allowed_email_domains`

| Coluna | Tipo | Nota |
|---|---|---|
| `domain` | `text` PK | normalizado, minúsculo |
| `label` | `text` | nome da instituição |
| `include_subdomains` | `boolean` | `false` por padrão |
| `is_active` | `boolean` | desativar sem apagar histórico |

RLS: `SELECT` liberado para `anon`/`authenticated` (dados públicos, o app monta
mensagens com eles). Sem `INSERT`/`UPDATE`/`DELETE` — só `service_role`.

### `public.login_attempts`

| Coluna | Tipo | Nota |
|---|---|---|
| `email` | `text` PK | normalizado |
| `failed_count` | `integer` | reinicia em 1 após bloqueio expirar |
| `locked_until` | `timestamptz` | `NULL` = liberado |
| `last_failed_at` | `timestamptz` | auditoria |

RLS: ligado, **sem policies** (deny-all). O lint `rls_enabled_no_policy` do
Supabase aponta isso como INFO — é intencional, não um esquecimento.

### `public.profiles`

`id` (FK para `auth.users`, `on delete cascade`), `email`, `full_name`.
Deliberadamente mínima: só o que o cadastro coleta. Foto, curso, campus e dados
do veículo são EP02 e entram em migration própria.

RLS: cada usuário lê e atualiza apenas a própria linha. Sem policy de `INSERT` —
a linha nasce pelo trigger.

### Funções

| Função | Papel |
|---|---|
| `email_domain(text)` | normaliza o domínio |
| `is_institutional_email(text)` | predicado de vínculo — `service_role` |
| `enforce_institutional_email()` | trigger `BEFORE INSERT` em `auth.users` |
| `handle_new_user()` | trigger `AFTER INSERT` → cria `profiles` |
| `login_lock_status(text)` | consulta bloqueio, sem efeito colateral |
| `register_failed_login(text, int, int)` | incrementa e bloqueia |
| `clear_failed_logins(text)` | zera no login bem-sucedido |

## Configuração fora das migrations

Migrations cobrem schema, não settings de Auth. Os itens 1 e 2 abaixo estão
declarados em `supabase/config.toml` e podem ser aplicados com:

```bash
npx supabase config push
```

Se preferirem pelo dashboard, é o equivalente a:

1. **Authentication → Providers → Email → Confirm email: ativado.** Sem isso o
   `signUp` já devolve sessão e o critério do link de confirmação não se cumpre.
2. **Authentication → URL Configuration → Redirect URLs:** incluir o scheme do
   app (`caronauni://`) para o link de confirmação reabrir o app.
3. **SMTP próprio** — este **não** está no `config.toml`, porque exige
   credenciais que não podem ser versionadas. Configurar antes de qualquer
   teste com a turma: o SMTP padrão do Supabase tem limite baixo (poucos
   e-mails por hora) e só entrega para endereços da equipe do projeto.

## Como verificar os critérios de aceite

`SERVICE_URL` = `https://<ref>.supabase.co`, `KEY` = publishable key.

**Cadastro fora do domínio é bloqueado (camada de servidor):**

```bash
curl -s -X POST "$SERVICE_URL/auth/v1/signup" -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"email":"teste@gmail.com","password":"SenhaForte123!"}'
```

Esperado: erro `institutional_email_required`, nenhum usuário criado, nenhum
e-mail enviado.

**Bloqueio após 3 tentativas:**

```bash
for i in 1 2 3 4; do curl -s -w " [HTTP %{http_code}]\n" -X POST "$SERVICE_URL/functions/v1/auth-login" -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"email":"alguem@pucsp.edu.br","password":"errada"}'; done
```

Esperado: 401 com `attempts_left: 2`, 401 com `attempts_left: 1`, 423, 423.

**Validação do client (sem rede):**

```bash
npm test
```

## Fora do escopo (Fase 2)

Recuperação de senha, SSO institucional (SAML), verificação por documento e
desbloqueio manual pela coordenação. O SSO tem impacto de arquitetura: o
`sso_providers` do Supabase valida o domínio no próprio IdP, o que tornaria o
trigger redundante para esse caminho de login.
