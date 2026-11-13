"""Track the camera in a clip: per frame, the similarity transform (scale, rotation, shift) that maps reference-frame
coordinates (frame 1) to this frame, from background features only (the person is masked out)."""
import cv2, numpy as np, glob, json, sys
src, out, box = sys.argv[1], sys.argv[2], [int(v) for v in sys.argv[3].split(',')]  # person box x0,y0,x1,y1 (1080x1920)
fs = sorted(glob.glob(src + '/*.jpg'))
S = 0.5  # track at half size
def gray(f): return cv2.resize(cv2.imread(f, cv2.IMREAD_GRAYSCALE), None, fx=S, fy=S, interpolation=cv2.INTER_AREA)
mask = np.full((int(1920*S), int(1080*S)), 255, np.uint8)
x0, y0, x1, y1 = [int(v*S) for v in box]; mask[y0:y1, x0:x1] = 0
prev = gray(fs[0]); M = np.eye(3); mats = [M[:2].tolist()]; nin = []
for f in fs[1:]:
    cur = gray(f)
    p0 = cv2.goodFeaturesToTrack(prev, 600, 0.005, 8, mask=mask, blockSize=5)
    p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, cur, p0, None, winSize=(21, 21), maxLevel=4)
    pb, _, _ = cv2.calcOpticalFlowPyrLK(cur, prev, p1, None, winSize=(21, 21), maxLevel=4)
    ok = (st[:, 0] == 1) & (np.linalg.norm((pb - p0).reshape(-1, 2), axis=1) < 0.5)
    a, b = p0[ok].reshape(-1, 2) / S, p1[ok].reshape(-1, 2) / S
    A, inl = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=1.5, maxIters=4000)
    if A is None: A = np.array([[1, 0, 0], [0, 1, 0]], float)
    nin.append(int(inl.sum()) if inl is not None else 0)
    M = np.vstack([A, [0, 0, 1]]) @ M
    mats.append(M[:2].tolist()); prev = cur
json.dump(mats, open(out, 'w'))
t = np.array([[m[0][2], m[1][2]] for m in mats]); r = np.degrees([np.arctan2(m[1][0], m[0][0]) for m in mats])
print(len(mats), 'frames; inliers min/med', min(nin), int(np.median(nin)), '; shift range', t.min(0).round(1), t.max(0).round(1), '; rot range', r.min().round(2), r.max().round(2))
