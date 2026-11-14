"""Cover for the launch video: the golden-hour wheel behind Ali (a real frame of the edit, no captions) + the title."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys, os
L = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); SP = os.path.dirname(L)
im = Image.open(f"{L}/prev/main_22.30.jpg").convert("RGBA")
F1 = ImageFont.truetype(f"{SP}/editorpack/fonts/Fraunces-Bold.ttf", 92); F2 = ImageFont.truetype(f"{SP}/editorpack/fonts/Geist-Medium.ttf", 40)
GOLD, SOFT = (255, 210, 122), (243, 245, 250)
# a soft dark band so the words always read
band = Image.new("L", im.size, 0); ImageDraw.Draw(band).rectangle([0, 1250, 1080, 1560], fill=150); band = band.filter(ImageFilter.GaussianBlur(70))
dark = Image.new("RGBA", im.size, (8, 14, 34, 0)); dark.putalpha(band); im.alpha_composite(dark)
d = ImageDraw.Draw(im)
def line(y, parts, font):
    w = sum(font.getlength(t) for t, _ in parts); x = 540 - w / 2
    for t, c in parts:
        d.text((x + 3, y + 4), t, font=font, fill=(5, 10, 30, 150), anchor="ls"); d.text((x, y), t, font=font, fill=c, anchor="ls"); x += font.getlength(t)
line(1350, [("Your day,", SOFT)], F1)
line(1452, [("drawn as the ", SOFT), ("sky.", GOLD)], F1)
line(1525, [("LifeFlow  ·  Early January 2027", (201, 213, 238))], F2)
im = im.convert("RGB"); im.save(f"{L}/LifeFlow_Launch_Cover_9x16.jpg", quality=94)
im.crop((0, 200, 1080, 1550)).save(f"{L}/LifeFlow_Launch_Cover_4x5.jpg", quality=94)
print("saved")
