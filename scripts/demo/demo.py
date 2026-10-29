"""Cenário de demonstração do UniRota: seed, limpeza e reinício.

    python scripts/demo/demo.py reset      # limpa e recria (antes de cada gravação)
    python scripts/demo/demo.py seed       # cria/restaura o cenário (idempotente)
    python scripts/demo/demo.py cleanup    # apaga só os dados de teste
    python scripts/demo/demo.py avatars    # só envia as fotos (depois de colar o SQL à mão)
    python scripts/demo/demo.py datas      # mostra data e hora das caronas do cenário
    python scripts/demo/demo.py pedir admin A D   # Carla pede vaga nas caronas A e D
                                                  # ("por outro aparelho", roteiro manual)

Só biblioteca padrão do Python 3.9+. Nenhuma chave vai para arquivo:

* As FOTOS são enviadas com o token da própria conta de teste (login por
  senha com a publishable key, que é pública e já está no .env do app). A
  policy do bucket `avatars` deixa cada um escrever na própria pasta, então
  não é preciso service_role.
* O SQL (seed.sql / cleanup.sql) roda por um destes caminhos, nesta ordem:
    1. SUPABASE_DB_URL definido e `psql` no PATH → psql (Supabase local:
       postgresql://postgres:postgres@127.0.0.1:54322/postgres);
    2. SUPABASE_ACCESS_TOKEN definido (token pessoal do dashboard, Account →
       Access Tokens) → Management API do projeto SUPABASE_PROJECT_REF
       (padrão: scfazxgfzcvjfxtckqic);
    3. nenhum dos dois → o script mostra qual arquivo colar no SQL Editor e
       para; depois de colar, rode `demo.py avatars`.
  Defina essas variáveis só na sessão do terminal, nunca em arquivo versionado.

ATENÇÃO: com SUPABASE_ACCESS_TOKEN o alvo é o projeto remoto. Rodar seed lá
cria 4 contas @exemplo.test e a linha DEMO em allowed_email_domains; cleanup
desfaz tudo e devolve as tolerâncias a 2 km / 30 min.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

PASSWORD = "DemoUniRota2026!"
ACCOUNTS = {
    "motorista": ("de0de000-0000-4000-8000-000000000001", "teste.motorista@exemplo.test"),
    "passageira": ("de0de000-0000-4000-8000-000000000002", "teste.passageira@exemplo.test"),
    "passageiro": ("de0de000-0000-4000-8000-000000000003", "teste.passageiro@exemplo.test"),
    "admin": ("de0de000-0000-4000-8000-000000000004", "teste.admin@exemplo.test"),
}
AVATAR_OBJECT = "avatar-demo.png"
ROUTES = {
    "A": "de0de000-0000-4000-8000-0000000000a1",  # MASP → PUC Perdizes (aparece na busca)
    "B": "de0de000-0000-4000-8000-0000000000a2",  # Praça da Sé → PUC Perdizes (fora do raio de 2 km)
    "C": "de0de000-0000-4000-8000-0000000000a3",  # Rua Augusta → PUC Consolação (para cancelar)
    "D": "de0de000-0000-4000-8000-0000000000a4",  # Estação Santana → PUC Perdizes (para recusar)
}


def read_env() -> dict[str, str]:
    """Lê o .env do app (URL e publishable key, ambas públicas)."""
    env: dict[str, str] = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    env.update({k: v for k, v in os.environ.items() if k.startswith("EXPO_PUBLIC_")})
    if not env.get("EXPO_PUBLIC_SUPABASE_URL") or not env.get("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"):
        sys.exit("Faltam EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.")
    return env


def http(method: str, url: str, headers: dict[str, str], body: bytes | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


# --- SQL -------------------------------------------------------------------

def run_sql(file_name: str) -> bool:
    """Roda um .sql deste diretório. Devolve False se ficou para o usuário colar."""
    sql_path = HERE / file_name
    sql = sql_path.read_text(encoding="utf-8")

    db_url = os.environ.get("SUPABASE_DB_URL")
    if db_url and shutil.which("psql"):
        print(f"→ {file_name} via psql")
        subprocess.run(["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", str(sql_path)], check=True)
        return True

    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if token:
        ref = os.environ.get("SUPABASE_PROJECT_REF", "scfazxgfzcvjfxtckqic")
        print(f"→ {file_name} via Management API (projeto {ref})")
        status, raw = http(
            "POST",
            f"https://api.supabase.com/v1/projects/{ref}/database/query",
            {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json.dumps({"query": sql}).encode("utf-8"),
        )
        if status >= 300:
            sys.exit(f"Falhou ({status}): {raw.decode('utf-8', 'replace')[:500]}")
        print("  ", raw.decode("utf-8", "replace")[:400])
        return True

    print(
        f"\nSem SUPABASE_DB_URL+psql nem SUPABASE_ACCESS_TOKEN: cole o conteúdo de\n"
        f"  {sql_path.relative_to(ROOT)}\n"
        f"no SQL Editor do Supabase e rode. Depois: python scripts/demo/demo.py avatars\n"
    )
    return False


# --- Storage (fotos) -------------------------------------------------------

def login(env: dict[str, str], email: str) -> dict:
    status, raw = http(
        "POST",
        f"{env['EXPO_PUBLIC_SUPABASE_URL']}/auth/v1/token?grant_type=password",
        {"apikey": env["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], "Content-Type": "application/json"},
        json.dumps({"email": email, "password": PASSWORD}).encode("utf-8"),
    )
    if status != 200:
        raise RuntimeError(f"login de {email} falhou ({status}): {raw[:200]!r}")
    return json.loads(raw)


def upload_avatars(env: dict[str, str]) -> None:
    for name, (uid, email) in ACCOUNTS.items():
        token = login(env, email)["access_token"]
        data = (HERE / "avatars" / f"{name}.png").read_bytes()
        status, raw = http(
            "POST",
            f"{env['EXPO_PUBLIC_SUPABASE_URL']}/storage/v1/object/avatars/{uid}/{AVATAR_OBJECT}",
            {
                "apikey": env["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
                "Authorization": f"Bearer {token}",
                "Content-Type": "image/png",
                "x-upsert": "true",
            },
            data,
        )
        if status >= 300:
            raise RuntimeError(f"foto de {email} falhou ({status}): {raw[:200]!r}")
        print(f"   foto ok: {email}")


def delete_avatars(env: dict[str, str]) -> None:
    """Apaga as fotos enquanto as contas ainda existem (precisa do token delas)."""
    for name, (uid, email) in ACCOUNTS.items():
        try:
            token = login(env, email)["access_token"]
        except RuntimeError:
            print(f"   {email}: conta já não existe, foto (se houver) fica órfã")
            continue
        status, _ = http(
            "DELETE",
            f"{env['EXPO_PUBLIC_SUPABASE_URL']}/storage/v1/object/avatars/{uid}/{AVATAR_OBJECT}",
            {"apikey": env["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], "Authorization": f"Bearer {token}"},
        )
        print(f"   foto removida: {email}" if status < 300 else f"   {email}: sem foto ({status})")


# --- Ações de apoio ao roteiro -------------------------------------------

def rest(env: dict[str, str], method: str, path: str, token: str, body: dict | None = None):
    status, raw = http(
        method,
        f"{env['EXPO_PUBLIC_SUPABASE_URL']}{path}",
        {
            "apikey": env["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json.dumps(body).encode("utf-8") if body is not None else None,
    )
    return status, json.loads(raw) if raw else None


def cmd_datas(env: dict[str, str]) -> None:
    """Data/hora de cada carona do cenário (horário de São Paulo), para digitar na busca."""
    from datetime import datetime, timedelta, timezone
    token = login(env, ACCOUNTS["motorista"][1])["access_token"]
    ids = ",".join(ROUTES.values())
    status, rows = rest(env, "GET", f"/rest/v1/routes?id=in.({ids})&select=id,origin_label,departure_at,status", token)
    if status != 200:
        sys.exit(f"Não consegui ler as caronas ({status}). Rode o seed antes.")
    letter = {v: k for k, v in ROUTES.items()}
    sp = timezone(timedelta(hours=-3))  # São Paulo, sem horário de verão
    for row in sorted(rows, key=lambda r: letter[r["id"]]):
        when = datetime.fromisoformat(row["departure_at"]).astimezone(sp)
        print(f"   {letter[row['id']]}  {when:%d/%m/%Y %H:%M}  {row['status']:<10} {row['origin_label']}")


def cmd_pedir(env: dict[str, str], who: str, letters: list[str]) -> None:
    """Uma conta de teste pede vaga, como se fosse pelo celular dela (RPC request_seat)."""
    if who not in ACCOUNTS or not letters or any(l.upper() not in ROUTES for l in letters):
        sys.exit("Uso: demo.py pedir <motorista|passageira|passageiro|admin> <A|B|C|D> [...]")
    token = login(env, ACCOUNTS[who][1])["access_token"]
    for l in letters:
        status, body = rest(env, "POST", "/rest/v1/rpc/request_seat", token, {"p_route_id": ROUTES[l.upper()]})
        detail = body.get("message") if isinstance(body, dict) else ""
        print(f"   {who} pediu vaga na carona {l.upper()}: " + ("ok" if status < 300 else f"recusado ({status}) {detail}"))


# --- Comandos --------------------------------------------------------------

def cmd_seed(env: dict[str, str]) -> None:
    if run_sql("seed.sql"):
        upload_avatars(env)
        cmd_datas(env)


def cmd_cleanup(env: dict[str, str]) -> None:
    delete_avatars(env)
    run_sql("cleanup.sql")


def cmd_reset(env: dict[str, str]) -> None:
    # Limpar e recriar dá ids e datas novas, sem resto de ensaios anteriores.
    # As fotos ficam (mesmo caminho, sobrescritas no upload).
    if run_sql("cleanup.sql"):
        cmd_seed(env)


def main() -> None:
    commands = {
        "seed": cmd_seed,
        "cleanup": cmd_cleanup,
        "reset": cmd_reset,
        "avatars": upload_avatars,
        "datas": cmd_datas,
    }
    if len(sys.argv) >= 4 and sys.argv[1] == "pedir":
        cmd_pedir(read_env(), sys.argv[2], sys.argv[3:])
        return
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]](read_env())
    print("pronto.")


if __name__ == "__main__":
    main()
