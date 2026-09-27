#!/usr/bin/env bash
#
# 把 GitHub Releases 上的安装包镜像到本机，供官网直接下载。
#
# 为什么需要它：官网页面本身很小、加载很快，但三个安装包一直托管在
# GitHub（release-assets.githubusercontent.com）。国内下 90MB 的 EXE
# 经常慢到几十 KB/s 甚至断流，页面快不等于下载快。这个脚本把安装包
# 拉到本机，官网在镜像站上就把下载链接指到本地。
#
# 跑在哪：服务器上（/usr/local/bin/qel-mirror-releases.sh），由 systemd
# 定时器每天跑一次；也可以手动跑，或由 scripts/deploy-site.sh 触发。
# 仓库里这份是母本，改完要重新部署到服务器。
#
# 设计上的几个要点：
#   - 幂等：文件名里带版本号，已经下过且 sha256 对得上就跳过，
#     所以每天跑一次不会重复传 217MB。
#   - 先验后换：下载到 .part，校验 sha256 通过才改名到正式文件。
#     中途断了不会留下一个「看起来存在、其实是半截」的安装包。
#   - 清单最后写：dl-mirror.json 里只列校验通过的文件，而且写完才
#     原子替换。官网靠它判断本地有没有这份文件，所以它必须晚于文件就绪。
#   - 只在拉取成功后清理旧版本文件；API 挂了就直接退出，不动现有文件。
#
set -euo pipefail

REPO="${QEL_REPO:-piaochongdeng/quadratic-exact-lab}"
DEST="${QEL_DL_DIR:-/srv/qel-downloads}"
LOCK="${QEL_DL_LOCK:-/run/qel-mirror.lock}"
API="https://api.github.com/repos/${REPO}/releases/latest"

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }

# 同时只跑一个：手动触发正好撞上定时任务的话，两边会写同一个 .part 文件
exec 9>"$LOCK"
if ! flock -n 9; then
  log "另一次同步还在跑，本次跳过"
  exit 0
fi

mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------- 1. 取最新发布 ----------
if ! curl -fsSL --retry 3 --retry-delay 2 -m 60 \
     -H 'Accept: application/vnd.github+json' -o "$TMP/release.json" "$API"; then
  log "拉 GitHub API 失败（网络或限流），保持现有文件不动"
  exit 1
fi

TAG="$(jq -r '.tag_name // empty' "$TMP/release.json")"
if [ -z "$TAG" ]; then
  log "API 响应里没有 tag_name，放弃"
  exit 1
fi
log "最新发布：$TAG"

# 只镜像安装包，不碰源码包（GitHub 自动附带的 Source code 压缩包不要）
jq -r '.assets[]
       | select(.name | test("\\.(apk|exe|zip)$"; "i"))
       | [.name, .browser_download_url, (.size | tostring), (.digest // "")] | @tsv' \
   "$TMP/release.json" > "$TMP/assets.tsv"

if [ ! -s "$TMP/assets.tsv" ]; then
  log "这次发布里没有 apk/exe/zip，什么都不做"
  exit 0
fi

human() { awk -v b="$1" 'BEGIN{
  split("B KB MB GB", u, " "); i = 1;
  while (b >= 1024 && i < 4) { b /= 1024; i++ }
  printf (i == 1 ? "%.0f%s" : "%.1f%s"), b, u[i] }'; }

# ---------- 2. 逐个下载并校验 ----------
FAILED=0
while IFS=$'\t' read -r NAME URL SIZE DIGEST; do
  [ -n "$NAME" ] || continue
  WANT="${DIGEST#sha256:}"
  FILE="$DEST/$NAME"

  if [ -f "$FILE" ] && [ "$(stat -c%s "$FILE")" = "$SIZE" ]; then
    if [ -z "$WANT" ] || [ "$(sha256sum "$FILE" | cut -d' ' -f1)" = "$WANT" ]; then
      log "已有 $NAME（$(human "$SIZE")），跳过"
      continue
    fi
    log "$NAME 校验值对不上，重新下载"
  fi

  log "下载 $NAME（$(human "$SIZE")）…"
  if ! curl -fsSL --retry 3 --retry-delay 2 -m 1800 -o "$FILE.part" "$URL"; then
    log "× $NAME 下载失败"
    rm -f "$FILE.part"
    FAILED=1
    continue
  fi

  GOT="$(stat -c%s "$FILE.part")"
  if [ "$GOT" != "$SIZE" ]; then
    log "× $NAME 大小不对：期望 $SIZE 字节，实得 $GOT 字节"
    rm -f "$FILE.part"
    FAILED=1
    continue
  fi
  if [ -n "$WANT" ] && [ "$(sha256sum "$FILE.part" | cut -d' ' -f1)" != "$WANT" ]; then
    log "× $NAME sha256 校验失败，丢弃"
    rm -f "$FILE.part"
    FAILED=1
    continue
  fi

  mv -f "$FILE.part" "$FILE"
  log "✓ $NAME 就位"
done < "$TMP/assets.tsv"

# ---------- 3. 清理旧版本（只在这次拉取成功时做） ----------
if [ "$FAILED" = "0" ]; then
  while IFS= read -r OLD; do
    [ -n "$OLD" ] || continue
    if ! awk -F'\t' -v n="$OLD" '$1 == n { found = 1 } END { exit !found }' "$TMP/assets.tsv"; then
      log "清理旧文件 $OLD（已不在最新发布里）"
      rm -f "$DEST/$OLD"
    fi
  done < <(find "$DEST" -maxdepth 1 -type f \
             \( -name '*.apk' -o -name '*.exe' -o -name '*.zip' \) \
             -printf '%f\n' 2>/dev/null)
else
  log "本次有文件没下成，跳过清理，避免把还能用的旧版本删掉"
fi

# ---------- 4. 写清单 ----------
# 清单里只列校验通过的文件。官网读到清单里没有某个文件名，
# 就会退回 GitHub 链接 —— 宁可用慢的，也不给一个点了 404 的按钮。
python3 - "$DEST" "$TAG" <<'PY'
import datetime, hashlib, json, os, sys

dest, tag = sys.argv[1], sys.argv[2]
assets = {}
for name in sorted(os.listdir(dest)):
    if not name.lower().endswith(('.apk', '.exe', '.zip')):
        continue
    p = os.path.join(dest, name)
    if not os.path.isfile(p):
        continue
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    assets[name] = {'size': os.path.getsize(p), 'sha256': h.hexdigest()}

doc = {
    'tag': tag,
    'generatedAt': datetime.datetime.now(datetime.timezone.utc)
                   .isoformat(timespec='seconds'),
    'assets': assets,
}
tmp = os.path.join(dest, 'dl-mirror.json.tmp')
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
os.replace(tmp, os.path.join(dest, 'dl-mirror.json'))

total = sum(a['size'] for a in assets.values())
print('清单：%s，%d 个文件，合计 %.1f MB'
      % (tag, len(assets), total / 1048576.0))
for n in sorted(assets):
    print('  %-46s %10d' % (n, assets[n]['size']))
PY

if [ "$FAILED" != "0" ]; then
  log "同步结束，但有文件没成功，清单里不会包含它们"
  exit 1
fi
log "同步完成"
