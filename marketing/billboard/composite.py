# Put the LifeFlow billboard art onto the billboard in a real photo: perspective warp, the photo's softness, glow and
# grain, with the lamp post and the rooftop gear kept in front.  python3 composite.py <photo> <art.png> <out.jpg> <preset>
import sys, cv2, numpy as np
photo, art_p, out, preset = sys.argv[1:5]
P = {
  "wide": dict(quad=[(734.5, 1267.5), (1172.5, 1268.5), (1177, 1408.5), (742, 1438)], pole=(0.0761, 913.1, 2.6), blur=0.6, motion=2, noise=4.0, gain=1.22),
  "close": dict(quad=[(713.5, 1120.5), (1676, 1117.5), (1676, 1406), (719.5, 1477)], pole=None, blur=0.6, motion=2, noise=4.5, gain=1.18),
}[preset]
im = cv2.imread(photo).astype(np.float32); H, W = im.shape[:2]
art = cv2.imread(art_p).astype(np.float32)
q = np.float32(P["quad"]); qw = max(q[1][0] - q[0][0], q[2][0] - q[3][0]); qh = max(q[3][1] - q[0][1], q[2][1] - q[1][1])
# shrink the art to about twice its size in the photo first (clean downsampling), then warp
s = min(1.0, 2.2 * qw / art.shape[1]); art = cv2.resize(art, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
ah, aw = art.shape[:2]
M = cv2.getPerspectiveTransform(np.float32([(0, 0), (aw, 0), (aw, ah), (0, ah)]), q)
warp = cv2.warpPerspective(art, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
cover = cv2.warpPerspective(np.ones((ah, aw), np.float32), M, (W, H), flags=cv2.INTER_LINEAR)
# a lit sign: a touch brighter, the photo's softness (lens + the car moving sideways)
warp = np.clip(warp * P["gain"], 0, 255)
warp = cv2.GaussianBlur(warp, (0, 0), P["blur"])
k = np.zeros((1, P["motion"] * 2 + 1), np.float32); k[0, :] = 1 / k.size; warp = cv2.filter2D(warp, -1, k)
cover = cv2.GaussianBlur(cover, (0, 0), 0.6)
# what stands in front of the sign: the lamp post, and dark rooftop gear along the bottom edge
g = cv2.cvtColor(im.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
front = np.zeros((H, W), np.float32)
yy, xx = np.mgrid[0:H, 0:W]
pole = np.zeros((H, W), np.float32)
if P["pole"]:
    a, b, hw = P["pole"]; d = np.abs(xx - (a * yy + b)); pole = np.clip((hw / 2 + 0.75 - d), 0, 1)
bl, br = q[3], q[2]; bottom = bl[1] + (xx - bl[0]) * (br[1] - bl[1]) / (br[0] - bl[0])
front = np.maximum(front, ((yy > bottom - 34) & (g < 75)).astype(np.float32))
front = cv2.GaussianBlur(front, (0, 0), 0.8) * cover
alpha = np.clip(cover - front, 0, 1)[..., None]
outim = im * (1 - alpha) + warp * alpha
pa = (cv2.GaussianBlur(pole, (0, 0), 0.6) * cover)[..., None]; outim = outim * (1 - pa) + np.float32([78, 74, 70]) * pa
# the sign's light spilling into the night around it
glow = cv2.GaussianBlur(warp * cover[..., None], (0, 0), 14) * 0.22
outim = outim + glow * (1 - alpha)
# grain to match the phone photo
rng = np.random.default_rng(3); outim = outim + rng.normal(0, P["noise"], outim.shape).astype(np.float32) * alpha
cv2.imwrite(out, np.clip(outim, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 94])
x0, x1 = int(min(q[:, 0])) - 120, int(max(q[:, 0])) + 120; y0, y1 = int(min(q[:, 1])) - 90, int(max(q[:, 1])) + 90
cv2.imwrite(out.replace(".jpg", "_zoom.png"), np.clip(outim, 0, 255).astype(np.uint8)[max(0, y0):y1, max(0, x0):min(W, x1)])
print("ok", out)
