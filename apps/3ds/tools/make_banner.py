#!/usr/bin/env python3
"""Generate apps/3ds/banner.png — the 256x128 HOME-menu banner bannertool wraps
into the .bnr shown on the top screen when the title is selected. Same design
language as icon.png: the emerald game cartridge on a cool-slate gradient, plus
the app name, so selecting the title no longer shows a black rectangle.

Run from apps/3ds:  python3 tools/make_banner.py
Deterministic (no randomness); safe to re-run.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 256, 128  # banner spec size

# Palette pulled from the website design system (cool slate + emerald/teal).
BG_TOP = (22, 30, 42)
BG_BOT = (34, 46, 63)
CART = (0, 204, 163)
CART_HI = (85, 230, 196)
LABEL = (235, 245, 242)
NOTCH_BG = (18, 25, 35)
TITLE = (235, 245, 242)
SUB = (148, 163, 184)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


img = Image.new("RGB", (W, H), BG_TOP)
px = img.load()
for y in range(H):
    row = lerp(BG_TOP, BG_BOT, y / (H - 1))
    for x in range(W):
        px[x, y] = row

d = ImageDraw.Draw(img)

# Cartridge on the left, scaled up from the icon's proportions.
ox, oy = 22, 24  # origin
d.rounded_rectangle([ox, oy, ox + 56, oy + 80], radius=6, fill=CART)
d.rounded_rectangle([ox, oy, ox + 56, oy + 18], radius=6, fill=CART_HI)
d.rounded_rectangle([ox + 10, oy + 24, ox + 46, oy + 52], radius=4, fill=LABEL)
d.rectangle([ox + 15, oy + 31, ox + 41, oy + 36], fill=CART)
d.rectangle([ox + 15, oy + 41, ox + 34, oy + 46], fill=CART)
for nx in (ox + 10, ox + 24, ox + 38):
    d.rectangle([nx, oy + 70, nx + 8, oy + 80], fill=NOTCH_BG)

# Title + subtitle on the right.
title_font = ImageFont.truetype(FONT_BOLD, 26)
sub_font = ImageFont.truetype(FONT_REG, 13)
d.text((96, 38), "ROM", font=title_font, fill=TITLE)
d.text((96, 66), "Archive", font=title_font, fill=CART)
d.text((96, 98), "Send ROMs to your 3DS", font=sub_font, fill=SUB)

img.save("banner.png")
print("wrote banner.png (256x128)")
