# -*- coding: utf-8 -*-
"""quadratic-exact-lab · scripts/make-android-icons.py

由 desktop/icon.png（512×512）派生 Android 需要的全套图标：

  android/app/src/main/res/
    mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png          传统方形图标
    mipmap-{...}/ic_launcher_round.png                               传统圆形图标
    mipmap-{...}/ic_launcher_foreground.png                         自适应图标前景（108dp 画布）
    mipmap-anydpi-v26/ic_launcher.xml                                自适应图标（API 26+）
    mipmap-anydpi-v26/ic_launcher_round.xml
    values/ic_launcher_background.xml                                自适应图标背景色（取自源图）

用法： py scripts/make-android-icons.py
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "desktop", "icon.png")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

# 传统图标尺寸（dp=48）
LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
# 自适应图标画布 = 108dp
ADAPTIVE = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

# 自适应图标安全区：内容落在中心 66dp 的圆内才不会被各种启动器裁掉。
# 源图里真正有内容的范围约是自身宽度的 83%（坐标轴从 8.5% 到 91.5%），
# 所以把整块图标缩到 75/108 ≈ 81dp 时，内容约 67dp，刚好落在安全区里。
SAFE_RATIO = 75.0 / 108.0


def sample_background(icon):
    """从源图里取一个底色，用作自适应图标的背景色。

    注意：不能取图像的水平中心 —— 那里正好是白色的 y 轴，会取到近白色。
    取左下靠内的位置：既在圆角方块内部，又避开了坐标轴、网格与抛物线。
    """
    w, h = icon.size
    for fx, fy in ((0.30, 0.94), (0.70, 0.94), (0.30, 0.88), (0.70, 0.12)):
        px = icon.getpixel((int(w * fx), int(h * fy)))
        # 近白 / 透明的一律不要，那些是坐标轴或圆角外的空白
        if px[3] < 200:
            continue
        if px[0] > 200 and px[1] > 200 and px[2] > 200:
            continue
        return "#%02x%02x%02x" % (px[0], px[1], px[2])
    return "#1d4f85"   # 兜底：与应用内 brand-mark 的渐变末端一致


def rounded_mask(size, radius_ratio):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )
    return m


def circle_mask(size):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size - 1, size - 1], fill=255)
    return m


def main():
    if not os.path.exists(SRC):
        sys.exit("找不到源图标：%s（先跑 desktop/make-icon.py）" % SRC)

    src = Image.open(SRC).convert("RGBA")
    bg_color = sample_background(src)
    print("背景色（自适应图标）:", bg_color)

    written = []

    def save(img, density, name):
        d = os.path.join(RES, "mipmap-" + density)
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, name)
        img.save(p)
        written.append(p)

    for density, size in LEGACY.items():
        # 传统方形图标：直接用源图（本身就是圆角方块，四角透明）
        save(src.resize((size, size), Image.LANCZOS), density, "ic_launcher.png")

        # 传统圆形图标：圆形裁切
        flat = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        small = src.resize((size, size), Image.LANCZOS)
        flat.paste(small, (0, 0), circle_mask(size))
        save(flat, density, "ic_launcher_round.png")

    for density, size in ADAPTIVE.items():
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        inner = max(1, int(round(size * SAFE_RATIO)))
        logo = src.resize((inner, inner), Image.LANCZOS)
        off = (size - inner) // 2
        canvas.paste(logo, (off, off), logo)
        save(canvas, density, "ic_launcher_foreground.png")

    # 自适应图标 XML（API 26+）
    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        p = os.path.join(anydpi, name)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(
                '<?xml version="1.0" encoding="utf-8"?>\n'
                '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_launcher_background"/>\n'
                '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
                '</adaptive-icon>\n'
            )
        written.append(p)

    # 背景色资源
    values = os.path.join(RES, "values")
    os.makedirs(values, exist_ok=True)
    p = os.path.join(values, "ic_launcher_background.xml")
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<resources>\n'
            '    <color name="ic_launcher_background">%s</color>\n'
            '</resources>\n' % bg_color
        )
    written.append(p)

    print("生成 %d 个文件：" % len(written))
    for p in written:
        print("  " + os.path.relpath(p, ROOT).replace("\\", "/"))


if __name__ == "__main__":
    main()
