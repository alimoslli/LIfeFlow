"""Reply cards for Jordan's chat, cut from the 3x frames (CSS px windows). A card can stack two windows of the same reply."""
from PIL import Image, ImageDraw
def win(frame, y0, y1):
    return Image.open(f"frames_convo/{frame}").convert("RGB").crop((16 * 3, int(y0 * 3), 374 * 3, int(y1 * 3)))
def card(name, parts):
    ims = [win(*p) for p in parts]
    bg = ims[0].getpixel((4, 4)); pad = 36
    H = sum(i.height for i in ims)
    c = Image.new("RGB", (ims[0].width + 2 * pad, H + 2 * pad), bg)
    y = pad
    for i in ims: c.paste(i, (pad, y)); y += i.height
    m = Image.new("L", c.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, c.width - 1, c.height - 1), radius=72, fill=255)
    out = Image.new("RGB", c.size, bg); out.paste(c, (0, 0), m); out.save(f"cards/jc_{name}.png"); print(name, out.size)
card("insure", [("00261.jpg", 118, 398)])
card("week", [("00767.jpg", 410, 470), ("00823.jpg", 120, 492)])
