"""Reads brand/ pixels and writes src/brand/palette.json and src/brand/trace.json.
Run: python -I scripts/brand-extract.py   (needs Pillow, numpy, scipy)"""
import json, struct, glob, os
from collections import Counter
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = os.path.join(ROOT, 'brand')
OUT = os.path.join(ROOT, 'src', 'brand')
os.makedirs(OUT, exist_ok=True)

files = {}
for p in sorted(glob.glob(os.path.join(BRAND, '*'))):
    name = os.path.basename(p)
    raw = open(p, 'rb').read()
    info = {'bytes': len(raw)}
    if raw[:8] == b'\x89PNG\r\n\x1a\n':
        w, h, bd, ct, _, _, il = struct.unpack('>IIBBBBB', raw[16:29])
        info['ihdr'] = {'width': w, 'height': h, 'bitDepth': bd, 'colorType': ct, 'interlace': il}
    im = Image.open(p)
    rgba = np.array(im.convert('RGBA'))
    a = rgba[..., 3]
    info['alpha'] = {'min': int(a.min()), 'max': int(a.max()), 'opaque': int((a == 255).sum()), 'transparent': int((a == 0).sum()), 'partial': int(((a > 0) & (a < 255)).sum())}
    rgb = rgba[..., :3].reshape(-1, 3)
    visible = rgb[a.reshape(-1) > 0] if info['alpha']['transparent'] else rgb
    info['maxChannelSpread'] = int((visible.max(1).astype(int) - visible.min(1).astype(int)).max())
    c = Counter(map(tuple, visible))
    info['dominant'] = [{'hex': '#%02x%02x%02x' % k, 'count': n} for k, n in c.most_common(6)]
    info['gray_levels'] = {int(k[0]): n for k, n in c.items() if k[0] == k[1] == k[2]}
    files[name] = info

# Palette: pure-gray levels (r=g=b) that occur in BOTH the opaque PNG and the JPEG logo.
png = files['LOGO CREW PNG.png']['gray_levels']
jpg = files['LOGO CREW JPG.jpg.jpeg']['gray_levels']
common = sorted(set(png) & set(jpg))
want = {'ink': 0, 'n-950': 10, 'n-900': 20, 'n-850': 30, 'n-800': 40, 'n-700': 60, 'n-600': 90, 'n-500': 120, 'n-400': 150, 'n-300': 180, 'n-200': 215, 'n-100': 235, 'n-50': 245, 'paper': 254, 'white': 255}
tokens = {}
for name, lvl in want.items():
    if lvl not in common and lvl not in (0, 255):
        # snap to the nearest level that occurs in both files
        lvl = min(common, key=lambda x: abs(x - lvl))
    hexv = '#%02x%02x%02x' % (lvl, lvl, lvl)
    tokens[name] = {'hex': hexv, 'level': lvl, 'pngPixels': png.get(lvl, 0), 'jpegPixels': jpg.get(lvl, 0)}
json.dump({
    'method': 'gray levels (r=g=b) present in LOGO CREW PNG.png and LOGO CREW JPG.jpg.jpeg; anchors are the two dominant colours',
    'anchors': {'ink': '#000000 (95.6% of logo pixels)', 'paper': '#fefefe (dominant glyph colour)'},
    'files': {k: {kk: vv for kk, vv in v.items() if kk != 'gray_levels'} for k, v in files.items()},
    'tokens': tokens,
}, open(os.path.join(OUT, 'palette.json'), 'w'), indent=2)

# Trace: fit circles to the real glyph edge pixels of the opaque PNG.
im = np.array(Image.open(os.path.join(BRAND, 'LOGO CREW PNG.png')).convert('L')).astype(float)
mask = im > 127
lab, n = ndi.label(mask)
sizes = ndi.sum(mask, lab, range(1, n + 1))
keep = [i + 1 for i in np.argsort(-sizes)[:2]]
comps = sorted(keep, key=lambda k: np.where(lab == k)[0].min())  # head first (top), shoulders second


def fit_circle(pts):
    x, y = pts[:, 0], pts[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    b = x * x + y * y
    c, *_ = np.linalg.lstsq(A, b, rcond=None)
    return float(c[0]), float(c[1]), float(np.sqrt(c[2] + c[0] ** 2 + c[1] ** 2))


trace = {'canvas': [im.shape[1], im.shape[0]], 'source': 'LOGO CREW PNG.png'}
for key, k in zip(['head', 'shoulders'], comps):
    m = lab == k
    ys, xs = np.where(m)
    trace[key + 'Bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    edge = m & ~ndi.binary_erosion(m)
    filled = ndi.binary_fill_holes(m)
    inner = ndi.binary_dilation(~m & filled) & m if key == 'head' else None
    ey, ex = np.where(edge)
    pts = np.c_[ex, ey].astype(float)
    if key == 'head':
        outer = np.c_[np.where(edge & ~ndi.binary_dilation(~filled))[::-1]].astype(float) if False else None
        cx0 = (xs.min() + xs.max() + 1) / 2
        cy0 = (ys.min() + ys.max() + 1) / 2
        d = np.hypot(pts[:, 0] - cx0, pts[:, 1] - cy0)
        o = pts[d > (d.max() + d.min()) / 2]
        i = pts[d <= (d.max() + d.min()) / 2]
        trace['head'] = {'outer': fit_circle(o), 'inner': fit_circle(i)}
    else:
        cx0 = (xs.min() + xs.max() + 1) / 2
        cy0 = ys.max()
        d = np.hypot(pts[:, 0] - cx0, pts[:, 1] - cy0)
        flat = pts[:, 1] >= ys.max() - 1
        arc = pts[~flat]
        d = np.hypot(arc[:, 0] - cx0, arc[:, 1] - cy0)
        o = arc[d > (d.max() + d.min()) / 2]
        i = arc[d <= (d.max() + d.min()) / 2]
        trace['shoulders'] = {'outer': fit_circle(o), 'inner': fit_circle(i), 'cutY': int(ys.max()) + 1}
json.dump(trace, open(os.path.join(OUT, 'trace.json'), 'w'), indent=2)
print(json.dumps(trace, indent=1))
print(json.dumps({k: v['hex'] for k, v in tokens.items()}))

# Real pixel grid: 32x32 coverage of the glyph, same framing the favicon uses (glyph 22 units tall, centred).
bx0, by0 = min(trace['headBbox'][0], trace['shouldersBbox'][0]), trace['headBbox'][1]
bx1, by1 = max(trace['headBbox'][2], trace['shouldersBbox'][2]), trace['shouldersBbox'][3]
s = 22.0 / (by1 - by0)
side = 32.0 / s
cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
box = (int(round(cx - side / 2)), int(round(cy - side / 2)), int(round(cx + side / 2)), int(round(cy + side / 2)))
crop = Image.open(os.path.join(BRAND, 'LOGO CREW PNG.png')).convert('L').crop(box).resize((32, 32), Image.BOX)
cov = np.array(crop).astype(float) / 255.0
trace['grid32'] = [''.join(str(min(9, int(v * 9.999))) for v in row) for row in cov]
json.dump(trace, open(os.path.join(OUT, 'trace.json'), 'w'), indent=2)
print('\n'.join(trace['grid32']))
