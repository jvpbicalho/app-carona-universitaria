"""Grava o vídeo de demonstração do UniRota (versão WEB) com Playwright.

Pré-requisitos (nada é instalado por este script):
  * Python 3.9+ com `playwright` e o Chromium dele já baixado;
  * build web do app:  npx expo export --platform web   (gera dist/, fora do git);
  * cenário reiniciado:  python scripts/demo/demo.py reset  (ou seed.sql + avatars).

    python scripts/demo/video/record.py [--dist dist] [--out docs/demo/unirota-demo.webm]

Como funciona
  * Um servidor HTTP local serve o build em http://localhost:8765 e
    http://127.0.0.1:8765. São duas ORIGENS diferentes, logo dois
    localStorage, logo duas sessões: o celular da esquerda (motorista) e o da
    direita (passageiros/admin) ficam lado a lado numa página "palco", e o
    vídeo mostra o aviso em tempo real chegando de um lado quando o outro age.
  * Títulos de cena e legendas são HTML do palco (sem ffmpeg).
  * Nada de chave na tela: não há barra de endereço nem console no vídeo. O
    script só usa a publishable key (pública, do .env) e as senhas das contas
    de teste.
  * O cadastro de conta nova tem a resposta do /auth/v1/signup SIMULADA só
    nesta gravação (nenhuma conta é criada, nenhum e-mail sai). A validação
    do formulário e a tela "Confirme seu e-mail" são as reais. A legenda diz
    isso na tela.
  * Cena que falha é marcada no vídeo e no relatório (docs/demo/relatorio-gravacao.json);
    as seguintes continuam.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import sys
import threading
import time
import traceback
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import Frame, Page, TimeoutError as PWTimeout, sync_playwright

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "demo"))
from demo import ACCOUNTS, PASSWORD, read_env  # noqa: E402

PORT = 8765
LEFT_ORIGIN = f"http://localhost:{PORT}"
RIGHT_ORIGIN = f"http://127.0.0.1:{PORT}"
SP = ZoneInfo("America/Sao_Paulo")
PHONE_W, PHONE_H = 390, 760
STAGE_W, STAGE_H = 880, 940

ROUTE_A = "de0de000-0000-4000-8000-0000000000a1"
ROUTE_B = "de0de000-0000-4000-8000-0000000000a2"
ROUTE_D = "de0de000-0000-4000-8000-0000000000a4"
NAMES = {
    "motorista": "Davi · motorista",
    "passageira": "Ana · passageira",
    "passageiro": "Bruno · passageiro",
    "admin": "Carla · admin (e passageira)",
}

# Ritmo: pausas para quem assiste conseguir ler.
READ = 2.2
SHORT = 1.0


# ---------------------------------------------------------------------------
# Servidor do build web (SPA: rota desconhecida → index.html)
# ---------------------------------------------------------------------------

class SpaHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # silencioso
        pass

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if not path.exists() or (path.is_dir() and not (path / "index.html").exists()):
            self.path = "/index.html"
        return super().send_head()


def serve(dist: Path) -> http.server.ThreadingHTTPServer:
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(SpaHandler, directory=str(dist)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ---------------------------------------------------------------------------
# API (fora da tela): sessão das contas de teste e ações "de outro aparelho"
# ---------------------------------------------------------------------------

class Api:
    def __init__(self) -> None:
        env = read_env()
        self.url = env["EXPO_PUBLIC_SUPABASE_URL"]
        self.key = env["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
        self.ref = self.url.split("//")[1].split(".")[0]

    def _call(self, method: str, path: str, token: str | None = None, body: dict | None = None):
        headers = {"apikey": self.key, "Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(
            self.url + path, method=method, headers=headers,
            data=json.dumps(body).encode() if body is not None else None,
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read() or b"null")

    def session(self, who: str) -> dict:
        status, data = self._call("POST", "/auth/v1/token?grant_type=password",
                                  body={"email": ACCOUNTS[who][1], "password": PASSWORD})
        if status != 200:
            raise RuntimeError(f"login de {who} falhou ({status})")
        data.setdefault("expires_at", int(time.time()) + int(data.get("expires_in", 3600)))
        return data

    def request_seat(self, who: str, route_id: str):
        token = self.session(who)["access_token"]
        return self._call("POST", "/rest/v1/rpc/request_seat", token, {"p_route_id": route_id})

    def departure(self, route_id: str) -> datetime:
        token = self.session("motorista")["access_token"]
        status, rows = self._call("GET", f"/rest/v1/routes?id=eq.{route_id}&select=departure_at", token)
        if status != 200 or not rows:
            raise RuntimeError("carona A do seed não encontrada — rode demo.py reset antes")
        return datetime.fromisoformat(rows[0]["departure_at"]).astimezone(SP)


# ---------------------------------------------------------------------------
# Palco
# ---------------------------------------------------------------------------

STAGE_HTML = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { --ink:#141414; --paper:#fff; --light:#F2F2F2; --mid:#8E8E8E; --support:#6B6B6B; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--light); font-family:Inter, system-ui, sans-serif; color:var(--ink);
         width:%(W)dpx; height:%(H)dpx; overflow:hidden; }
  header { height:120px; background:var(--ink); color:var(--paper); padding:16px 28px; }
  #scene { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:#BDBDBD; }
  #caption { font-size:21px; font-weight:500; margin-top:6px; line-height:1.3; }
  #sub { font-size:15px; color:#D6D6D6; margin-top:4px; line-height:1.35; }
  main { display:flex; gap:44px; justify-content:center; padding-top:14px; }
  .phone { width:%(PW)dpx; }
  .label { font-size:14px; font-weight:500; margin:0 0 6px 4px; }
  iframe { width:%(PW)dpx; height:%(PH)dpx; border:1px solid var(--mid); border-radius:18px; background:var(--paper); display:block; }
  .phone.active iframe { border:2px solid var(--ink); }
  #card { position:fixed; inset:0; background:var(--ink); color:var(--paper); display:none;
          flex-direction:column; justify-content:center; padding:0 80px; }
  #card .n { font-size:16px; color:#BDBDBD; letter-spacing:.1em; text-transform:uppercase; }
  #card .t { font-size:44px; font-weight:500; margin-top:14px; line-height:1.15; }
  #card .d { font-size:20px; color:#D6D6D6; margin-top:18px; line-height:1.45; max-width:680px; }
  #card .brand { position:absolute; bottom:48px; left:80px; font-size:18px; font-weight:500; }
  .warn { color:var(--paper); background:#8A3A3A; padding:2px 8px; border-radius:4px; }
</style></head><body>
<header><div id="scene"></div><div id="caption"></div><div id="sub"></div></header>
<main>
  <div class="phone" id="pl"><div class="label" id="ll"></div><iframe id="L" src="%(LEFT)s/sign-in"></iframe></div>
  <div class="phone" id="pr"><div class="label" id="lr"></div><iframe id="R" src="%(RIGHT)s/sign-in"></iframe></div>
</main>
<div id="card"><div class="n"></div><div class="t"></div><div class="d"></div><div class="brand">UniRota · demonstração</div></div>
</body></html>""" % {"W": STAGE_W, "H": STAGE_H, "PW": PHONE_W, "PH": PHONE_H, "LEFT": LEFT_ORIGIN, "RIGHT": RIGHT_ORIGIN}


class Stage:
    def __init__(self, page: Page, api: Api) -> None:
        self.page = page
        self.api = api
        self.failures: list[dict] = []
        self.scene_name = ""
        self.last_click = time.perf_counter()

    # --- quadros do palco ---
    def frame(self, side: str) -> Frame:
        frame = self.page.locator(f"#{side}").element_handle().content_frame()
        assert frame is not None
        return frame

    @property
    def L(self) -> Frame:
        return self.frame("L")

    @property
    def R(self) -> Frame:
        return self.frame("R")

    def caption(self, text: str, sub: str = "", pause: float = READ) -> None:
        self.page.evaluate(
            "([t, s]) => { document.getElementById('caption').textContent = t;"
            " document.getElementById('sub').textContent = s; }",
            [text, sub],
        )
        time.sleep(pause)

    def labels(self, left: str, right: str) -> None:
        self.page.evaluate(
            "([l, r]) => { document.getElementById('ll').textContent = l;"
            " document.getElementById('lr').textContent = r; }",
            [left, right],
        )

    def focus(self, side: str | None) -> None:
        self.page.evaluate(
            "(s) => { for (const id of ['pl','pr']) document.getElementById(id).classList.toggle('active', s !== null && id === (s === 'L' ? 'pl' : 'pr')); }",
            side,
        )

    def card(self, number: str, title: str, desc: str, secs: float = 3.6) -> None:
        self.page.evaluate(
            "([n, t, d]) => { const c = document.getElementById('card'); c.querySelector('.n').textContent = n;"
            " c.querySelector('.t').textContent = t; c.querySelector('.d').textContent = d; c.style.display = 'flex'; }",
            [number, title, desc],
        )
        time.sleep(secs)
        self.page.evaluate("() => { document.getElementById('card').style.display = 'none'; }")

    def scene(self, n: int, title: str, desc: str) -> None:
        self.scene_name = f"Cena {n} — {title}"
        self.page.evaluate(
            "(t) => { document.getElementById('scene').textContent = t;"
            " document.getElementById('caption').textContent = ''; document.getElementById('sub').textContent = ''; }",
            self.scene_name,
        )
        self.card(f"Cena {n} de 8", title, desc)

    # --- ações dentro de um celular ---
    def _mark(self, loc) -> None:
        try:
            loc.scroll_into_view_if_needed(timeout=4000)
            loc.evaluate(
                "el => { const o = el.style.outline; el.style.outline = '3px solid #8E8E8E';"
                " el.style.outlineOffset = '3px'; setTimeout(() => { el.style.outline = o; }, 900); }"
            )
            time.sleep(0.7)
        except Exception:
            pass

    def tap(self, frame: Frame, name: str, *, role: str = "button", exact: bool = True, last: bool = False,
            timeout: float = 15000) -> None:
        loc = frame.get_by_role(role, name=name, exact=exact)
        loc = loc.last if last else loc.first
        loc.wait_for(state="visible", timeout=timeout)
        self._mark(loc)
        loc.click()
        self.last_click = time.perf_counter()
        time.sleep(SHORT)

    def tap_text(self, frame: Frame, text: str, timeout: float = 15000) -> None:
        loc = frame.get_by_text(text, exact=False).first
        loc.wait_for(state="visible", timeout=timeout)
        self._mark(loc)
        loc.click()
        time.sleep(SHORT)

    def type_into(self, frame: Frame, label: str, text: str, role: str = "textbox") -> None:
        loc = frame.get_by_role(role, name=label, exact=True).first
        loc.wait_for(state="visible", timeout=15000)
        self._mark(loc)
        loc.click()
        loc.press_sequentially(text, delay=55)
        time.sleep(0.5)

    def wait_text(self, frame: Frame, text: str, timeout: float = 20000) -> float:
        start = time.perf_counter()
        frame.get_by_text(text, exact=False).first.wait_for(state="visible", timeout=timeout)
        return time.perf_counter() - start

    def address(self, frame: Frame, label: str, query: str, pick: str) -> None:
        self.type_into(frame, label, query)
        self.tap_text(frame, pick, timeout=25000)

    def set_date_time(self, frame: Frame, when: datetime) -> None:
        frame.locator('input[type="date"]').first.fill(when.strftime("%Y-%m-%d"), force=True)
        time.sleep(0.6)
        frame.locator('input[type="time"]').first.fill(when.strftime("%H:%M"), force=True)
        time.sleep(0.8)

    def back(self, frame: Frame) -> None:
        self.caption("", "", 0)
        self.tap(frame, "Voltar", exact=False)

    def goto(self, frame: Frame, origin: str, path: str) -> None:
        frame.goto(origin + path)
        time.sleep(1.5)

    def login_ui(self, frame: Frame, who: str) -> None:
        self.type_into(frame, "E-mail institucional", ACCOUNTS[who][1])
        self.type_into(frame, "Senha", PASSWORD)
        self.tap(frame, "Entrar")
        self.wait_text(frame, "Minhas caronas", timeout=30000)

    def home(self, frame: Frame) -> None:
        """Volta à tela inicial (recomeço seguro de cada cena)."""
        origin = LEFT_ORIGIN if frame.url.startswith(LEFT_ORIGIN) else RIGHT_ORIGIN
        if not frame.url.endswith("/home"):
            frame.goto(origin + "/home")
        self.wait_text(frame, "Minhas caronas", timeout=30000)
        time.sleep(0.8)

    def switch_account(self, side: str, who: str) -> None:
        """Troca a conta de um celular sem digitar: grava a sessão e recarrega.
        O token não aparece em lugar nenhum da tela."""
        frame = self.frame(side)
        origin = LEFT_ORIGIN if side == "L" else RIGHT_ORIGIN
        session = self.api.session(who)
        frame.evaluate(
            "([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }",
            [f"sb-{self.api.ref}-auth-token", json.dumps(session)],
        )
        frame.goto(origin + "/home")
        self.wait_text(frame, "Minhas caronas", timeout=30000)
        time.sleep(1.0)

    def search(self, frame: Frame, when: datetime) -> None:
        self.tap(frame, "Buscar carona")
        self.address(frame, "Saindo de", "avenida paulista 900", "Cásper Líbero")
        self.tap(frame, "Ir para o meu campus: Perdizes (Monte Alegre)", exact=False)
        self.set_date_time(frame, when)
        self.tap(frame, "Buscar caronas")
        time.sleep(2.0)

    # --- falhas ---
    def fail(self, err: BaseException) -> None:
        msg = f"{type(err).__name__}: {str(err).splitlines()[0][:180]}"
        self.failures.append({"cena": self.scene_name, "erro": msg})
        shot = ROOT / "docs" / "demo" / f"falha-{len(self.failures)}.png"
        try:
            self.page.screenshot(path=str(shot))
        except Exception:
            pass
        print(f"!! {self.scene_name}: {msg}")
        traceback.print_exc()
        try:
            self.page.evaluate(
                "(m) => { document.getElementById('caption').innerHTML = '<span class=warn>Falha nesta cena</span>';"
                " document.getElementById('sub').textContent = m; }",
                msg,
            )
            time.sleep(4)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Cenas
# ---------------------------------------------------------------------------

def fake_signup(route) -> None:
    """Resposta simulada do cadastro: só nesta gravação, nenhuma conta é criada."""
    cors = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "POST, OPTIONS",
    }
    if route.request.method == "OPTIONS":
        route.fulfill(status=204, headers=cors)
        return
    now = datetime.utcnow().isoformat() + "Z"
    body = json.loads(route.request.post_data or "{}")
    route.fulfill(
        status=200,
        headers={**cors, "content-type": "application/json"},
        body=json.dumps({
            "id": "00000000-0000-4000-8000-00000000dem0".replace("dem0", "0000"),
            "aud": "authenticated", "role": "authenticated",
            "email": body.get("email", ""), "phone": "",
            "confirmation_sent_at": now, "app_metadata": {"provider": "email", "providers": ["email"]},
            "user_metadata": body.get("data", {}),
            "identities": [{"identity_id": "x", "id": "x", "user_id": "x", "provider": "email"}],
            "created_at": now, "updated_at": now, "is_anonymous": False,
        }),
    )


def scene1(st: Stage) -> None:
    st.scene(1, "Cadastro e login", "Conta nova com e-mail institucional até “Confirme seu e-mail”, e login com conta pronta.")
    L, R = st.L, st.R
    st.labels("Visitante (conta nova)", "")
    st.focus("L")
    st.caption("Cadastro: só e-mail institucional @pucsp.edu.br",
               "Nesta gravação o envio do cadastro é simulado: nenhuma conta é criada e nenhum e-mail sai.", SHORT)
    st.tap(L, "Criar conta", role="link")
    st.type_into(L, "Nome completo", "Conta Nova Demo")
    st.type_into(L, "E-mail institucional", "conta.nova@gmail.com")
    st.type_into(L, "Senha", "DemoUniRota2026!")
    st.tap(L, "Criar conta")
    st.caption("E-mail fora do domínio é barrado antes de qualquer envio", "", READ + 0.6)
    email = L.get_by_role("textbox", name="E-mail institucional", exact=True)
    email.fill("")
    st.type_into(L, "E-mail institucional", "conta.nova.demo@pucsp.edu.br")
    st.tap(L, "Criar conta")
    st.wait_text(L, "Confirme seu e-mail")
    st.caption("Tela “Confirme seu e-mail”", "O link de confirmação iria para a caixa institucional.", READ + 0.8)

    st.tap(L, "Ir para o login")
    st.caption("Recuperar senha: não existe no app",
               "Fica para a Fase 2. Não há link nem tela de “esqueci a senha” no login.", READ + 1.2)
    st.labels(NAMES["motorista"], NAMES["passageira"])
    st.caption("Login com conta pronta (já confirmada)", "", SHORT)
    st.login_ui(L, "motorista")
    st.focus("R")
    st.login_ui(R, "passageira")
    st.caption("Os dois entraram", "Davi (motorista) à esquerda, Ana (passageira) à direita.", READ)


def scene2(st: Stage) -> None:
    st.scene(2, "Perfil e veículo", "Perfil completo — foto, curso e campus — e o veículo do motorista com 2 vagas.")
    L, R = st.L, st.R
    st.home(L)
    st.home(R)
    st.focus("L")
    st.tap(L, "Meu perfil")
    st.caption("Perfil completo", "Nome, foto, curso e campus são obrigatórios.", READ)
    st.tap(L, "Dados pessoais", exact=False)
    st.caption("Dados pessoais", "Foto de teste genérica, sem pessoa real.", READ)
    st.back(L)
    st.tap(L, "Meu veículo", exact=False)
    st.caption("Veículo: modelo, cor, placa e vagas", "As vagas do carro (2) são o teto de cada carona.", READ + 0.6)
    st.back(L)
    st.focus("R")
    st.tap(R, "Meu perfil")
    st.caption("Perfil da passageira", "Sem veículo salvo, o modo motorista fica indisponível.", READ)


def scene3(st: Stage, when_a: datetime) -> None:
    st.scene(3, "Motorista publica, edita e cancela", "Cadastrar uma carona, mudar o horário, e cancelar outra com motivo.")
    L = st.L
    st.home(L)
    st.focus("L")
    new_when = (when_a + timedelta(days=3)).replace(hour=19, minute=0)
    st.tap(L, "Publicar carona")
    st.address(L, "Origem", "avenida paulista 900", "Cásper Líbero")
    st.tap(L, "Usar meu campus como destino", exact=False)
    st.set_date_time(L, new_when)
    st.caption("Endereço pela busca (geocodificação), destino pelo atalho do campus", "", READ)
    st.tap(L, "Publicar carona", last=True)
    st.wait_text(L, "Rua Augusta, 1500")
    st.caption("Carona publicada: aparece em Minhas caronas", f"{new_when:%d/%m} às 19:00.", READ)

    st.tap_text(L, "Cásper Líbero")
    st.tap(L, "Editar carona")
    L.locator('input[type="time"]').first.fill("19:30", force=True)
    time.sleep(0.8)
    st.caption("Editar: origem, destino, data e horário", "Vagas e observações não são editáveis (decisão do EP03).", READ)
    st.tap(L, "Salvar alteração")
    # Sem passageiro aceito, salva direto; com aceitos, pede "Salvar e avisar".
    st.wait_text(L, "19:30")
    st.caption("Horário alterado para 19:30", "Passageiros aceitos seriam avisados.", READ)

    st.back(L)
    st.tap_text(L, "Rua Augusta, 1500")
    st.tap(L, "Cancelar carona")
    st.tap(L, "Motivo")
    st.tap_text(L, "Mudança de compromisso ou horário")
    st.caption("Cancelar exige motivo", "O motivo vai no aviso aos passageiros aceitos.", READ)
    st.tap(L, "Cancelar carona", last=True)
    time.sleep(2.0)
    st.caption("Carona cancelada", "Cancelar é definitivo; a carona sai da busca.", READ)
    st.goto(L, LEFT_ORIGIN, "/home")


def scene4(st: Stage, when_a: datetime) -> None:
    st.scene(4, "Busca com tolerância", "Perto da Av. Paulista para a PUC Perdizes: raio de 2 km e janela de ± 30 min.")
    R = st.R
    st.home(R)
    st.focus("R")
    st.search(R, when_a)
    st.wait_text(R, "MASP")
    st.caption("A carona do MASP aparece (a 650 m)",
               "A da Praça da Sé, mesmo horário e destino, fica de fora: a origem está a 2,5 km, fora do raio de 2 km.",
               READ + 2.0)


def scene5(st: Stage) -> None:
    st.scene(5, "Pedido de vaga e badge em tempo real", "A passageira pede vaga; o badge do motorista sobe sem recarregar.")
    L, R = st.L, st.R
    st.home(L)
    st.caption("Davi está na tela inicial, sem pendências", "", SHORT)
    st.focus("R")
    st.tap(R, "Solicitar vaga")
    st.caption("Confirmação antes de pedir", "A vaga só fica garantida quando o motorista aceitar.", SHORT)
    st.tap(R, "Solicitar vaga", last=True)
    st.focus("L")
    st.wait_text(L, "1 solicitação pendente")
    elapsed = time.perf_counter() - st.last_click
    st.caption(f"Badge do motorista: 1 solicitação pendente (em até {elapsed:.1f} s)",
               "Chegou por Realtime (WebSocket), junto com o aviso “Nova solicitação de vaga”.", READ + 1.0)


def scene6(st: Stage) -> None:
    st.scene(6, "Aceite e aviso à passageira", "O motorista aceita; a passageira recebe o aviso na hora.")
    L, R = st.L, st.R
    st.focus("L")
    loc = L.get_by_test_id("pending-requests-badge")
    loc.wait_for(timeout=10000)
    st._mark(loc)
    loc.click()
    st.wait_text(L, "Aceitar")
    st.caption("Pendências desta carona", "Nome, foto, curso e campus de quem pediu.", READ)
    st.tap(L, "Aceitar")
    st.focus("R")
    st.wait_text(R, "Vaga aceita")
    elapsed = time.perf_counter() - st.last_click
    st.caption(f"Ana recebeu “Vaga aceita” (em até {elapsed:.1f} s)", "Fica guardado em Avisos.", READ + 1.0)
    ver = R.get_by_text("Ver", exact=True).first
    st._mark(ver)
    ver.click()
    st.caption("Minhas solicitações", "", READ)


def scene7(st: Stage, when_a: datetime) -> None:
    st.scene(7, "Vagas esgotadas e recusa", "Bruno pede a última vaga; a carona lota, sai da busca e as pendências se encerram.")
    L, R = st.L, st.R
    st.goto(L, LEFT_ORIGIN, "/home")
    st.labels(NAMES["motorista"], NAMES["passageiro"])
    st.focus("R")
    st.switch_account("R", "passageiro")
    st.caption("Agora quem pede é Bruno", "", SHORT)
    st.search(R, when_a)
    st.wait_text(R, "MASP")
    st.caption("Resta 1 vaga", "", SHORT)
    st.tap(R, "Solicitar vaga")
    st.tap(R, "Solicitar vaga", last=True)
    st.wait_text(L, "1 solicitação pendente")

    st.labels(NAMES["motorista"], NAMES["admin"])
    st.switch_account("R", "admin")
    st.search(R, when_a)
    st.wait_text(R, "MASP")
    st.caption("Carla abre a mesma busca: ainda mostra 1 vaga",
               "Pedido pendente não reserva vaga. Ao mesmo tempo, Carla pede vaga por outro aparelho (feito pela API).",
               SHORT)
    for route in (ROUTE_A, ROUTE_D):
        status, body = st.api.request_seat("admin", route)
        if status >= 300:
            raise RuntimeError(f"request_seat de Carla falhou ({status}): {body}")
    st.focus("L")
    st.wait_text(L, "3 solicitações pendentes")
    st.caption("Badge: 3 pendências em 2 caronas", "", READ)

    st.tap(L, "Minhas caronas")
    st.tap_text(L, "MASP")
    st.wait_text(L, "Bruno")
    st.caption("Duas pessoas pedem a última vaga", "Davi aceita Bruno.", READ)
    st.tap(L, "Aceitar")
    st.wait_text(L, "Vagas esgotadas")
    st.caption("Vagas esgotadas", "O pedido pendente de Carla foi encerrado na mesma transação (não é “recusada”).", READ + 1.0)

    st.focus("R")
    st.caption("Erro proposital: Carla tenta pedir na tela que ficou aberta", "", SHORT)
    st.tap(R, "Solicitar vaga")
    st.tap(R, "Solicitar vaga", last=True)
    st.wait_text(R, "esgotaram")
    st.caption("Mensagem clara, em português", "“As vagas desta carona se esgotaram. Busque outra carona.”", READ + 1.0)

    st.goto(R, RIGHT_ORIGIN, "/requests")
    st.wait_text(R, "Vagas esgotadas")
    st.caption("Em Minhas solicitações: “Vagas esgotadas”", "A carona lotou antes de o motorista responder.", READ + 0.6)
    st.goto(R, RIGHT_ORIGIN, "/home")
    st.search(R, when_a)
    st.wait_text(R, "Nenhuma", timeout=20000)
    st.caption("A carona lotada sumiu da busca", "E a da Praça da Sé continua fora do raio de 2 km.", READ + 0.6)

    st.focus("L")
    st.back(L)
    st.tap_text(L, "Estação Santana")
    st.wait_text(L, "Recusar")
    st.caption("Agora uma recusa", "Carla também pediu vaga na carona de Santana.", SHORT)
    st.tap(L, "Recusar")
    st.tap(L, "Recusar solicitação")
    st.focus("R")
    st.wait_text(R, "Solicitação recusada")
    elapsed = time.perf_counter() - st.last_click
    st.caption(f"Carla recebeu “Solicitação recusada” (em até {elapsed:.1f} s)", "", READ + 1.0)


def scene8(st: Stage, when_a: datetime) -> None:
    st.scene(8, "Admin muda o raio", "Carla é admin: aumenta o raio de 2 para 5 km e a mesma busca passa a mostrar outra carona.")
    R = st.R
    st.focus("R")
    st.goto(R, RIGHT_ORIGIN, "/home")
    st.tap(R, "Meu perfil")
    st.tap(R, "Regras da busca", exact=False)
    st.caption("Regras da busca (só para admin)", "Raio de 0,5 a 50 km; janela de 5 a 240 min.", READ)
    radius = R.get_by_role("textbox", name="Raio máximo (km)", exact=True)
    radius.fill("")
    st.type_into(R, "Raio máximo (km)", "5")
    st.tap(R, "Salvar alterações")
    time.sleep(2.0)
    st.caption("Raio: 5 km", "Vale na próxima busca, sem publicar app novo.", READ)
    st.goto(R, RIGHT_ORIGIN, "/home")
    st.search(R, when_a)
    st.wait_text(R, "Praça da Sé")
    st.caption("Agora a carona da Praça da Sé aparece", "Origem a 2,5 km: dentro do novo raio de 5 km.", READ + 2.0)


def closing(st: Stage, report: dict) -> None:
    falhas = report["falhas"]
    st.card(
        "Fim",
        "O que o vídeo mostrou",
        "Cadastro institucional, login, perfil, veículo, publicar/editar/cancelar, busca com tolerância, "
        "pedido, aceite, recusa, vagas esgotadas, avisos em tempo real e regras do admin. "
        "Não existem ainda: recuperar senha, avaliação mútua e push nativo."
        + (f" Falharam nesta gravação: {len(falhas)} cena(s)." if falhas else ""),
        6.0,
    )


# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--out", default=str(ROOT / "docs" / "demo" / "unirota-demo.webm"))
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    dist = Path(args.dist)
    if not (dist / "index.html").exists():
        sys.exit(f"Build web não encontrado em {dist}. Rode: npx expo export --platform web")

    api = Api()
    when_a = api.departure(ROUTE_A)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    video_dir = out.parent / "_raw"
    srv = serve(dist)
    report: dict = {"inicio": datetime.now(SP).isoformat(timespec="seconds"), "falhas": [], "cenas": []}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        ctx = browser.new_context(
            viewport={"width": STAGE_W, "height": STAGE_H},
            record_video_dir=str(video_dir),
            record_video_size={"width": STAGE_W, "height": STAGE_H},
            timezone_id="America/Sao_Paulo",
            locale="pt-BR",
        )
        ctx.route("**/auth/v1/signup**", fake_signup)
        page = ctx.new_page()
        page.set_default_timeout(20000)
        page.set_content(STAGE_HTML)
        page.wait_for_load_state("networkidle")
        st = Stage(page, api)
        st.card("UniRota", "Demonstração do MVP", "Versão web, gravada automaticamente com contas de teste. "
                "O app do celular é o mesmo código.", 4.0)

        scenes = [
            lambda: scene1(st), lambda: scene2(st), lambda: scene3(st, when_a), lambda: scene4(st, when_a),
            lambda: scene5(st), lambda: scene6(st), lambda: scene7(st, when_a), lambda: scene8(st, when_a),
        ]
        for i, run in enumerate(scenes, start=1):
            t0 = time.perf_counter()
            try:
                run()
                ok = True
            except (PWTimeout, Exception) as err:  # noqa: BLE001
                st.fail(err)
                ok = False
            report["cenas"].append({"cena": i, "ok": ok, "segundos": round(time.perf_counter() - t0, 1)})
        report["falhas"] = st.failures
        closing(st, report)
        video = page.video
        ctx.close()
        browser.close()
        raw = Path(video.path())
        out.unlink(missing_ok=True)
        raw.replace(out)
        try:
            video_dir.rmdir()
        except OSError:
            pass
    srv.shutdown()

    try:
        report["arquivo"] = out.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        report["arquivo"] = out.name
    report["bytes"] = out.stat().st_size
    (out.parent / "relatorio-gravacao.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
