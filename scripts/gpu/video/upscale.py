#!/usr/bin/env python3
"""Sharpen a clip to at least 1080 x 1920 (or any target) on a GPU: RealESRGAN x2 on every frame, then a Lanczos resize
to the target. The sound, the frame rate and the number of frames are kept exactly as they are (the audio is copied, not
re-encoded). 2x plus Lanczos rather than 4x: 4x smooths skin until faces look waxy.

  python upscale.py --in clip.mp4 --out clip-1080.mp4 --weights RealESRGAN_x2plus.pth [--width 1080 --height 1920]

Needs torch, spandrel and ffmpeg. Weights: https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth
(BSD 3-Clause). Prints one line of numbers at the end.
"""
import argparse, json, subprocess, sys, time

import numpy as np
import torch
from spandrel import ModelLoader

ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="src", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--weights", required=True)
ap.add_argument("--width", type=int, default=1080)
ap.add_argument("--height", type=int, default=1920)
ap.add_argument("--batch", type=int, default=4)
ap.add_argument("--crf", type=int, default=14)
ap.add_argument("--max-frames", type=int, default=0, help="for a quick test: stop after this many frames")
a = ap.parse_args()

probe = json.loads(subprocess.check_output(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", a.src]))["streams"][0]
w, h, rate = probe["width"], probe["height"], probe["r_frame_rate"]
dev = "cuda" if torch.cuda.is_available() else "cpu"
half = dev == "cuda"
model = ModelLoader().load_from_file(a.weights).model.eval().to(dev)
if half:
    model = model.half()
scale = 2
# fill the target, then cut the few pixels that stick out: the picture is never stretched
k = max(a.width / (w * scale), a.height / (h * scale))
sw, sh = int(np.ceil(w * scale * k / 2) * 2), int(np.ceil(h * scale * k / 2) * 2)
vf = f"scale={sw}:{sh}:flags=lanczos,crop={a.width}:{a.height}"

reader = subprocess.Popen(["ffmpeg", "-v", "error", "-i", a.src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
writer = subprocess.Popen(
    ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w * scale}x{h * scale}", "-r", rate, "-i", "-",
     "-i", a.src, "-map", "0:v:0", "-map", "1:a:0?", "-vf", vf, "-c:v", "libx264", "-crf", str(a.crf), "-preset", "medium", "-pix_fmt", "yuv420p",
     "-c:a", "copy", "-movflags", "+faststart", *(["-shortest"] if a.max_frames else []), a.out],
    stdin=subprocess.PIPE)

t0, n, size = time.time(), 0, w * h * 3


def flush(frames):
    x = torch.from_numpy(np.stack(frames)).to(dev).permute(0, 3, 1, 2)
    x = (x.half() if half else x.float()) / 255.0
    with torch.inference_mode():
        y = model(x).clamp_(0, 1)
    writer.stdin.write((y * 255.0).round().byte().permute(0, 2, 3, 1).contiguous().cpu().numpy().tobytes())


batch = []
while True:
    raw = reader.stdout.read(size)
    if len(raw) < size or (a.max_frames and n >= a.max_frames):
        break
    batch.append(np.frombuffer(raw, np.uint8).reshape(h, w, 3))
    n += 1
    if len(batch) == a.batch:
        flush(batch)
        batch = []
if batch:
    flush(batch)
reader.kill()
writer.stdin.close()
rc = writer.wait()
secs = time.time() - t0
print(f"UPSCALE {a.src} -> {a.out}: {w}x{h} to {a.width}x{a.height}, {n} frames at {rate}, {secs:.1f}s ({secs / max(n, 1):.3f}s a frame) on {dev}, encoder exit {rc}")
sys.exit(rc)
