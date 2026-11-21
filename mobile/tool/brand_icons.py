"""Draws the Stackstep app icons and launch images from the brand mark (web/src/app/icon.svg).

Run from mobile/: python3 tool/brand_icons.py. Needs Pillow. Writes Android launcher and splash
PNGs and the iOS app icon and launch images. The Android adaptive icon is a vector (XML) and is
not generated here.
"""

import json
import os

from PIL import Image, ImageDraw

TOP_LEFT = (0x70, 0x08, 0xE7)
BOTTOM_RIGHT = (0xA6, 0x4B, 0xC0)
# The three steps, in the 32-unit space of icon.svg: x, top, width, bottom, white opacity.
BARS = [(6.5, 18.5, 4.5, 25.5, 0.70), (13.75, 13.0, 4.5, 25.5, 0.85), (21.0, 6.5, 4.5, 25.5, 1.0)]
SS = 4  # supersampling for smooth edges


def gradient(n):
    """A diagonal gradient from the top-left to the bottom-right colour, n x n."""
    small = 256
    g = Image.new("RGB", (small, small))
    px = g.load()
    for y in range(small):
        for x in range(small):
            t = (x + y) / (2 * (small - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP_LEFT, BOTTOM_RIGHT))
    return g.resize((n, n), Image.BICUBIC)


def mark(size, *, radius=9.0, background=True, inset=0.0):
    """The brand mark at size x size. radius is in 32-units (0 = square, for iOS masks).
    inset shrinks the bars toward the centre (in 32-units on each side)."""
    n = size * SS
    u = n / 32
    out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    if background:
        mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, n - 1, n - 1), radius=radius * u, fill=255)
        out.paste(gradient(n), (0, 0), mask)
    scale = (32 - 2 * inset) / 32
    layer = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x, top, w, bottom, alpha in BARS:
        x0 = (inset + x * scale) * u
        y0 = (inset + top * scale) * u
        x1 = (inset + (x + w) * scale) * u
        y1 = (inset + bottom * scale) * u
        d.rounded_rectangle((x0, y0, x1, y1), radius=1 * scale * u, fill=(255, 255, 255, round(255 * alpha)))
    out = Image.alpha_composite(out, layer)
    return out.resize((size, size), Image.LANCZOS)


def save(img, path, *, opaque=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if opaque:
        img = img.convert("RGB")
    img.save(path, optimize=True)


def android():
    res = "android/app/src/main/res"
    for density, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        # Legacy launchers (Android 7 and older): a rounded square with a small margin.
        icon = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        inner = mark(round(px * 0.9))
        icon.paste(inner, ((px - inner.width) // 2, (px - inner.height) // 2), inner)
        save(icon, f"{res}/mipmap-{density}/ic_launcher.png")
        save(icon, f"{res}/mipmap-{density}/ic_launcher_round.png")
    for density, px in {"mdpi": 96, "hdpi": 144, "xhdpi": 192, "xxhdpi": 288, "xxxhdpi": 384}.items():
        save(mark(px, radius=8), f"{res}/drawable-{density}/splash_logo.png")


def ios():
    base = "ios/Runner/Assets.xcassets"
    with open(f"{base}/AppIcon.appiconset/Contents.json") as f:
        for entry in json.load(f)["images"]:
            w = float(entry["size"].split("x")[0])
            px = round(w * int(entry["scale"].rstrip("x")))
            # iOS rounds the corners itself and refuses transparency on the store icon.
            save(mark(px, radius=0), f"{base}/AppIcon.appiconset/{entry['filename']}", opaque=True)
    for name, scale in (("LaunchImage.png", 1), ("LaunchImage@2x.png", 2), ("LaunchImage@3x.png", 3)):
        save(mark(96 * scale, radius=8), f"{base}/LaunchImage.imageset/{name}")


if __name__ == "__main__":
    android()
    ios()
    print("icons written")
