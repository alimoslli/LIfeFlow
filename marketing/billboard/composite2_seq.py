# Print the art onto the billboard in the photo: the art is treated as the vinyl's colour (albedo) and lit by the real
# light measured on the old billboard (floodlight falloff, texture, colour cast, grain), then the phone's own processing.
# python3 composite2.py <photo> <art.png> <out.jpg> wide|close
import sys, cv2, numpy as np
photo, seqdir, outdir, preset = sys.argv[1:5]
import glob, os; os.makedirs(outdir, exist_ok=True); files = sorted(glob.glob(seqdir + '/*.png')); art_p = files[0]
P = {"wide": dict(quad=[(734.5, 1267.5), (1172.5, 1268.5), (1177, 1408.5), (742, 1438)], pole=(0.0761, 913.1, 2.6), soft=0.75, motion=2),
     "close": dict(quad=[(713.5, 1120.5), (1676, 1117.5), (1676, 1406), (719.5, 1477)], pole=None, soft=0.7, motion=2)}[preset]
lin = lambda x: np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
srgb = lambda x: np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)
im8 = cv2.imread(photo); H, W = im8.shape[:2]; im = im8.astype(np.float32) / 255
q = np.float32(P["quad"])
art = cv2.imread(art_p).astype(np.float32) / 255
qw = q[1][0] - q[0][0]; s = min(1.0, 2.2 * qw / art.shape[1]); art = cv2.resize(art, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
ah, aw = art.shape[:2]
M = cv2.getPerspectiveTransform(np.float32([(0, 0), (aw, 0), (aw, ah), (0, ah)]), q)
cover = cv2.GaussianBlur(cv2.warpPerspective(np.ones((ah, aw), np.float32), M, (W, H)), (0, 0), 0.6)
# the light on the old billboard: fit a smooth floodlight field to the pixels that were plain white vinyl
L = lin(im); v = im.max(2); sat = (v - im.min(2)) / np.maximum(v, 1e-3)
white = ((v > 0.55) & (sat < 0.22)).astype(np.uint8) * (cover > 0.9)
white = cv2.erode(white.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
Minv = np.linalg.inv(M); ys, xs = np.nonzero(white)
sel = np.random.default_rng(1).choice(len(xs), min(60000, len(xs)), replace=False); xs, ys = xs[sel], ys[sel]
def uv(x, y):
    d = Minv[2, 0] * x + Minv[2, 1] * y + Minv[2, 2]
    return (Minv[0, 0] * x + Minv[0, 1] * y + Minv[0, 2]) / d / aw, (Minv[1, 0] * x + Minv[1, 1] * y + Minv[1, 2]) / d / ah
def feats(u, v): return np.stack([np.ones_like(u), u, v, u * u, u * v, v * v, u ** 3, u * u * v, u * v * v, v ** 3], -1)
u, vv = uv(xs.astype(np.float64), ys.astype(np.float64)); F = feats(u, vv)
illum_s = L[ys, xs] / 0.88
coef = np.linalg.lstsq(F, illum_s, rcond=None)[0]
yy0, xx0 = np.mgrid[0:H, 0:W]; U, V = uv(xx0.astype(np.float64), yy0.astype(np.float64))
light = (feats(U, V) @ coef).astype(np.float32)
light = np.clip(light, 0.05, None)
# grain of the same strength as the photo had on that vinyl
hp = (L - cv2.GaussianBlur(L, (0, 0), 1.5))[white]; sd = float(np.sqrt((hp ** 2).mean()))
grain = cv2.GaussianBlur(np.random.default_rng(9).normal(0, sd, (H, W, 3)).astype(np.float32), (0, 0), 0.6) * 1.6
light = light * (1 + grain * 2.0)

g = cv2.cvtColor(im8, cv2.COLOR_BGR2GRAY).astype(np.float32); yy, xx = np.mgrid[0:H, 0:W]
bl, br = q[3], q[2]; bottom = bl[1] + (xx - bl[0]) * (br[1] - bl[1]) / (br[0] - bl[0])
front = cv2.GaussianBlur(((yy > bottom - 34) & (g < 75)).astype(np.float32), (0, 0), 0.8) * cover
alpha = np.clip(cover - front, 0, 1)[..., None]
k = np.full((1, 2 * P["motion"] + 1), 1 / (2 * P["motion"] + 1), np.float32)
CX, CY, N = 1080.0, 1290.0, len(files)
for i, f in enumerate(files):
    a = cv2.resize(cv2.imread(f).astype(np.float32) / 255, (aw, ah), interpolation=cv2.INTER_AREA)
    lit = cv2.warpPerspective(lin(a), M, (W, H), flags=cv2.INTER_LINEAR) * light * (1 + np.random.default_rng(i).normal(0, sd, (H, W, 1)).astype(np.float32))
    lit = cv2.filter2D(cv2.GaussianBlur(lit, (0, 0), P["soft"]), -1, k)
    o = im * (1 - alpha) + srgb(np.clip(lit, 0, 1.4)) * alpha
    bl2 = cv2.GaussianBlur(o, (0, 0), 1.2); o = np.clip(o + 0.35 * (o - bl2) * alpha, 0, 1)
    z = 1.0 + 0.07 * (i / max(1, N - 1)) ** 0.9; cw, ch = W / z, H / z
    x0 = min(max(CX - cw / 2, 0), W - cw); y0 = min(max(CY - ch / 2, 0), H - ch)
    Z = np.float32([[z * 1080 / W, 0, -x0 * z * 1080 / W], [0, z * 1920 / H, -y0 * z * 1920 / H]])
    cv2.imwrite(f"{outdir}/{i + 1:04d}.jpg", (cv2.warpAffine(o, Z, (1080, 1920), flags=cv2.INTER_AREA) * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
print("frames", N)
