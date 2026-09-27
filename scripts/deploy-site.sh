#!/usr/bin/env bash
#
# 把官网部署到自有服务器（默认腾讯云首尔 43.155.128.66，由 Caddy 提供）。
#
# 为什么要有这个脚本：官网现在同时挂在两个地方
#   - GitHub Pages：https://piaochongdeng.github.io/quadratic-exact-lab/（国外快）
#   - 自有服务器：http://43.155.128.66/（国内快，IP 直连）
# 两边内容必须一模一样。这里不是「再打包一次」，而是直接从 git 已提交的
# docs/ 树里导出 —— 也就是说部署上去的，永远等于推到 GitHub Pages 的那一份。
#
# 用法：
#   bash scripts/deploy-site.sh              # 部署已提交的内容
#   bash scripts/deploy-site.sh --build      # 先重新生成 docs/ 再部署（需先提交）
#
# 可用环境变量覆盖（都有默认值）：
#   SITE_HOST  默认 ubuntu@43.155.128.66
#   SITE_KEY   默认 ~/.ssh/dsh_ed25519
#   SITE_DIR   默认 /srv/quadratic-exact-lab
#   SITE_URL   默认 http://43.155.128.66/
#
set -euo pipefail

HOST="${SITE_HOST:-ubuntu@43.155.128.66}"
KEY="${SITE_KEY:-$HOME/.ssh/dsh_ed25519}"
DIR="${SITE_DIR:-/srv/quadratic-exact-lab}"
URL="${SITE_URL:-http://43.155.128.66/}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARBALL="$(mktemp -t qel-docs-XXXXXX.tar.gz)"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SSH=(ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$HOST")
SCP=(scp -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

cleanup() { rm -f "$TARBALL"; }
trap cleanup EXIT

echo "==> 目标：$HOST:$DIR   （对外地址 $URL）"

# ---------- 1. 连通性 ----------
if ! "${SSH[@]}" true 2>/dev/null; then
  echo "× 连不上 $HOST"
  echo "  检查：密钥 $KEY 是否存在、服务器是否开机、安全组是否放行 22"
  exit 1
fi
echo "    ssh 连通 ✓"

# ---------- 2. 可选：重新生成 docs/ ----------
if [ "${1:-}" = "--build" ]; then
  echo "==> 重新生成 docs/"
  node scripts/make-www.js >/dev/null
  node scripts/make-site.js
fi

# ---------- 3. 检查工作区是否干净 ----------
# 部署的是 git 里的内容，docs/ 下有没提交的改动就意味着部署出去的
# 和本地看到的不一样，这种「以为更新了其实没有」最难查，直接拦住。
if ! git diff --quiet -- docs/ || ! git diff --cached --quiet -- docs/; then
  echo "× docs/ 下有未提交的改动，先提交再部署"
  echo "  （部署的是 git 里那一份，未提交的改动不会生效）"
  git status --short -- docs/ | sed 's/^/    /'
  exit 1
fi

# ---------- 4. 打包 ----------
# core.autocrlf=false 不能省：本机是 Windows、core.autocrlf=true，
# git archive 会把 HTML/CSS/JS 的 LF 统统转成 CRLF，
# 结果服务器上的文件和 GitHub Pages 上的不是同一份字节
# （曾量到 index.html 多出 525 个 CR 字节）。功能上不一定出问题，
# 但「两边一致」这个前提就没了，以后查问题会白费功夫。
echo "==> 从 git 已提交的 docs/ 导出"
git -c core.autocrlf=false archive --format=tar HEAD:docs | gzip -9 > "$TARBALL"
SIZE=$(wc -c < "$TARBALL")
COUNT=$(tar tzf "$TARBALL" | grep -vc '/$' || true)
echo "    $(awk -v b="$SIZE" 'BEGIN{printf "%.2f", b/1048576}') MB，$COUNT 个文件"
if [ "$(tar xzOf "$TARBALL" index.html | tr -cd '\r' | wc -c)" != "0" ]; then
  echo "× 包里出现了 CRLF，core.autocrlf 设置没生效，中止"
  exit 1
fi
echo "    换行符 LF ✓"

# ---------- 5. 上传 ----------
echo "==> 上传"
"${SCP[@]}" "$TARBALL" "$HOST:/tmp/qel-docs.tar.gz"

# ---------- 6. 原子替换 ----------
# 先解到暂存目录再整份换过去，避免「删到一半正好有人访问」看到半截站点。
echo "==> 解包并替换"
"${SSH[@]}" "set -e
  sudo -n rm -rf /srv/qel-staging
  sudo -n mkdir -p /srv/qel-staging
  sudo -n tar xzf /tmp/qel-docs.tar.gz -C /srv/qel-staging
  sudo -n chown -R root:root /srv/qel-staging
  sudo -n find /srv/qel-staging -type d -exec chmod 755 {} \\;
  sudo -n find /srv/qel-staging -type f -exec chmod 644 {} \\;
  sudo -n rm -rf $DIR.old
  if [ -d $DIR ]; then sudo -n mv $DIR $DIR.old; fi
  sudo -n mv /srv/qel-staging $DIR
  sudo -n rm -rf $DIR.old /tmp/qel-docs.tar.gz
  echo \"    服务器上现有 \$(find $DIR -type f | wc -l) 个文件\""

# ---------- 7. 校验：逐文件比对哈希 ----------
# 一次 ssh 取回全部哈希，再和 git 里的逐个比 —— 一个文件一次 ssh 太慢。
echo "==> 校验（服务器 vs git 已提交内容）"
REMOTE=$("${SSH[@]}" "cd '$DIR' && find . -type f -exec sha256sum {} + | sed 's| \\./| |'")
OK=0; BAD=0; BADLIST=""
while IFS= read -r f; do
  remote=$(printf '%s\n' "$REMOTE" | awk -v p="$f" '$2==p{print $1; found=1} END{if(!found) print "MISSING"}')
  local=$(git show "HEAD:docs/$f" | sha256sum | cut -d' ' -f1)
  if [ "$remote" = "$local" ]; then OK=$((OK+1)); else BAD=$((BAD+1)); BADLIST="$BADLIST $f"; fi
done < <(git ls-tree -r --name-only HEAD:docs)

if [ "$BAD" != "0" ]; then
  echo "× 有 $BAD 个文件对不上：$BADLIST"
  exit 1
fi
echo "    $OK 个文件逐字节一致 ✓"

# ---------- 8. 对外可访问性 ----------
echo "==> 从外网访问 $URL"
CODE=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$URL" || echo "000")
if [ "$CODE" = "200" ]; then
  echo "    HTTP 200 ✓"
else
  echo "× 外网访问返回 $CODE"
  echo "  本机能访问但外网不行，通常是腾讯云控制台的「安全组」没放行 80 端口"
  echo "  （本机自测：ssh $HOST \"curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/\"）"
  exit 1
fi

echo
echo "部署完成：$URL"
