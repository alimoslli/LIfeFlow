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


def main():
    args = sys.argv[1:]
    opts = {"--switch": "", "--dim": "1.0", "--start": "0"}
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

    src, fps = frames_of(shot)
    clips = [frames_of(a)[0] for a in apps]
    h, w = src[0].shape[:2]
    prev = None
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
        m = green_mask(f)
        q, area = quad_of(m)
        if q is None:
            prev = None
            enc.stdin.write(f.tobytes())
            continue
        found += 1
        if prev is not None and np.abs(q - prev).max() < 40:
            q = prev * 0.55 + q * 0.45  # smooth small jitter, follow big moves
        prev = q
        ah, aw = app.shape[:2]
        # the green area is the visible screen; grow the quad a touch so the app reaches under the rounded corners
        c = q.mean(0)
        qg = c + (q - c) * 1.03
        M = cv2.getPerspectiveTransform(np.float32([[0, 0], [aw, 0], [aw, ah], [0, ah]]), qg.astype(np.float32))
        warped = cv2.warpPerspective(app, M, (w, h), flags=cv2.INTER_CUBIC)
        warped = np.clip(warped.astype(np.float32) * dim, 0, 255)
        # only the phone: keep the green mask inside the screen quad (teal water or foliage elsewhere stays untouched)
        region = np.zeros_like(m)
        cv2.fillConvexPoly(region, (c + (q - c) * 1.08).astype(np.int32), 255)
        m = cv2.bitwise_and(m, region)
        # soft alpha from the green mask, slightly grown into the anti-aliased edge
        a = cv2.dilate(m, np.ones((3, 3), np.uint8), 1)
        a = cv2.GaussianBlur(a, (3, 3), 0).astype(np.float32) / 255.0
        # a faint glass sheen across the screen, top-left to bottom-right
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        sheen = np.clip(1 - np.abs(((xx - c[0]) + (yy - c[1]) * 0.6) / (w * 0.9)), 0, 1) ** 6 * 18
        comp = warped + sheen[..., None]
        base = f.astype(np.float32)
        # remove green spill from the border around the screen
        edge = cv2.dilate(m, np.ones((9, 9), np.uint8), 1) > 0
        g = base[..., 1]
        lim = np.maximum(base[..., 0], base[..., 2])
        base[..., 1] = np.where(edge & (g > lim), lim, g)
        o = base * (1 - a[..., None]) + comp * a[..., None]
        enc.stdin.write(np.clip(o, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()
    print(f"{out}: {len(src)} frames, phone found in {found}")


if __name__ == "__main__":
    main()
