#!/usr/bin/env python3
"""Generate apps/3ds/icon.png — the 48x48 HOME-menu icon devkitARM's SMDH rule
embeds. A game cartridge in the site's emerald accent on a cool-slate field, so
the installed title is instantly recognizable as ROM Archive in the title list.

Run from apps/3ds:  python3 tools/make_icon.py
Deterministic (no randomness); safe to re-run.
"""
from PIL import Image, ImageDraw

W = H = 48  # SMDH icon spec size

# Palette pulled from the website design system (cool slate + emerald/teal).
BG_TOP = (16, 22, 32)      # cool-slate dark
BG_BOT = (26, 36, 50)
CART = (0, 204, 163)       # emerald accent
CART_HI = (85, 230, 196)   # lighter teal highlight
LABEL = (235, 245, 242)    # near-white label
NOTCH = (16, 22, 32)       # cut-outs read as the background


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
px = img.load()

# Rounded-square background with a subtle vertical gradient.
radius = 8
for y in range(H):
    row = lerp(BG_TOP, BG_BOT, y / (H - 1))
    for x in range(W):
        # rounded corners: skip pixels outside the rounded rect
        cx = min(x, radius - 1, W - 1 - x)
        cy = min(y, radius - 1, H - 1 - y)
        if cx < radius and cy < radius:
            dx = radius - 1 - cx
            dy = radius - 1 - cy
            if dx * dx + dy * dy > radius * radius:
                continue
        px[x, y] = row + (255,)

d = ImageDraw.Draw(img)

# Cartridge body.
d.rounded_rectangle([12, 8, 36, 40], radius=3, fill=CART)
# Top bevel highlight.
d.rounded_rectangle([12, 8, 36, 15], radius=3, fill=CART_HI)
# Label panel.
d.rounded_rectangle([16, 17, 32, 29], radius=2, fill=LABEL)
# Two label lines (the "text" on the sticker).
d.rectangle([18, 20, 30, 22], fill=CART)
d.rectangle([18, 24, 27, 26], fill=CART)
# Connector notches at the bottom edge (the classic cartridge pins).
for nx in (16, 22, 28):
    d.rectangle([nx, 36, nx + 3, 40], fill=NOTCH)
# Side grip notches.
d.rectangle([12, 30, 15, 33], fill=NOTCH)
d.rectangle([33, 30, 36, 33], fill=NOTCH)

img.save("icon.png")
print("wrote icon.png (48x48)")
