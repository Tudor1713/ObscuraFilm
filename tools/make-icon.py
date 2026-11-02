# Builds build/icon.ico + build/icon.png from the hand-drawn sketch in build/icon-sketch.png.
# The paper around the drawing becomes transparent, the paper inside its outline stays white, so the
# icon reads on light and dark backgrounds alike. Small sizes get heavier strokes so the line survives.
#   python tools/make-icon.py
import io, os, struct
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), '..')
src = Image.open(os.path.join(ROOT, 'build', 'icon-sketch.png')).convert('L')
g = np.asarray(src).astype(np.float32) / 255

ink = np.clip((0.82 - g) / 0.5, 0, 1)                      # stroke coverage, anti-aliased
solid = ink > 0.5
ys, xs = np.nonzero(solid)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()

# outside = paper reachable from the border once small gaps in the line are closed
closed = ndimage.binary_dilation(solid, iterations=9)
outside = ndimage.binary_fill_holes(closed) == 0
outside = ndimage.binary_dilation(outside, iterations=9) & ~solid
paper = (~outside).astype(np.float32)
paper = np.asarray(Image.fromarray((paper * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255

# square crop around the drawing
side = int(max(x1 - x0, y1 - y0) * 1.045)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
box = (int(cx - side / 2), int(cy - side / 2), int(cx - side / 2) + side, int(cy - side / 2) + side)


def render(size, bold):
    k = ink
    if bold > 0:   # thicken the line for small sizes: grey dilation of the coverage
        r = bold / 2
        yy, xx = np.mgrid[-int(r):int(r) + 1, -int(r):int(r) + 1]
        k = ndimage.grey_dilation(ink, footprint=(xx * xx + yy * yy) <= r * r)
    a = k + paper * (1 - k)
    rgb = np.where(a > 0, 255 * paper * (1 - k) / np.maximum(a, 1e-6), 0)
    # keep the line a soft warm black rather than pure black
    rgba = np.dstack([c + rgb * (255 - c) / 255 for c in (28, 25, 22)] + [a * 255]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA').crop(box)
    # premultiply before resampling so the white paper does not halo into the transparent surround
    arr = np.asarray(im).astype(np.float32)
    arr[..., :3] *= arr[..., 3:4] / 255
    pm = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA').resize((size, size), Image.LANCZOS)
    out = np.asarray(pm).astype(np.float32)
    al = out[..., 3:4]
    out[..., :3] = np.where(al > 0, out[..., :3] * 255 / np.maximum(al, 1), 0)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


# stroke weight at full size is ~13px; aim for >= ~1.4px after downscaling
plan = {256: 0, 128: 3, 64: 8, 48: 11, 40: 13, 32: 17, 24: 23, 20: 27, 16: 31}
images = {s: render(s, b) for s, b in plan.items()}
images[256].save(os.path.join(ROOT, 'build', 'icon.png'))
render(512, 0).save(os.path.join(ROOT, 'build', 'icon-512.png'))

# write the .ico by hand: one PNG-compressed entry per size
entries = []
for s in sorted(images):
    buf = io.BytesIO()
    images[s].save(buf, 'PNG')
    entries.append((s, buf.getvalue()))
head = struct.pack('<HHH', 0, 1, len(entries))
offset = 6 + 16 * len(entries)
dirs, blobs = b'', b''
for s, data in entries:
    dirs += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(data), offset + len(blobs))
    blobs += data
with open(os.path.join(ROOT, 'build', 'icon.ico'), 'wb') as f:
    f.write(head + dirs + blobs)
print('icon sizes', sorted(images))
