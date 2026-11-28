#!/usr/bin/env python3
"""Pin a real app recording onto a green phone screen in generated footage.

usage: phone_screen.py <shot.mp4> <out.mp4> <app clip 1> [<app clip 2> ...] [--switch 3.5,6.0] [--dim 0.85] [--start 0]

The phone screen in the shot is pure chroma green. Every frame: find the green area, fit its four corners (smoothed over
time so the screen doesn't jitter), warp the current app frame onto it, and use the green mask itself as the alpha, so a
thumb or finger over the screen stays in front and the rounded corners follow the phone. Green spill on the edges is
removed. App clips play one after another; --switch gives the shot times (seconds) where the next clip starts.
Frames with no green (phone out of view) pass through unchanged. Writes video only; the sound is mixed later.
"""
import subprocess
import sys

import cv2
import numpy as np


def frames_of(path):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        out.append(f)
    return out, fps


def order(pts):
    pts = np.array(pts, dtype=np.float32).reshape(4, 2)
    s = pts.sum(1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def green_mask(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (40, 90, 70), (88, 255, 255))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return m


def quad_of(mask):
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None, 0
    c = max(cnts, key=cv2.contourArea)
    area = cv2.contourArea(c)
    if area < 2500:
        return None, area
    hull = cv2.convexHull(c)
    for eps in (0.02, 0.03, 0.04, 0.06, 0.08):
        ap = cv2.approxPolyDP(hull, eps * cv2.arcLength(hull, True), True)
        if len(ap) == 4:
            return order(ap), area
    return order(cv2.boxPoints(cv2.minAreaRect(hull))), area


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def zoom_at(keys, t):
    """keys: [(t, z), ...] sorted. Eased between keys, held outside."""
    if not keys:
        return 1.0
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, z0), (t1, z1) in zip(keys, keys[1:]):
        if t <= t1:
            return z0 + (z1 - z0) * smooth((t - t0) / max(1e-6, t1 - t0))
    return keys[-1][1]


def fit_app(app, q):
    """Crop the app frame to the screen's own shape (no stretching), keeping the top of the screen."""
    wq = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
    hq = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
    ah, aw = app.shape[:2]
    target = wq / max(1.0, hq)
    if aw / ah < target:  # screen is wider than the app: show the top part of the app
        nh = int(round(aw / target))
        app = app[:nh]
    else:
        nw = int(round(ah * target))
        x0 = (aw - nw) // 2
        app = app[:, x0 : x0 + nw]
    # pre-shrink close to the final size so small text stays clean
    th = max(8, int(hq * 1.5))
    if app.shape[0] > th:
        app = cv2.resize(app, (int(app.shape[1] * th / app.shape[0]), th), interpolation=cv2.INTER_AREA)
    return app


def composite(f, q_hint, app, dim):
    """Find the screen again on this exact frame (no lag), near where the tracker expects it, then pin the app."""
    h, w = f.shape[:2]
    m_all = green_mask(f)
    # keep only the green blob(s) around the expected screen (teal water or foliage elsewhere stays untouched)
    c0 = q_hint.mean(0)
    hint = np.zeros_like(m_all)
    cv2.fillConvexPoly(hint, (c0 + (q_hint - c0) * 1.35).astype(np.int32), 255)
    m = cv2.bitwise_and(m_all, hint)
    # keep only the screen itself: the biggest green shape (plus anything inside its outline, e.g. around a thumb)
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if cnts:
        big = max(cnts, key=cv2.contourArea)
        keep = np.zeros_like(m)
        cv2.fillConvexPoly(keep, cv2.convexHull(big), 255)
        m = cv2.bitwise_and(m, keep)
    q, _ = quad_of(m)
    if q is None:
        q = q_hint
    c = q.mean(0)
    app = fit_app(app, q)
    ah, aw = app.shape[:2]
    qg = c + (q - c) * 1.03
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [aw, 0], [aw, ah], [0, ah]]), qg.astype(np.float32))
    warped = cv2.warpPerspective(app, M, (w, h), flags=cv2.INTER_LINEAR).astype(np.float32) * dim
    a = cv2.dilate(m, np.ones((3, 3), np.uint8), 1)
    a = cv2.GaussianBlur(a, (3, 3), 0).astype(np.float32) / 255.0
    base = f.astype(np.float32)
    edge = cv2.dilate(m, np.ones((15, 15), np.uint8), 1) > 0
    g = base[..., 1]
    lim = np.maximum(base[..., 0], base[..., 2])
    base[..., 1] = np.where(edge & (g > lim), lim, g)
    o = base * (1 - a[..., None]) + warped * a[..., None]
    # any green left on the screen or its edge becomes the phone's dark bezel
    rim = cv2.dilate(m, np.ones((11, 11), np.uint8), 1) > 0
    gr = (o[..., 1] > np.maximum(o[..., 0], o[..., 2]) + 25) & rim
    gr = cv2.dilate(gr.astype(np.uint8), np.ones((3, 3), np.uint8), 1) > 0
    o[gr] = o[gr] * 0.15 + np.array([18, 18, 20], np.float32) * 0.85
    # soften the edge where a thumb crosses the screen
    band = (cv2.dilate(m, np.ones((5, 5), np.uint8)) > 0) & (cv2.erode(m, np.ones((5, 5), np.uint8)) == 0)
    soft = cv2.GaussianBlur(o, (5, 5), 0)
    o[band] = soft[band]
    return np.clip(o, 0, 255).astype(np.uint8)


def main():
    args = sys.argv[1:]
    opts = {"--switch": "", "--dim": "1.0", "--start": "0", "--zoom": ""}
    pos = []
    i = 0
    while i < len(args):
        if args[i] in opts:
            opts[args[i]] = args[i + 1]
            i += 2
        else:
            pos.append(args[i])
            i += 1
    shot, out, apps = pos[0], pos[1], pos[2:]
    switches = [float(x) for x in opts["--switch"].split(",") if x]
    dim = float(opts["--dim"])
    start = float(opts["--start"])
    # --zoom "t:z,t:z,..." pushes in on the phone (a game's phone view); the app is composited after the zoom so it stays sharp
    keys = sorted((float(a), float(b)) for a, b in (k.split(":") for k in opts["--zoom"].split(",") if k))
    zmax = max([z for _, z in keys] + [1.0])

    src, fps = frames_of(shot)
    clips = [frames_of(a)[0] for a in apps]
    h, w = src[0].shape[:2]
    prev = None
    ctr = None
    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
         "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-pix_fmt", "yuv420p", out],
        stdin=subprocess.PIPE,
    )
    clip_start = [start] + switches
    found = 0
    for n, f in enumerate(src):
        t = n / fps
        k = max(j for j in range(len(clip_start)) if j < len(clips) and t >= clip_start[j]) if t >= clip_start[0] else 0
        clip = clips[k]
        ai = min(len(clip) - 1, int((t - clip_start[k]) * 30)) if t >= clip_start[k] else 0
        app = clip[max(0, ai)]
        q, area = quad_of(green_mask(f))
        if q is not None:
            found += 1
            if prev is not None and np.abs(q - prev).max() < 40:
                q = prev * 0.55 + q * 0.45  # smooth small jitter, follow big moves
            prev = q
        else:
            prev = None
        z = zoom_at(keys, t)
        if q is not None:
            pc = q.mean(0)
            ctr = pc if ctr is None else ctr * 0.8 + pc * 0.2  # the camera follows the phone gently
        if z > 1.001:
            big = cv2.resize(f, (int(w * z), int(h * z)), interpolation=cv2.INTER_CUBIC)
            p = (z - 1) / max(1e-6, zmax - 1)
            fc = np.array([w / 2, h / 2]) * z
            tc = (ctr if ctr is not None else np.array([w / 2, h / 2])) * z
            cc = fc + (tc - fc) * p
            x0 = int(min(max(0, cc[0] - w / 2), big.shape[1] - w))
            y0 = int(min(max(0, cc[1] - h / 2), big.shape[0] - h))
            if q is not None:
                big = composite(big, q * z, app, dim)
            frame = big[y0 : y0 + h, x0 : x0 + w]
        else:
            frame = composite(f, q, app, dim) if q is not None else f
        enc.stdin.write(np.ascontiguousarray(frame).tobytes())
    enc.stdin.close()
    enc.wait()
    print(f"{out}: {len(src)} frames, phone found in {found}")


if __name__ == "__main__":
    main()
