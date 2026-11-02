# 33^3 colour chart: 190 x 190 uniform 12 px patches (the last 163 are padding), index = r + g*33 + b*1089
import numpy as np
from PIL import Image
import sys
N, P, SIDE = 33, 12, 190
idx = np.arange(SIDE * SIDE)
k = np.minimum(idx, N ** 3 - 1)
r, g, b = k % N, (k // N) % N, k // (N * N)
lv = np.round(np.arange(N) / (N - 1) * 255).astype(np.uint8)
cols = np.stack([lv[r], lv[g], lv[b]], 1)
img = cols.reshape(SIDE, SIDE, 3).repeat(P, 0).repeat(P, 1)
import os
here = os.path.dirname(os.path.abspath(__file__))
Image.fromarray(img, 'RGB').save(sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'chart33.png'))
# and the 18% grey card the exposure is calibrated on (sRGB 118 = 18% linear)
Image.new('RGB', (512, 512), (118, 118, 118)).save(os.path.join(here, 'grey.png'))
print(img.shape)
