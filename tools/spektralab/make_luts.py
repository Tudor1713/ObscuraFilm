# baked/<id>.bin -> <out>/<id>.png (33^3 LUT as a 1089 x 33 strip: x = r + b*33, y = g) + contact sheet
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from lut import lut_from_render, apply, N
out, photo, sheet = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
report = json.load(open('baked/report.json', encoding='utf8'))
src = np.asarray(Image.open(photo).convert('RGB').resize((330, 220), Image.LANCZOS))
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
tiles = [(Image.fromarray(src), 'original')]
for r in report:
    if 'error' in r: continue
    lut = lut_from_render(f"baked/{r['id']}.bin")                     # [b][g][r]
    strip = np.clip(lut * 255 + .5, 0, 255).astype(np.uint8)           # (b, g, r, 3)
    strip = strip.transpose(1, 0, 2, 3).reshape(N, N * N, 3)           # y = g, x = b*N + r
    Image.fromarray(strip, 'RGB').save(f"{out}/{r['id']}.png", optimize=True)
    lut8 = strip.reshape(N, N, N, 3).transpose(1, 0, 2, 3).astype(np.float32) / 255
    tiles.append((Image.fromarray(apply(lut8, src)), r['name']))
cols = 6
W, H = 330, 220 + 26
o = Image.new('RGB', (cols * W, ((len(tiles) + cols - 1) // cols) * H), (24, 22, 20))
d = ImageDraw.Draw(o)
for i, (im, name) in enumerate(tiles):
    x, y = (i % cols) * W, (i // cols) * H
    o.paste(im, (x, y)); d.text((x + 6, y + 222), name, font=font, fill=(230, 225, 215))
o.save(sheet)
print(len(tiles) - 1, 'luts')
