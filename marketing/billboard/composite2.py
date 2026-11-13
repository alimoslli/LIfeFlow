# Print the art onto the billboard in the photo: the art is treated as the vinyl's colour (albedo) and lit by the real
# light measured on the old billboard (floodlight falloff, texture, colour cast, grain), then the phone's own processing.
# python3 composite2.py <photo> <art.png> <out.jpg> wide|close
import sys, cv2, numpy as np
photo, art_p, out, preset = sys.argv[1:5]
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
alb = cv2.warpPerspective(lin(art), M, (W, H), flags=cv2.INTER_LINEAR)
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
# the camera: a touch soft, a little sideways motion
lit = alb * light
lit = cv2.GaussianBlur(lit, (0, 0), P["soft"]); k = np.full((1, 2 * P["motion"] + 1), 1 / (2 * P["motion"] + 1), np.float32); lit = cv2.filter2D(lit, -1, k)
new = srgb(np.clip(lit, 0, 1.4))
# what stands in front: rooftop gear along the bottom, the lamp post redrawn
g = cv2.cvtColor(im8, cv2.COLOR_BGR2GRAY).astype(np.float32); yy, xx = np.mgrid[0:H, 0:W]
bl, br = q[3], q[2]; bottom = bl[1] + (xx - bl[0]) * (br[1] - bl[1]) / (br[0] - bl[0])
front = cv2.GaussianBlur(((yy > bottom - 34) & (g < 75)).astype(np.float32), (0, 0), 0.8) * cover
alpha = np.clip(cover - front, 0, 1)[..., None]
o = im * (1 - alpha) + new * alpha
if P["pole"]:
    a, b, hw = P["pole"]; d = np.abs(xx - (a * yy + b)); pa = (cv2.GaussianBlur(np.clip(hw / 2 + 0.75 - d, 0, 1), (0, 0), 0.6) * cover)[..., None]
    o = o * (1 - pa) + np.float32([78, 74, 70]) / 255 * pa
# the phone's processing: light sharpening and JPEG
blur = cv2.GaussianBlur(o, (0, 0), 1.2); o = np.clip(o + 0.35 * (o - blur) * alpha, 0, 1)
cv2.imwrite(out, (o * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 88])
x0, x1 = int(min(q[:, 0])) - 120, int(max(q[:, 0])) + 120; y0, y1 = int(min(q[:, 1])) - 90, int(max(q[:, 1])) + 90
cv2.imwrite(out.replace(".jpg", "_zoom.png"), (o * 255).astype(np.uint8)[max(0, y0):y1, max(0, x0):min(W, x1)])
print("ok", out, "white px", int(white.sum()), "grain sd %.4f" % sd, "light", np.round(coef[0], 3))
