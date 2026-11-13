"""Person matte (MediaPipe selfie multiclass): 1 = person, for putting app pieces behind Ali. Run on a frame range."""
import sys, os, glob, numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
src, out, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]); TOP = int(sys.argv[5]) if len(sys.argv) > 5 else 480; os.makedirs(out, exist_ok=True)
opts = vision.ImageSegmenterOptions(base_options=mpt.BaseOptions(model_asset_path=os.path.join(os.path.dirname(__file__), "../models/selfie_multiclass.tflite")),
                                    output_confidence_masks=True, output_category_mask=False)
seg = vision.ImageSegmenter.create_from_options(opts)
prev = None
for i in range(a, b + 1):
    f = f"{src}/{i:04d}.jpg"
    if not os.path.exists(f): break
    img = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB)
    # run on the upper part (where the pieces can overlap him), as a square crop so the model sees him big
    crop = img[TOP:TOP + 1080]                                           # 1080 x 1080
    r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(crop)))
    bgc = r.confidence_masks[0].numpy_view()                       # class 0 = background
    m = np.zeros(img.shape[:2], np.float32); m[TOP:TOP + 1080] = 1 - cv2.resize(bgc, (1080, 1080))
    m[TOP + 1080:] = 1.0 * (m[TOP + 1079:TOP + 1080] > 0.5)                           # below: carry the body down
    m = np.clip((m - 0.35) / 0.3, 0, 1)
    if prev is not None: m = 0.6 * m + 0.4 * prev                  # steady it over time
    prev = m
    cv2.imwrite(f"{out}/{i:04d}.png", (m * 255).astype(np.uint8))
print("done", a, b)
