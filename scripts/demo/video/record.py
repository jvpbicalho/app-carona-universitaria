"""Grava o vídeo de demonstração do UniRota (versão WEB) com Playwright.

Pré-requisitos (nada é instalado por este script):
  * Python 3.9+ com `playwright` e o Chromium dele já baixado;
  * build web do app:  npx expo export --platform web   (gera dist/, fora do git);
  * cenário reiniciado:  python scripts/demo/demo.py reset  (ou seed.sql + avatars);
  * opcional, para mp4 e para o corte curto: ffmpeg com libx264 no PATH
    (ou --ffmpeg <caminho>). Sem ele, sai só o webm.

    python scripts/demo/video/record.py [--dist dist] [--out-dir docs/demo]

Saídas (em --out-dir):
  * unirota-demo-completo.mp4 — o tour inteiro (8 cenas);
  * unirota-demo-pitch.mp4    — corte curto com os momentos-chave, para o pitch;
  * relatorio-gravacao.json   — cenas, falhas, tempos medidos e os trechos do corte.

Como funciona
  * Um servidor HTTP local serve o build em http://localhost:8765 e
    http://127.0.0.1:8765. São duas ORIGENS diferentes, logo dois
    localStorage, logo duas sessões: o celular da esquerda (motorista) e o da
    direita (passageiros/admin) ficam lado a lado numa página "palco" 16:9
    (1920×1080), e o vídeo mostra o aviso em tempo real chegando de um lado
    quando o outro age.
  * Títulos de cena e legendas são HTML do palco. O corte curto é montado pelo
    ffmpeg a partir de marcas de tempo gravadas durante as cenas (Stage.clip).
  * Nada de chave na tela: não há barra de endereço nem console no vídeo. O
    script só usa a publishable key (pública, do .env) e as senhas das contas
    de teste.
  * O cadastro de conta nova tem a resposta do /auth/v1/signup SIMULADA só
    nesta gravação (nenhuma conta é criada, nenhum e-mail sai). A validação
    do formulário e a tela "Confirme seu e-mail" são as reais. A legenda diz
    isso na tela.
  * Cena que falha é marcada no vídeo e no relatório; as seguintes continuam.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import shutil
import subprocess
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

# Palco desenhado em 1600×900 e ampliado 1,2× por `transform` (não `zoom`, que
# desalinha os cliques do Playwright): o vídeo sai em 1920×1080, 16:9, nítido.
# A escala de dispositivo não serve: o vídeo do Playwright grava em pixels CSS.
STAGE_W, STAGE_H = 1600, 900
SCALE = 1.2
VIDEO_W, VIDEO_H = 1920, 1080
PHONE_W, PHONE_H = 390, 800

ROUTE_A = "de0de000-0000-4000-8000-0000000000a1"
ROUTE_D = "de0de000-0000-4000-8000-0000000000a4"
NAMES = {
    "visitante": "Visitante · conta nova",
    "motorista": "Davi · motorista",
    "passageira": "Ana · passageira",
    "passageiro": "Bruno · passageiro",
    "admin": "Carla · admin e passageira",
}
SCENES = [
    "Cadastro e login",
    "Perfil e veículo",
    "Publicar, editar, cancelar",
    "Busca com tolerância",
    "Pedido e badge ao vivo",
    "Aceite e aviso",
    "Vagas esgotadas e recusa",
    "Regras do admin",
]

# Ritmo: pausas para quem assiste conseguir ler.
READ = 2.4
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
# Palco 16:9: painel de legendas à esquerda, dois celulares à direita
# ---------------------------------------------------------------------------

STAGE_HTML = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { --ink:#141414; --paper:#fff; --light:#F2F2F2; --mid:#8E8E8E; --soft:#BDBDBD; }
  * { box-sizing: border-box; }
  html { background:var(--light); overflow:hidden; }
  body { margin:0; background:var(--light); font-family:Inter, system-ui, sans-serif; color:var(--ink);
         width:%(W)dpx; height:%(H)dpx; overflow:hidden; display:flex;
         transform:scale(%(S)s); transform-origin:0 0; }
  aside { width:560px; height:100%%; background:var(--ink); color:var(--paper); padding:48px 48px 40px;
          display:flex; flex-direction:column; }
  .brand { font-size:22px; font-weight:500; letter-spacing:.01em; }
  .brand span { color:var(--soft); font-weight:400; }
  #scene { font-size:15px; letter-spacing:.1em; text-transform:uppercase; color:var(--soft); margin-top:56px; }
  #caption { font-size:34px; font-weight:500; margin-top:14px; line-height:1.22; min-height:84px; }
  #sub { font-size:20px; color:#D6D6D6; margin-top:16px; line-height:1.45; }
  ol { list-style:none; padding:0; margin:auto 0 0; font-size:15px; color:#7A7A7A; }
  ol li { padding:5px 0; display:flex; gap:12px; }
  ol li b { font-weight:500; width:20px; }
  ol li.done { color:var(--soft); }
  ol li.now { color:var(--paper); font-weight:500; }
  main { flex:1; display:flex; gap:56px; justify-content:center; align-items:center; }
  .phone { width:%(PW)dpx; }
  .label { font-size:16px; font-weight:500; margin:0 0 8px 6px; min-height:20px; }
  iframe { width:%(PW)dpx; height:%(PH)dpx; border:1px solid var(--mid); border-radius:22px; background:var(--paper); display:block; }
  .phone.active iframe { border:2px solid var(--ink); }
  #card { position:fixed; inset:0; background:var(--ink); color:var(--paper); display:none;
          flex-direction:column; justify-content:center; padding:0 140px; }
  #card .n { font-size:18px; color:var(--soft); letter-spacing:.12em; text-transform:uppercase; }
  #card .t { font-size:64px; font-weight:500; margin-top:18px; line-height:1.1; }
  #card .d { font-size:26px; color:#D6D6D6; margin-top:24px; line-height:1.45; max-width:1000px; }
  #card .foot { position:absolute; bottom:56px; left:140px; font-size:20px; font-weight:500; }
  .warn { color:var(--paper); background:#8A3A3A; padding:2px 10px; border-radius:4px; }
</style></head><body>
<aside>
  <div class="brand">UniRota <span>· caronas universitárias PUC-SP</span></div>
  <div id="scene"></div><div id="caption"></div><div id="sub"></div>
  <ol id="steps">%(STEPS)s</ol>
</aside>
<main>
  <div class="phone" id="pl"><div class="label" id="ll"></div><iframe id="L" src="%(LEFT)s/sign-in"></iframe></div>
  <div class="phone" id="pr"><div class="label" id="lr"></div><iframe id="R" src="%(RIGHT)s/sign-in"></iframe></div>
</main>
<div id="card"><div class="n"></div><div class="t"></div><div class="d"></div><div class="foot">UniRota</div></div>
</body></html>""" % {
    "W": STAGE_W, "H": STAGE_H, "S": SCALE, "PW": PHONE_W, "PH": PHONE_H, "LEFT": LEFT_ORIGIN, "RIGHT": RIGHT_ORIGIN,
    "STEPS": "".join(f"<li><b>{i}</b>{name}</li>" for i, name in enumerate(SCENES, start=1)),
}


class Stage:
    def __init__(self, page: Page, api: Api) -> None:
        self.page = page
        self.api = api
        self.failures: list[dict] = []
        self.scene_name = ""
        self.last_click = time.perf_counter()
        # Instante zero do vídeo: o Playwright começa a gravar ao criar a página.
        self.t0 = time.perf_counter()
        self.clips: list[dict] = []
        self.timings: dict[str, float] = {}
        # Início e fim de cada cartão escuro (relógio do script): âncoras para
        # alinhar com o tempo real do vídeo na montagem do corte.
        self.cards: list[list[float]] = []

    # --- tempo do vídeo e trechos do corte curto ---
    def now(self) -> float:
        return time.perf_counter() - self.t0

    def clip_start(self, name: str) -> None:
        self.clips.append({"trecho": name, "inicio": round(self.now(), 2), "fim": None})

    def clip_end(self) -> None:
        if self.clips and self.clips[-1]["fim"] is None:
            self.clips[-1]["fim"] = round(self.now(), 2)

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
        start = round(self.now(), 2)
        self.page.evaluate(
            "([n, t, d]) => { const c = document.getElementById('card'); c.querySelector('.n').textContent = n;"
            " c.querySelector('.t').textContent = t; c.querySelector('.d').textContent = d; c.style.display = 'flex'; }",
            [number, title, desc],
        )
        time.sleep(secs)
        self.page.evaluate("() => { document.getElementById('card').style.display = 'none'; }")
        self.cards.append([start, round(self.now(), 2)])

    def anchors(self) -> list[float]:
        """Inícios de cartão que o vídeo consegue distinguir: um cartão colado
        no anterior (menos de 0,5 s de tela entre eles) vira um só no vídeo."""
        out: list[float] = []
        prev_end = -10.0
        for start, end in self.cards:
            if start - prev_end >= 0.5:
                out.append(start)
            prev_end = end
        return out

    def scene(self, n: int, title: str, desc: str) -> None:
        self.scene_name = f"Cena {n} — {title}"
        self.page.evaluate(
            "([t, n]) => { document.getElementById('scene').textContent = t;"
            " document.getElementById('caption').textContent = ''; document.getElementById('sub').textContent = '';"
            " document.querySelectorAll('#steps li').forEach((li, i) => {"
            "   li.className = i + 1 < n ? 'done' : i + 1 === n ? 'now' : ''; }); }",
            [f"Cena {n} de {len(SCENES)}", n],
        )
        self.card(f"Cena {n} de {len(SCENES)}", title, desc)

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
        # Só o visível: o expo-router mantém as telas anteriores da pilha
        # montadas (ocultas), com os mesmos textos.
        loc = frame.get_by_text(text, exact=False).filter(visible=True).first
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
        frame.get_by_text(text, exact=False).filter(visible=True).first.wait_for(state="visible", timeout=timeout)
        return time.perf_counter() - start

    def measure(self, key: str) -> float:
        """Tempo desde o último toque até agora, guardado no relatório."""
        elapsed = round(time.perf_counter() - self.last_click, 2)
        self.timings[key] = elapsed
        return elapsed

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
    def fail(self, err: BaseException, out_dir: Path) -> None:
        msg = f"{type(err).__name__}: {str(err).splitlines()[0][:180]}"
        self.failures.append({"cena": self.scene_name, "erro": msg})
        self.clip_end()
        shot = out_dir / f"falha-{len(self.failures)}.png"
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
# Cenas. Cada clip_start/clip_end marca um trecho do corte curto (pitch).
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
            "id": "00000000-0000-4000-8000-000000000000",
            "aud": "authenticated", "role": "authenticated",
            "email": body.get("email", ""), "phone": "",
            "confirmation_sent_at": now, "app_metadata": {"provider": "email", "providers": ["email"]},
            "user_metadata": body.get("data", {}),
            "identities": [{"identity_id": "x", "id": "x", "user_id": "x", "provider": "email"}],
            "created_at": now, "updated_at": now, "is_anonymous": False,
        }),
    )


def scene1(st: Stage) -> None:
    st.clip_start("cadastro")
    st.scene(1, "Cadastro e login", "Só entra quem tem e-mail institucional da PUC-SP.")
    L, R = st.L, st.R
    st.labels(NAMES["visitante"], "")
    st.focus("L")
    st.caption("Cadastro só com e-mail @pucsp.edu.br",
               "Nesta gravação o envio do cadastro é simulado: nenhuma conta é criada e nenhum e-mail sai.", SHORT)
    st.tap(L, "Criar conta", role="link")
    st.type_into(L, "Nome completo", "Conta Nova Demo")
    st.type_into(L, "E-mail institucional", "conta.nova@gmail.com")
    st.type_into(L, "Senha", "DemoUniRota2026!")
    st.tap(L, "Criar conta")
    st.caption("E-mail de fora é barrado antes de qualquer envio", "A regra também vale no servidor.", READ + 0.6)
    st.clip_end()
    L.get_by_role("textbox", name="E-mail institucional", exact=True).fill("")
    st.type_into(L, "E-mail institucional", "conta.nova.demo@pucsp.edu.br")
    st.tap(L, "Criar conta")
    st.wait_text(L, "Confirme seu e-mail")
    st.caption("Confirme seu e-mail", "O link de confirmação vai para a caixa institucional.", READ + 0.8)

    st.tap(L, "Ir para o login")
    st.labels(NAMES["motorista"], NAMES["passageira"])
    st.caption("Login com conta já confirmada", "Três senhas erradas bloqueiam a conta por 15 minutos.", SHORT)
    st.login_ui(L, "motorista")
    st.focus("R")
    st.login_ui(R, "passageira")
    st.caption("Motorista e passageira conectados", "Davi à esquerda, Ana à direita.", READ)


def scene2(st: Stage) -> None:
    st.scene(2, "Perfil e veículo", "Perfil completo com foto, curso e campus; o carro define as vagas.")
    L, R = st.L, st.R
    st.home(L)
    st.home(R)
    st.focus("L")
    st.tap(L, "Meu perfil")
    st.caption("Perfil completo", "Nome, foto, curso e campus são obrigatórios para pedir ou oferecer carona.", READ)
    st.tap(L, "Dados pessoais", exact=False)
    st.caption("Dados pessoais", "Foto de teste genérica, sem pessoa real.", READ)
    st.back(L)
    st.tap(L, "Meu veículo", exact=False)
    st.caption("Veículo: modelo, cor, placa e vagas", "As vagas do carro (2) são o teto de cada carona.", READ + 0.6)
    st.back(L)
    st.focus("R")
    st.tap(R, "Meu perfil")
    st.caption("Um perfil, dois modos", "Sem veículo cadastrado, o modo motorista fica indisponível.", READ)


def scene3(st: Stage, when_a: datetime) -> None:
    st.clip_start("publicar")
    st.scene(3, "Publicar, editar e cancelar", "O motorista oferece uma viagem com endereço real e destino no campus.")
    L = st.L
    st.home(L)
    st.focus("L")
    new_when = (when_a + timedelta(days=3)).replace(hour=19, minute=0)
    st.tap(L, "Publicar carona")
    st.caption("Endereço por busca", "As sugestões vêm do OpenStreetMap; o destino usa o atalho do campus.", 0.4)
    st.address(L, "Origem", "terminal rodoviario tiete", "Terminal Rodoviário Tietê")
    st.tap(L, "Usar meu campus como destino", exact=False)
    st.set_date_time(L, new_when)
    st.tap(L, "Publicar carona", last=True)
    st.wait_text(L, "Rua Augusta, 1500")
    st.caption("Carona publicada", f"{new_when:%d/%m} às 19:00, saindo do Terminal Tietê.", READ)
    st.clip_end()

    st.tap_text(L, "Terminal Rodoviário Tietê")
    st.tap(L, "Editar carona")
    L.locator('input[type="time"]').first.fill("19:30", force=True)
    time.sleep(0.8)
    st.caption("Editar trajeto, data e horário", "Quem já tem vaga aceita é avisado da mudança.", READ)
    st.tap(L, "Salvar alteração")
    st.wait_text(L, "19:30")
    st.caption("Horário alterado para 19:30", "", READ)

    st.back(L)
    st.tap_text(L, "Rua Augusta, 1500")
    st.tap(L, "Cancelar carona")
    st.tap(L, "Motivo")
    st.tap_text(L, "Mudança de compromisso ou horário")
    st.caption("Cancelar exige motivo", "O motivo vai no aviso aos passageiros aceitos.", READ)
    st.tap(L, "Cancelar carona", last=True)
    time.sleep(2.0)
    st.caption("Carona cancelada", "Sai da busca na hora.", READ)
    st.goto(L, LEFT_ORIGIN, "/home")


def scene4(st: Stage, when_a: datetime) -> None:
    st.clip_start("busca")
    st.scene(4, "Busca com tolerância", "Perto da Av. Paulista até a PUC Perdizes: raio de 2 km e janela de ± 30 min.")
    R = st.R
    st.home(R)
    st.focus("R")
    st.search(R, when_a)
    st.wait_text(R, "MASP")
    st.caption("A carona do MASP aparece: sai a 650 m",
               "A da Praça da Sé, mesmo horário e destino, fica de fora: a origem está a 2,5 km, fora do raio.",
               READ + 2.0)
    st.clip_end()


def scene5(st: Stage) -> None:
    st.clip_start("pedido")
    st.scene(5, "Pedido e badge ao vivo", "A passageira pede vaga; o celular do motorista atualiza sozinho.")
    L, R = st.L, st.R
    st.home(L)
    st.caption("Davi está na tela inicial, sem pendências", "", SHORT)
    st.focus("R")
    st.tap(R, "Solicitar vaga")
    st.caption("Confirmação antes de pedir", "A vaga só fica garantida quando o motorista aceitar.", SHORT)
    st.tap(R, "Solicitar vaga", last=True)
    st.focus("L")
    st.wait_text(L, "1 solicitação pendente")
    elapsed = st.measure("pedido_ate_badge")
    st.caption(f"Badge do motorista em {elapsed:.1f} s".replace(".", ","),
               "Tempo real por WebSocket (Supabase Realtime), com o aviso “Nova solicitação de vaga”.", READ + 1.0)
    st.clip_end()


def scene6(st: Stage) -> None:
    st.clip_start("aceite")
    st.scene(6, "Aceite e aviso", "O motorista aceita; a passageira recebe o aviso na hora.")
    L, R = st.L, st.R
    st.focus("L")
    loc = L.get_by_test_id("pending-requests-badge")
    loc.wait_for(timeout=10000)
    st._mark(loc)
    loc.click()
    st.wait_text(L, "Aceitar")
    st.caption("Quem pediu, com foto, curso e campus", "", READ)
    st.tap(L, "Aceitar")
    st.focus("R")
    st.wait_text(R, "Vaga aceita")
    elapsed = st.measure("aceite_ate_aviso")
    st.caption(f"Ana recebeu “Vaga aceita” em {elapsed:.1f} s".replace(".", ","), "", READ + 1.0)
    st.clip_end()
    # "Ver" no aviso flutuante já marca como lido; para mostrar a lista com o
    # não lido em destaque, vai por Avisos.
    st.home(R)
    st.tap(R, "Avisos", exact=False)
    st.caption("Avisos guardados", "Não lidos em destaque; o que chega com o app fechado aparece aqui.", READ)
    st.tap(R, "Marcar como lidas")
    st.caption("Marcar como lidas", "", SHORT)
    st.tap_text(R, "Vaga aceita")
    st.wait_text(R, "Esteja no ponto no horário")
    st.caption("O aviso leva a Minhas solicitações: Aceita", "", READ)


def scene7(st: Stage, when_a: datetime) -> None:
    st.clip_start("esgotadas")
    st.scene(7, "Vagas esgotadas e recusa", "A última vaga é aceita: a carona lota, sai da busca e as pendências se encerram.")
    st.clip_end()
    L, R = st.L, st.R
    st.home(L)
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

    st.clip_start("esgotadas-1")
    st.caption("Bruno pede a última vaga", "", 0.6)
    st.focus("L")
    loc = L.get_by_test_id("pending-requests-badge")
    st._mark(loc)
    loc.click()
    st.wait_text(L, "Bruno")
    st.caption("Davi abre a carona: Bruno quer a última vaga", "", READ)
    st.clip_end()

    st.labels(NAMES["motorista"], NAMES["admin"])
    st.switch_account("R", "admin")
    st.search(R, when_a)
    st.wait_text(R, "MASP")
    st.clip_start("esgotadas-2")
    st.caption("Carla vê a mesma carona, ainda com 1 vaga",
               "Pedido pendente não reserva vaga. Carla também pede, por outro aparelho.", SHORT)
    for route in (ROUTE_A, ROUTE_D):
        status, body = st.api.request_seat("admin", route)
        if status >= 300:
            raise RuntimeError(f"request_seat de Carla falhou ({status}): {body}")
    st.focus("L")
    st.wait_text(L, "Carla")
    st.caption("A lista do motorista atualiza sozinha", "O pedido de Carla aparece sem recarregar a tela.", READ)
    st.tap(L, "Aceitar")
    st.wait_text(L, "Vagas esgotadas")
    st.caption("Davi aceita Bruno: vagas esgotadas",
               "O pedido de Carla é encerrado na mesma transação (não é “recusada”).", READ + 1.0)

    st.focus("R")
    st.caption("E se Carla tentar pela tela que ficou aberta?", "", SHORT)
    st.tap(R, "Solicitar vaga")
    st.tap(R, "Solicitar vaga", last=True)
    st.wait_text(R, "esgotaram")
    st.caption("Mensagem clara, em português", "“As vagas desta carona se esgotaram. Busque outra carona.”", READ + 1.0)
    st.clip_end()

    st.goto(R, RIGHT_ORIGIN, "/requests")
    st.wait_text(R, "Vagas esgotadas")
    st.caption("Em Minhas solicitações: “Vagas esgotadas”", "A carona lotou antes de o motorista responder.", READ + 0.6)
    st.goto(R, RIGHT_ORIGIN, "/home")
    st.search(R, when_a)
    st.wait_text(R, "Nenhuma", timeout=20000)
    st.caption("A carona lotada sumiu da busca", "E a da Praça da Sé continua fora do raio de 2 km.", READ + 0.6)

    st.focus("L")
    st.back(L)
    st.tap(L, "Minhas caronas")
    st.tap_text(L, "Estação Santana")
    st.wait_text(L, "Recusar")
    st.clip_start("recusa")
    st.caption("Agora uma recusa", "Carla também pediu vaga na carona de Santana.", SHORT)
    st.tap(L, "Recusar")
    st.tap(L, "Recusar solicitação")
    st.focus("R")
    st.wait_text(R, "Solicitação recusada")
    elapsed = st.measure("recusa_ate_aviso")
    st.caption(f"Carla recebeu “Solicitação recusada” em {elapsed:.1f} s".replace(".", ","), "", READ + 1.0)
    st.clip_end()


def scene8(st: Stage, when_a: datetime) -> None:
    st.clip_start("admin")
    st.scene(8, "Regras do admin", "A coordenação ajusta a tolerância da busca, sem publicar app novo.")
    R = st.R
    st.focus("R")
    st.goto(R, RIGHT_ORIGIN, "/home")
    st.tap(R, "Meu perfil")
    st.tap(R, "Regras da busca", exact=False)
    st.caption("Regras da busca (só admin)", "Raio de 0,5 a 50 km; janela de 5 a 240 min.", READ)
    R.get_by_role("textbox", name="Raio máximo (km)", exact=True).fill("")
    st.type_into(R, "Raio máximo (km)", "5")
    st.tap(R, "Salvar alterações")
    time.sleep(2.0)
    st.caption("Raio: 5 km", "Vale na próxima busca.", READ)
    st.goto(R, RIGHT_ORIGIN, "/home")
    st.search(R, when_a)
    st.wait_text(R, "Praça da Sé")
    st.caption("Agora a carona da Praça da Sé aparece", "Origem a 2,5 km: dentro do novo raio de 5 km.", READ + 2.0)
    st.clip_end()


def opening(st: Stage) -> None:
    st.clip_start("abertura")
    st.card("PUC-SP · Gestão Ágil de Projetos", "UniRota",
            "Caronas entre quem estuda e trabalha na PUC-SP. Demonstração do MVP: "
            "dois celulares lado a lado, motorista à esquerda e passageiros à direita.", 5.0)
    st.clip_end()


def closing(st: Stage, report: dict) -> None:
    st.clip_start("fechamento")
    falhas = report["falhas"]
    st.card(
        "UniRota",
        "Do cadastro à vaga confirmada",
        "Cadastro institucional, perfil e veículo, publicar e gerenciar caronas, busca com tolerância "
        "configurável, pedido, aceite e recusa, vagas esgotadas e avisos em tempo real. "
        "Próximas entregas: avaliação mútua, recuperação de senha e notificação push."
        + (f" (Falharam nesta gravação: {len(falhas)} cena(s).)" if falhas else ""),
        7.0,
    )
    st.clip_end()


# ---------------------------------------------------------------------------
# Pós-produção (ffmpeg): mp4 completo e corte curto
# ---------------------------------------------------------------------------

def find_ffmpeg(explicit: str | None) -> str | None:
    if explicit:
        return explicit
    found = shutil.which("ffmpeg")
    if found:
        return found
    # winget (Gyan.FFmpeg) instala fora do PATH da sessão atual.
    import os
    base = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    for exe in base.glob("Gyan.FFmpeg*/*/bin/ffmpeg.exe"):
        return str(exe)
    return None


def detect_cards(ffmpeg: str, video: Path) -> list[float]:
    """Instantes (s) em que um cartão escuro entra em cena no vídeo.

    Olha uma faixa da direita do quadro, onde normalmente estão os celulares
    (claros): só o cartão de título a deixa quase preta. Diálogos escurecem
    para cinza, acima do limiar.
    """
    fps = 10
    # Faixa larga que cruza os DOIS celulares: um celular piscando em preto ao
    # recarregar não escurece a média; o cartão, que cobre tudo, escurece.
    res = subprocess.run(
        [ffmpeg, "-loglevel", "error", "-i", str(video), "-vf",
         f"fps={fps},crop=1000:240:800:480,scale=1:1,format=gray", "-f", "rawvideo", "-"],
        capture_output=True, check=True,
    )
    dark = [value < 45 for value in res.stdout]
    starts: list[float] = []
    i = 0
    while i < len(dark):
        if not dark[i]:
            i += 1
            continue
        j = i
        while j < len(dark) and dark[j]:
            j += 1
        if (j - i) / fps >= 2.0:  # cartões duram 3,6 s ou mais
            starts.append(round(i / fps, 2))
        i = j
    return starts


def align(script_marks: list[float], video_marks: list[float]):
    """Função relógio-do-script → tempo-do-vídeo, linear entre âncoras.

    O vídeo do Playwright descarta/duplica quadros e escorrega alguns segundos
    em 6 minutos; as marcas do script sozinhas cortariam o trecho errado.
    """
    if len(script_marks) != len(video_marks) or len(script_marks) < 2:
        raise RuntimeError(f"âncoras não batem: {len(script_marks)} cartões no script, {len(video_marks)} no vídeo")
    pairs = list(zip(script_marks, video_marks))

    def f(t: float) -> float:
        for (s0, v0), (s1, v1) in zip(pairs, pairs[1:]):
            if t <= s1 or (s1, v1) == pairs[-1]:
                return v0 + (t - s0) * (v1 - v0) / (s1 - s0)
        return t
    return f


def to_mp4(ffmpeg: str, raw: Path, out: Path, clips: list[dict] | None = None) -> None:
    """webm → mp4 H.264 (toca no PowerPoint e em projetor). Com `clips`, monta o corte."""
    encode = ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
              "-r", "30", "-movflags", "+faststart", "-an"]
    if not clips:
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(raw), *encode, str(out)], check=True)
        return
    parts = []
    for i, c in enumerate(clips):
        # `clips` já vem em tempo de vídeo (ver align); folga pequena no fim.
        start = max(0.0, c["inicio"])
        end = c["fim"] + 0.3
        parts.append(f"[0:v]trim=start={start:.2f}:end={end:.2f},setpts=PTS-STARTPTS,fps=30[v{i}]")
    graph = ";".join(parts) + ";" + "".join(f"[v{i}]" for i in range(len(clips))) + \
        f"concat=n={len(clips)}:v=1:a=0[out]"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(raw), "-filter_complex", graph,
                    "-map", "[out]", *encode, str(out)], check=True)


def video_clips(report: dict) -> list[dict]:
    """Trechos do corte convertidos para o tempo real do vídeo completo."""
    f = align(report["cartoes_script_s"], report["cartoes_video_s"])
    return [{**c, "inicio": round(f(c["inicio"]), 2), "fim": round(f(c["fim"]), 2)} for c in report["trechos_do_corte"]]


def recut(report_path: Path, ffmpeg: str) -> None:
    """Remonta só o corte curto a partir do mp4 completo e do relatório."""
    report = json.loads(report_path.read_text(encoding="utf-8"))
    full = report_path.parent / "unirota-demo-completo.mp4"
    report["cartoes_video_s"] = detect_cards(ffmpeg, full)
    pitch = report_path.parent / "unirota-demo-pitch.mp4"
    to_mp4(ffmpeg, full, pitch, video_clips(report))
    report.setdefault("arquivos", {})[pitch.name] = {"bytes": pitch.stat().st_size, "segundos": duration(ffmpeg, pitch)}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("cartoes_script_s", "cartoes_video_s", "arquivos")}, ensure_ascii=False, indent=2))


def duration(ffmpeg: str, path: Path) -> float | None:
    probe = Path(ffmpeg).with_name("ffprobe.exe" if ffmpeg.endswith(".exe") else "ffprobe")
    if not probe.exists():
        return None
    res = subprocess.run([str(probe), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True)
    try:
        return round(float(res.stdout.strip()), 1)
    except ValueError:
        return None


# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--out-dir", default=str(ROOT / "docs" / "demo"))
    ap.add_argument("--ffmpeg", default=None)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--recortar", action="store_true",
                    help="só remonta o corte curto a partir do mp4 completo e do relatório em --out-dir")
    args = ap.parse_args()

    if args.recortar:
        ffmpeg = find_ffmpeg(args.ffmpeg)
        if not ffmpeg:
            sys.exit("--recortar precisa do ffmpeg")
        recut(Path(args.out_dir) / "relatorio-gravacao.json", ffmpeg)
        return

    dist = Path(args.dist)
    if not (dist / "index.html").exists():
        sys.exit(f"Build web não encontrado em {dist}. Rode: npx expo export --platform web")

    api = Api()
    when_a = api.departure(ROUTE_A)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    video_dir = out_dir / "_raw"
    raw_out = out_dir / "unirota-demo-bruto.webm"
    srv = serve(dist)
    report: dict = {"inicio": datetime.now(SP).isoformat(timespec="seconds"), "falhas": [], "cenas": []}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        ctx = browser.new_context(
            viewport={"width": VIDEO_W, "height": VIDEO_H},
            record_video_dir=str(video_dir),
            record_video_size={"width": VIDEO_W, "height": VIDEO_H},
            timezone_id="America/Sao_Paulo",
            locale="pt-BR",
        )
        ctx.route("**/auth/v1/signup**", fake_signup)
        page = ctx.new_page()
        st = Stage(page, api)  # t0 = início do vídeo
        page.set_default_timeout(20000)
        page.set_content(STAGE_HTML)
        time.sleep(5)  # fonte e as duas telas de login carregando
        opening(st)

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
                st.fail(err, out_dir)
                ok = False
            report["cenas"].append({"cena": i, "titulo": SCENES[i - 1], "ok": ok,
                                    "segundos": round(time.perf_counter() - t0, 1)})
        report["falhas"] = st.failures
        closing(st, report)
        video = page.video
        ctx.close()
        browser.close()
        raw = Path(video.path())
        raw_out.unlink(missing_ok=True)
        raw.replace(raw_out)
        try:
            video_dir.rmdir()
        except OSError:
            pass
    srv.shutdown()

    report["tempos_medidos_s"] = st.timings
    report["cartoes_script_s"] = st.anchors()
    report["trechos_do_corte"] = [c for c in st.clips if c["fim"] is not None]
    ffmpeg = find_ffmpeg(args.ffmpeg)
    files = {}
    if ffmpeg:
        full = out_dir / "unirota-demo-completo.mp4"
        pitch = out_dir / "unirota-demo-pitch.mp4"
        to_mp4(ffmpeg, raw_out, full)
        report["cartoes_video_s"] = detect_cards(ffmpeg, full)
        to_mp4(ffmpeg, full, pitch, video_clips(report))
        raw_out.unlink()
        for f in (full, pitch):
            files[f.name] = {"bytes": f.stat().st_size, "segundos": duration(ffmpeg, f)}
    else:
        print("ffmpeg não encontrado: ficou só o webm, sem o corte curto.")
        files[raw_out.name] = {"bytes": raw_out.stat().st_size}
    report["arquivos"] = files
    (out_dir / "relatorio-gravacao.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
