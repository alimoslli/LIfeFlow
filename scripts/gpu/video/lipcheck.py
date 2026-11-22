#!/usr/bin/env python3
"""A rough, hearing-free check of lip sync: how well does the mouth's opening follow the voice's loudness, and at what
shift between the two? Prints, per clip, the shift (in ms) where they match best and the match at no shift. A natural clip
has the mouth leading the sound by about 40 ms. It measures opening against loudness, not the shapes of the sounds, so it
catches a voice that is early or late and a mouth that ignores the voice; it cannot tell good sync from perfect sync.

  python lipcheck.py clip1.mp4 [clip2.mp4 ...]     needs mediapipe, opencv, ffmpeg and the face model next to it as fl.task
  (https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
"""
import sys, subprocess, numpy as np, cv2, mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision
opts = vision.FaceLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path='fl.task'), num_faces=1)
def curve(path):
    det = vision.FaceLandmarker.create_from_options(opts)
    cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS); mar = []
    while True:
        ok, fr = cap.read()
        if not ok: break
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)))
        p = np.array([[l.x * fr.shape[1], l.y * fr.shape[0]] for l in r.face_landmarks[0]])
        mar.append(np.linalg.norm(p[13] - p[14]) / np.linalg.norm(p[61] - p[291]))
    m = np.array(mar); n = len(m)
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'])
    a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    # finer than a frame: loudness every 10 ms, mouth interpolated to the same grid
    step = 160; e = np.array([np.sqrt(np.mean(a[i:i + 400] ** 2) + 1e-12) for i in range(0, len(a) - 400, step)])
    t = np.arange(len(e)) * 0.01 + 0.0125
    mi = np.interp(t, (np.arange(n) + 0.5) / fps, m)
    out = {}
    for ms in range(-200, 201, 20):
        k = ms // 10
        x, y = (mi[:len(mi) - k], e[k:]) if k >= 0 else (mi[-k:], e[:len(e) + k])
        out[ms] = float(np.corrcoef(x, y)[0, 1])
    return out
for p in sys.argv[1:]:
    c = curve(p); b = max(c, key=c.get)
    print(p.split('/')[-1], 'best', b, 'ms', round(c[b], 2), '| at 0:', round(c[0], 2), '|', ' '.join(f'{k}:{v:.2f}' for k, v in c.items() if -120 <= k <= 160))
