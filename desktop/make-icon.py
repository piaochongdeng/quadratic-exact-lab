# -*- coding: utf-8 -*-
"""生成应用图标：icon.png (512) 与 icon.ico (多尺寸)。纯 Pillow 绘制，无外部素材。"""
from PIL import Image, ImageDraw, ImageFilter
import math, os

S = 1024
OUT = os.path.dirname(os.path.abspath(__file__))

def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))

# ---------- 背景：对角渐变 ----------
top = (62, 132, 202)
bot = (22, 66, 118)
bg = Image.new("RGB", (S, S), bot)
d = ImageDraw.Draw(bg)
for y in range(S):
    d.line([(0, y), (S, y)], fill=lerp(top, bot, y / (S - 1)))

# 径向高光
glow = Image.new("L", (S, S), 0)
gd = ImageDraw.Draw(glow)
cx, cy, R = int(S * 0.24), int(S * 0.16), int(S * 0.78)
for i in range(80, 0, -1):
    r = int(R * i / 80)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=int(52 * (1 - i / 80) ** 1.6))
bg = Image.composite(Image.new("RGB", (S, S), (255, 255, 255)), bg, glow)

# 圆角遮罩
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)

icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
icon.paste(bg, (0, 0), mask)

# ---------- 几何参数 ----------
ax_y = S * 0.660
ax_x = S * 0.500
a, h, k = 1.58, 0.0, -0.30
SCALE_X = S * 0.500
SCALE_Y = S * 0.560

def curve_y(xn):
    return k + a * (xn - h) ** 2

def to_px(xn, yn):
    return (ax_x + xn * SCALE_X, ax_y - (yn - k) * SCALE_Y)

# ---------- 网格 ----------
grid = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gdr = ImageDraw.Draw(grid)
gw = max(1, S // 380)
for i in range(1, 6):
    p = S * i / 6
    gdr.line([(p, S * 0.09), (p, S * 0.91)], fill=(255, 255, 255, 30), width=gw)
    gdr.line([(S * 0.09, p), (S * 0.91, p)], fill=(255, 255, 255, 30), width=gw)
icon = Image.alpha_composite(icon, grid)
dr = ImageDraw.Draw(icon, "RGBA")

# ---------- 坐标轴 ----------
aw = max(2, int(S * 0.0095))
dr.line([(S * 0.085, ax_y), (S * 0.915, ax_y)], fill=(255, 255, 255, 150), width=aw)
dr.line([(ax_x, S * 0.950), (ax_x, S * 0.100)], fill=(255, 255, 255, 150), width=aw)

# ---------- 抛物线：用圆点串成平滑曲线，避免折线接缝 ----------
x0, x1 = -0.80, 0.80
steps = 300
pts = []
for i in range(steps + 1):
    xn = x0 + (x1 - x0) * i / steps
    pts.append(to_px(xn, curve_y(xn)))

curve_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
cd = ImageDraw.Draw(curve_layer, "RGBA")
core_r = S * 0.0165
for (px, py) in pts:
    cd.ellipse([px - core_r, py - core_r, px + core_r, py + core_r], fill=(255, 255, 255, 255))

# 柔光：对曲线做一次模糊后垫在下面
halo = curve_layer.filter(ImageFilter.GaussianBlur(S * 0.022))
icon = Image.alpha_composite(icon, halo)
icon = Image.alpha_composite(icon, curve_layer)
dr = ImageDraw.Draw(icon, "RGBA")

# ---------- 顶点 ----------
vx, vy = to_px(h, k)
rr = int(S * 0.0455)
dr.ellipse([vx - rr, vy - rr, vx + rr, vy + rr], fill=(243, 170, 62, 255))
dr.ellipse([vx - rr, vy - rr, vx + rr, vy + rr], outline=(255, 255, 255, 240), width=max(2, int(S * 0.0105)))

# ---------- 与 x 轴交点 ----------
disc = -k / a
if disc > 0:
    for sgn in (-1, 1):
        xn = h + sgn * math.sqrt(disc)
        px, _ = to_px(xn, 0.0)
        r2 = int(S * 0.0295)
        dr.ellipse([px - r2, ax_y - r2, px + r2, ax_y + r2], fill=(122, 214, 138, 255))
        dr.ellipse([px - r2, ax_y - r2, px + r2, ax_y + r2], outline=(255, 255, 255, 235), width=max(2, int(S * 0.0085)))

# ---------- 输出 ----------
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon.png"))
icon.resize((256, 256), Image.LANCZOS).save(
    os.path.join(OUT, "icon.ico"),
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
)
print("icon.png", os.path.getsize(os.path.join(OUT, "icon.png")))
print("icon.ico", os.path.getsize(os.path.join(OUT, "icon.ico")))
