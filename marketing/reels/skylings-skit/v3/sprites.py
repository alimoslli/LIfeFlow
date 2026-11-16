"""The skylings' frames (the kit's exports of the app's own pixel art, 26 x 26) and a talking frame for each: the idle frame
with only the mouth pixels of the app's own open-mouth frame (celebrate, last frame), so eyes stay open while it talks."""
import glob, os, numpy as np
from PIL import Image
SP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = f"{SP}/kit/lifeflow-brand/assets/skylings_animated"
_c = {}
def kit(nm, pose):
    if (nm, pose) not in _c: _c[(nm, pose)] = [np.array(Image.open(f).convert("RGBA"))[40::40, 40::40].copy() for f in sorted(glob.glob(f"{K}/{nm}_{pose}/*.png"))]
    return _c[(nm, pose)]
def talk_frame(nm):
    """idle0 + the open mouth from celebrate[3] (which sits one row higher)"""
    key = (nm, "_talk")
    if key in _c: return _c[key]
    idle = kit(nm, "idle")[0]; cel = np.roll(kit(nm, "celebrate")[3], 1, axis=0); out = idle.copy()
    pink = (cel[..., :3] == (224, 122, 122)).all(-1) & (cel[..., 3] > 0)          # the open mouth's inside, in the app's own pink
    pr, pc = np.where(pink); box = np.zeros((26, 26), bool); box[pr.min() - 1:pr.max() + 2, pc.min() - 2:pc.max() + 3] = True
    diff = box & (idle[..., 3] > 0) & (cel[..., 3] > 0) & (np.abs(idle[..., :3].astype(int) - cel[..., :3].astype(int)).sum(-1) > 0)
    out[diff] = cel[diff]; _c[key] = [out]; return _c[key]
FIVE = ["Dawn", "Ray", "Goldie", "Twinkle-night", "Dreamy-night"]
if __name__ == "__main__":
    from PIL import ImageDraw
    S = 12; sheet = Image.new("RGBA", (5 * 3 * (26 * S + 8), 26 * S + 8), (20, 36, 81, 255))
    for j, nm in enumerate(FIVE):
        for q, a in enumerate([kit(nm, "idle")[0], talk_frame(nm)[0], kit(nm, "celebrate")[3]]):
            sheet.alpha_composite(Image.fromarray(a).resize((26 * S, 26 * S), Image.NEAREST), ((j * 3 + q) * (26 * S + 8) + 4, 4))
    sheet.convert("RGB").resize((sheet.width // 2, sheet.height // 2)).save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "talk_check.jpg"), quality=92)
    for nm in FIVE:
        d = (kit(nm, "idle")[0] != talk_frame(nm)[0]).any(-1); print(nm, "mouth pixels changed:", int(d.sum()), "rows", sorted(set(np.where(d)[0].tolist())), "cols", sorted(set(np.where(d)[1].tolist())))
