"""Make a LifeFlow pixel cloud with words inside, exactly like the app's idea clouds.

    python3 make_cloud.py "Plan my week" out.png [--shape 1|2|3] [--night] [--zoom 4]

How the app draws them (skylings.css .lf-idea-cloud, cloud-tile.ts): one of three pixel tiles (48 x 21) stretched
around the words like a CSS border-image, each tile pixel = 2 screen pixels; the words in Geist SemiBold 13 px,
color #13213D, centered, allowed to sit under the puffs with 14 px kept clear at each end; the cloud is only as wide
as the words; a soft shadow 4 px under it. --zoom scales the whole thing (4 = 4x the phone size, crisp for video).
"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TILES = json.load(open(os.path.join(HERE, "tiles.json")))


def make_cloud(text, shape=1, night=False, zoom=4):
    s = TILES[f"tile-{shape}"]
    T, R, B, L = s["top"], s["right"], s["bottom"], s["left"]
    tile = Image.open(os.path.join(HERE, f"tile-{shape}-{'night' if night else 'day'}.png")).convert("RGBA")
    font = ImageFont.truetype(os.path.join(HERE, "Geist-SemiBold.ttf"), round(13 * zoom))
    tw = font.getlength(text) / zoom                      # the words' width in phone pixels
    W = max(tw + 28, 2 * (L + R))                         # as wide as the words, never narrower than the ends
    H = 2 * T + 24 + 2 * B                                # one line: 18 + 24 + 10 = 52 px
    Z = zoom
    out_w, out_h = round(W * Z), round(H * Z)
    cloud = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    sx = [0, L, 48 - R, 48]; sy = [0, T, 21 - B, 21]
    dx = [0, round(2 * L * Z), out_w - round(2 * R * Z), out_w]; dy = [0, round(2 * T * Z), out_h - round(2 * B * Z), out_h]
    for r in range(3):
        for c in range(3):
            w, h = dx[c + 1] - dx[c], dy[r + 1] - dy[r]
            if w <= 0 or h <= 0: continue
            part = tile.crop((sx[c], sy[r], sx[c + 1], sy[r + 1])).resize((w, h), Image.NEAREST)
            cloud.alpha_composite(part, (dx[c], dy[r]))
    # the soft shadow under it
    pad = round(6 * Z)
    img = Image.new("RGBA", (out_w, out_h + pad), (0, 0, 0, 0))
    shadow = Image.new("RGBA", cloud.size, (19, 33, 61, 0)); shadow.putalpha(cloud.getchannel("A").point(lambda a: round(a * 0.12)))
    img.alpha_composite(shadow, (0, round(4 * Z)))
    img.alpha_composite(cloud, (0, 0))
    # the words: centered, in the line box that starts 20 px down (18 px top + 2 px padding), 16.25 px tall
    d = ImageDraw.Draw(img)
    d.text((out_w / 2, (20 + 16.25 / 2) * Z), text, font=font, fill=(19, 33, 61, 255), anchor="mm")
    return img


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("text"); ap.add_argument("out")
    ap.add_argument("--shape", type=int, default=1, choices=[1, 2, 3])
    ap.add_argument("--night", action="store_true")
    ap.add_argument("--zoom", type=float, default=4)
    a = ap.parse_args()
    make_cloud(a.text, a.shape, a.night, a.zoom).save(a.out)
    print("saved", a.out)
