"""Gera as fotos de teste das contas demo (scripts/demo/avatars/*.png).

Não são fotos de pessoas: um fundo liso no tom da paleta UniRota com as
iniciais em Inter Medium e uma forma geométrica diferente por conta, para
distinguir quem é quem no vídeo. Já estão versionadas; rode de novo só se
quiser mudar o desenho (precisa do Pillow: pip install pillow).

    python scripts/demo/make_avatars.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "avatars"
FONT = ROOT / "node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"

INK = (20, 20, 20)        # preto UniRota #141414
PAPER = (255, 255, 255)
LIGHT = (242, 242, 242)   # cinza claro #F2F2F2
MID = (142, 142, 142)     # cinza médio #8E8E8E

ACCOUNTS = [
    ("motorista", "DM", INK, PAPER, "circle"),
    ("passageira", "AP", LIGHT, INK, "square"),
    ("passageiro", "BP", MID, PAPER, "triangle"),
    ("admin", "CA", PAPER, INK, "ring"),
]

SIZE = 512


def draw_shape(d: ImageDraw.ImageDraw, kind: str, color) -> None:
    s = SIZE
    if kind == "circle":
        d.ellipse((s * 0.62, s * 0.06, s * 0.94, s * 0.38), fill=color)
    elif kind == "square":
        d.rectangle((s * 0.66, s * 0.08, s * 0.92, s * 0.34), fill=color)
    elif kind == "triangle":
        d.polygon([(s * 0.79, s * 0.06), (s * 0.95, s * 0.36), (s * 0.63, s * 0.36)], fill=color)
    else:
        d.ellipse((s * 0.62, s * 0.06, s * 0.94, s * 0.38), outline=color, width=int(s * 0.04))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype(str(FONT), int(SIZE * 0.34))
    for name, initials, bg, fg, shape in ACCOUNTS:
        img = Image.new("RGB", (SIZE, SIZE), bg)
        d = ImageDraw.Draw(img)
        if bg == PAPER:
            d.rectangle((0, 0, SIZE - 1, SIZE - 1), outline=LIGHT, width=8)
        draw_shape(d, shape, fg)
        box = d.textbbox((0, 0), initials, font=font)
        w, h = box[2] - box[0], box[3] - box[1]
        d.text(((SIZE - w) / 2 - box[0], (SIZE - h) / 2 - box[1] + SIZE * 0.06), initials, font=font, fill=fg)
        path = OUT / f"{name}.png"
        img.save(path, optimize=True)
        print(path.relative_to(ROOT), path.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
