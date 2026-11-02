# sample the rendered chart into a 25^3 LUT; apply a LUT to an image (trilinear)
import numpy as np
from PIL import Image
N, P, SIDE = 33, 12, 190

def lut_from_render(path, w=2280, h=2280):
    a = np.frombuffer(open(path, 'rb').read(), dtype='<u2').reshape(h, w, 4)[..., :3].astype(np.float32) / 65535
    # centre 4x4 of every 12px patch
    c = a.reshape(SIDE, P, SIDE, P, 3)[:, 4:8, :, 4:8, :].mean(axis=(1, 3))     # (190, 190, 3)
    flat = c.reshape(-1, 3)[:N ** 3]                                              # patch order = r + g*N + b*N*N
    return flat.reshape(N, N, N, 3)                                               # [b][g][r]

def apply(lut, img):
    x = img.astype(np.float32) / 255 * (N - 1)
    i0 = np.clip(np.floor(x).astype(int), 0, N - 2); f = x - i0
    r0, g0, b0 = i0[..., 0], i0[..., 1], i0[..., 2]
    fr, fg, fb = f[..., 0:1], f[..., 1:2], f[..., 2:3]
    def L(db, dg, dr): return lut[b0 + db, g0 + dg, r0 + dr]
    c00 = L(0, 0, 0) * (1 - fr) + L(0, 0, 1) * fr
    c01 = L(0, 1, 0) * (1 - fr) + L(0, 1, 1) * fr
    c10 = L(1, 0, 0) * (1 - fr) + L(1, 0, 1) * fr
    c11 = L(1, 1, 0) * (1 - fr) + L(1, 1, 1) * fr
    c0 = c00 * (1 - fg) + c01 * fg; c1 = c10 * (1 - fg) + c11 * fg
    return np.clip((c0 * (1 - fb) + c1 * fb) * 255 + .5, 0, 255).astype(np.uint8)
