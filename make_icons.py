#!/usr/bin/env python3
"""
Genereaza iconitele PWA pentru "Ture & Concediu".

Design: un disc taiat vertical in doua — SOARE (tura de zi, portocaliu) si
LUNA (tura de noapte, violet), pe fundal inchis cu colturi rotunjite.
Sursa vectoriala echivalenta: icons/icon.svg

Rulare:
    python make_icons.py

Fara dependinte externe: PNG scris direct cu zlib + struct, antialiasing
analitic prin distance fields (o evaluare per pixel, nu supersampling).
"""

import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")

# ── paleta, identica cu variabilele CSS din aplicatie ──
BG_TOP    = (0x14, 0x1c, 0x2b)   # fundal, sus
BG_BOT    = (0x0b, 0x0f, 0x16)   # fundal, jos  (--bg)
DAY_TOP   = (0xfb, 0xbf, 0x24)   # soare, sus
DAY_BOT   = (0xf5, 0x9e, 0x0b)   # soare, jos   (--zi)
NIGHT_TOP = (0xc0, 0x84, 0xfc)   # luna, sus
NIGHT_BOT = (0xa8, 0x55, 0xf7)   # luna, jos    (--noapte)
RAY       = (0xfb, 0xbf, 0x24)   # raze

# ── geometrie, in fractiuni din latura (0..1) ──
DISC_R    = 152 / 512.0          # raza discului
GAP       = 8 / 512.0            # jumatate din distanta dintre cele doua jumatati
# Decupajul care transforma jumatatea de noapte in semiluna. Centrul sta
# la STANGA cusaturii: astfel ramane arcul exterior (bulbul spre margine),
# iar concavitatea priveste spre soare.
CUT_R     = 140 / 512.0          # raza decupajului de semiluna
CUT_X     = 210 / 512.0
CUT_Y     = 256 / 512.0
RAY_W     = 19 / 512.0           # grosimea razelor
CORNER    = 112 / 512.0          # raza colturilor

# Raze radiale, distribuite in evantai DOAR pe partea soarelui (stanga),
# la 135° / 157.5° / 180° / 202.5° / 225°. Coordonate in spatiul 512.
RAYS = [
    (136, 136, 116, 116),
    (99,  191, 73,  180),
    (86,  256, 58,  256),
    (99,  321, 73,  332),
    (136, 376, 116, 396),
]


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def cov(sd, px):
    """Acoperire 0..1 dintr-o valoare de distanta cu semn (negativ = interior)."""
    v = 0.5 - sd / px
    return 0.0 if v <= 0.0 else (1.0 if v >= 1.0 else v)


def over(src, sa, dst, da):
    """Compunere alpha 'source over destination', canale 0..255."""
    if sa <= 0.0:
        return dst, da
    out_a = sa + da * (1.0 - sa)
    if out_a <= 0.0:
        return (0.0, 0.0, 0.0), 0.0
    out = tuple((src[i] * sa + dst[i] * da * (1.0 - sa)) / out_a for i in range(3))
    return out, out_a


def sd_seg(x, y, x1, y1, x2, y2, r):
    """Distanta cu semn la o capsula (segment gros, capete rotunde)."""
    dx, dy = x2 - x1, y2 - y1
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0.0 else ((x - x1) * dx + (y - y1) * dy) / L2
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    px, py = x - (x1 + t * dx), y - (y1 + t * dy)
    return math.hypot(px, py) - r


def sd_round_rect(x, y, n, r):
    """Distanta cu semn la un dreptunghi n×n cu colturi rotunjite de raza r."""
    qx = abs(x - n / 2.0) - (n / 2.0 - r)
    qy = abs(y - n / 2.0) - (n / 2.0 - r)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r


def render(size, content_scale=1.0, rounded=True):
    """Randeaza o iconita size×size si intoarce octeti RGBA (fara filtru PNG)."""
    n = float(size)
    cx = cy = n / 2.0
    px = 1.0                                   # latimea marginii de antialiasing

    R    = DISC_R * n * content_scale
    gap  = GAP * n * content_scale
    cutR = CUT_R * n * content_scale
    cutX = cx + (CUT_X - 0.5) * n * content_scale
    cutY = cy + (CUT_Y - 0.5) * n * content_scale
    rayR = RAY_W * n * content_scale / 2.0
    corner = CORNER * n

    rays = [(cx + (x1 / 512.0 - 0.5) * n * content_scale,
             cy + (y1 / 512.0 - 0.5) * n * content_scale,
             cx + (x2 / 512.0 - 0.5) * n * content_scale,
             cy + (y2 / 512.0 - 0.5) * n * content_scale)
            for (x1, y1, x2, y2) in RAYS]

    rows = bytearray()
    for iy in range(size):
        y = iy + 0.5
        ty = iy / max(n - 1.0, 1.0)            # gradient vertical
        bg_col    = lerp(BG_TOP, BG_BOT, ty)
        day_col   = lerp(DAY_TOP, DAY_BOT, ty)
        night_col = lerp(NIGHT_TOP, NIGHT_BOT, ty)

        rows.append(0)                          # tip de filtru: none
        for ix in range(size):
            x = ix + 0.5

            # 1. fundal
            if rounded:
                a = cov(sd_round_rect(x, y, n, corner), px)
            else:
                a = 1.0                         # maskable: fundal pe toata suprafata
            col, alpha = (bg_col, a) if a > 0.0 else ((0.0, 0.0, 0.0), 0.0)

            d_disc = math.hypot(x - cx, y - cy) - R

            # 2. raze de soare (sub disc)
            if d_disc > -rayR:
                best = 1e9
                for (x1, y1, x2, y2) in rays:
                    sd = sd_seg(x, y, x1, y1, x2, y2, rayR)
                    if sd < best:
                        best = sd
                ca = cov(best, px)
                if ca > 0.0:
                    col, alpha = over(day_col, ca, col, alpha)

            # 3. jumatatea de zi (stanga): disc ∩ (x < cx - gap)
            sd_left = max(d_disc, (x - (cx - gap)))
            ca = cov(sd_left, px)
            if ca > 0.0:
                col, alpha = over(day_col, ca, col, alpha)

            # 4. jumatatea de noapte (dreapta): disc ∩ (x > cx + gap) − decupaj
            sd_right = max(d_disc, ((cx + gap) - x))
            d_cut = math.hypot(x - cutX, y - cutY) - cutR
            sd_moon = max(sd_right, -d_cut)     # scade cercul de decupaj
            ca = cov(sd_moon, px)
            if ca > 0.0:
                col, alpha = over(night_col, ca, col, alpha)

            r = int(col[0] + 0.5); g = int(col[1] + 0.5); b = int(col[2] + 0.5)
            rows.extend((min(255, max(0, r)), min(255, max(0, g)),
                         min(255, max(0, b)), int(alpha * 255.0 + 0.5)))
    return bytes(rows)


def write_png(path, size, raw):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    hdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)   # RGBA, 8 bit
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", hdr) +
           chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    return len(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("icon-192.png",          192, 1.00, True),
        ("icon-512.png",          512, 1.00, True),
        # maskable: continut la 72% si fundal pe toata suprafata, ca sistemul
        # sa poata decupa orice forma (cerc, squircle) fara sa taie desenul
        ("icon-maskable-512.png", 512, 0.72, False),
    ]
    print("Generez iconite in", OUT)
    for name, size, scale, rounded in jobs:
        raw = render(size, scale, rounded)
        nb = write_png(os.path.join(OUT, name), size, raw)
        print("  -> %-24s %4dpx  %6d bytes" % (name, size, nb))
    print("Gata. Sursa vectoriala: icons/icon.svg")


if __name__ == "__main__":
    main()
