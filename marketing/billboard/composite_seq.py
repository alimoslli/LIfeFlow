# The animated billboard on the close-up photo: the same warp, softness, glow and grain per frame, a slow push-in.
import sys, glob, os, cv2, numpy as np
seq, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
im = cv2.imread("in/close.jpg").astype(np.float32); H, W = im.shape[:2]
q = np.float32([(713.5, 1120.5), (1676, 1117.5), (1676, 1406), (719.5, 1477)])
files = sorted(glob.glob(seq + "/*.png")); a0 = cv2.imread(files[0])
qw = q[1][0] - q[0][0]; s = min(1.0, 2.2 * qw / a0.shape[1]); ah, aw = int(round(a0.shape[0] * s)), int(round(a0.shape[1] * s))
M = cv2.getPerspectiveTransform(np.float32([(0, 0), (aw, 0), (aw, ah), (0, ah)]), q)
cover = cv2.GaussianBlur(cv2.warpPerspective(np.ones((ah, aw), np.float32), M, (W, H)), (0, 0), 0.6)
g = cv2.cvtColor(im.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32); yy, xx = np.mgrid[0:H, 0:W]
bl, br = q[3], q[2]; bottom = bl[1] + (xx - bl[0]) * (br[1] - bl[1]) / (br[0] - bl[0])
front = cv2.GaussianBlur(((yy > bottom - 34) & (g < 75)).astype(np.float32), (0, 0), 0.8) * cover
alpha = np.clip(cover - front, 0, 1)[..., None]
k = np.full((1, 5), 1 / 5, np.float32); rng = np.random.default_rng(5)
CX, CY, N = 1080.0, 1290.0, len(files)
for i, f in enumerate(files):
    art = cv2.resize(cv2.imread(f).astype(np.float32), (aw, ah), interpolation=cv2.INTER_AREA)
    warp = np.clip(cv2.warpPerspective(art, M, (W, H)) * 1.18, 0, 255)
    warp = cv2.filter2D(cv2.GaussianBlur(warp, (0, 0), 0.6), -1, k)
    o = im * (1 - alpha) + warp * alpha
    o = o + cv2.GaussianBlur(warp * cover[..., None], (0, 0), 14) * 0.22 * (1 - alpha)
    o = o + rng.normal(0, 4.0, o.shape).astype(np.float32) * 0.8
    z = 1.0 + 0.07 * (i / max(1, N - 1)) ** 0.9; cw, ch = W / z, H / z
    x0 = min(max(CX - cw / 2, 0), W - cw); y0 = min(max(CY - ch / 2, 0), H - ch)
    Z = np.float32([[z * 1080 / W, 0, -x0 * z * 1080 / W], [0, z * 1920 / H, -y0 * z * 1920 / H]])
    frame = cv2.warpAffine(np.clip(o, 0, 255), Z, (1080, 1920), flags=cv2.INTER_AREA)
    cv2.imwrite(f"{out}/{i + 1:04d}.jpg", frame.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 93])
print("frames", N)
