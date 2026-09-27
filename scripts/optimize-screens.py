# -*- coding: utf-8 -*-
"""把 docs/screens/*.png（Electron 拍的 2 倍图）转成官网用的 WebP。

    py scripts/optimize-screens.py

每张图出两份：1x（宽 1440 / 手机 391）与 @2x（原始 2 倍像素），
官网用 srcset 让视网膜屏拿 2x、普通屏拿 1x，兼顾清晰与流量。
PNG 原图保留在 docs/screens/ 作为素材，不随官网发布。
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'screens')
OUT = os.path.join(ROOT, 'docs', 'site', 'img')

# 手机竖屏图按宽度判断：源图 782×1690 是 2 倍，1x 就是 391
PHONE_MAX_WIDTH = 900

# 首屏特写：整窗截图 1441 宽，缩到首屏右栏的 700 多像素就只剩一半，
# 里面的字全糊。改成从 2 倍原图里裁出「图像」面板，按接近 1:1 显示才看得清。
# 坐标是 CSS 像素（在 1441×981 窗口下量的），乘 2 换成源图像素。
# 裁剪框不写死，从 docs/screens/shots.json 里读截图时量到的真实位置，
# 以后界面布局改了，裁剪会自己跟上。
#
# 首屏那张图后来又从「整个面板」收窄成「画布中间一段」：
# 面板 982px 宽、首屏右栏只放得下 780px，等于把图缩到 0.79 倍，
# 画布里的坐标标注本来就只有 11px 左右，缩完更看不清（视觉复核反复说
# 「标注文字过小、发糊」，还把 1/2 读成 10.5 之类的）。
# 裁到 540px 宽、仍按 780px 显示，标注就放大到约 1.44 倍，一眼能读。
# 裁剪范围不是猜的：按颜色在 2 倍原图里定位了顶点标记（暖色 #e0a458）
# 和两个零点标记（绿色 #6ee7a0），标注重心落在画布内 x≈378~602、
# y≈29~60 一带，取 x 从 250 到 790 正好把三个标注连同曲线一起框住，
# 纵向不裁，免得抛物线手臂被切断看着像裁坏了。
HERO_CROPS = [
    {'src': 'desktop-quad-dark.png', 'out': 'hero-panel', 'shot': 'desktop-quad-dark',
     'from': 'plotRect', 'inset': (250, 0, 190, 0)},
]


def main():
    os.makedirs(OUT, exist_ok=True)
    names = sorted(f for f in os.listdir(SRC) if f.endswith('.png'))
    if not names:
        print('docs/screens 里没有 PNG，先跑 node scripts/make-screenshots.js')
        return 1

    total = 0
    for name in names:
        src = os.path.join(SRC, name)
        im = Image.open(src).convert('RGB')
        w, h = im.size
        is_phone = w < PHONE_MAX_WIDTH
        # 源图就是 2 倍图：1x 宽度 = 源宽 / 2
        w1 = w // 2
        base = name[:-4]

        for suffix, target_w, quality in (('', w1, 84), ('@2x', w, 80)):
            img = im if target_w == w else im.resize(
                (target_w, max(1, round(h * target_w / w))), Image.LANCZOS)
            dst = os.path.join(OUT, base + suffix + '.webp')
            img.save(dst, 'WEBP', quality=quality, method=6)
            kb = os.path.getsize(dst) / 1024.0
            total += os.path.getsize(dst)
            print('  %-30s %5d×%-5d %7.1f KB  %s' % (
                base + suffix + '.webp', img.size[0], img.size[1], kb,
                '手机' if is_phone else '桌面'))

    n = len(names) * 2

    # 截图时量到的面板位置
    meta = {}
    mf = os.path.join(SRC, 'shots.json')
    if os.path.exists(mf):
        import json
        for r in json.load(open(mf, encoding='utf-8')):
            meta[r.get('name')] = r

    # 首屏特写：从 2 倍原图裁出关键面板，按接近 1:1 显示才看得清字
    for c in HERO_CROPS:
        src = os.path.join(SRC, c['src'])
        if not os.path.exists(src):
            print('  ! 缺少 %s，跳过特写 %s' % (c['src'], c['out']))
            continue
        box_src = (meta.get(c['shot']) or {}).get(c['from'])
        if not box_src:
            print('  ! shots.json 里没有 %s 的 %s，跳过特写 %s' % (c['shot'], c['from'], c['out']))
            continue
        pad = c.get('pad', 0)
        # inset = (左, 上, 右, 下)，单位 CSS 像素，从基准框往里收
        il, it, ir, ib = c.get('inset', (0, 0, 0, 0))
        x = box_src['x'] - pad + il
        y = box_src['y'] - pad + it
        w = box_src['w'] + pad * 2 - il - ir
        h = box_src['h'] + pad * 2 - it - ib
        if c.get('maxh'):
            h = min(h, c['maxh'])
        im = Image.open(src).convert('RGB')
        box = (x * 2, y * 2, (x + w) * 2, (y + h) * 2)
        if box[2] > im.size[0] or box[3] > im.size[1]:
            print('  ! %s 裁剪框超出图片范围，跳过' % c['out'])
            continue
        crop = im.crop(box)
        for suffix, target_w, quality in (('', w, 86), ('@2x', w * 2, 82)):
            img = crop if target_w == crop.size[0] else crop.resize(
                (target_w, max(1, round(crop.size[1] * target_w / crop.size[0]))), Image.LANCZOS)
            dst = os.path.join(OUT, c['out'] + suffix + '.webp')
            img.save(dst, 'WEBP', quality=quality, method=6)
            total += os.path.getsize(dst)
            n += 1
            print('  %-30s %5dx%-5d %7.1f KB  hero' % (
                c['out'] + suffix + '.webp', img.size[0], img.size[1], os.path.getsize(dst) / 1024.0))


    print('\n共 %d 张，合计 %.2f MB，输出到 docs/site/img/' % (n, total / 1024 / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
