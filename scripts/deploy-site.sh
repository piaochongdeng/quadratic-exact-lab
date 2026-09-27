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
#   bash scripts/deploy-site.sh --setup      # 首次 / 机器重建：装 Caddy 配置、镜像脚本、定时器、BBR
#   bash scripts/deploy-site.sh --mirror     # 只同步安装包镜像（不部署页面）
#
# --setup 可以重复执行。它把 scripts/server/ 下的配置推上去并重启相关服务；
# 服务器上那份只是副本，母本在仓库里 —— 否则机器一重建，
# 没人知道 Caddyfile 原本该写什么。
#
# 可用环境变量覆盖（都有默认值）：
#   SITE_HOST   默认 ubuntu@43.155.128.66
#   SITE_KEY    默认 ~/.ssh/dsh_ed25519
#   SITE_DIR    默认 /srv/quadratic-exact-lab
#   SITE_URL    默认 http://43.155.128.66/
#   SITE_DL_DIR 默认 /srv/qel-downloads
#
set -euo pipefail

HOST="${SITE_HOST:-ubuntu@43.155.128.66}"
KEY="${SITE_KEY:-$HOME/.ssh/dsh_ed25519}"
DIR="${SITE_DIR:-/srv/quadratic-exact-lab}"
URL="${SITE_URL:-http://43.155.128.66/}"
DL_DIR="${SITE_DL_DIR:-/srv/qel-downloads}"
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

# ---------- 1b. 一次性服务器配置 ----------
if [ "${1:-}" = "--setup" ]; then
  echo "==> 安装服务器配置（母本在 scripts/server/）"
  for f in Caddyfile qel-mirror.service qel-mirror.timer 99-qel-bbr.conf qel-bbr-modules.conf; do
    [ -f "scripts/server/$f" ] || { echo "× 缺少 scripts/server/$f"; exit 1; }
  done

  "${SCP[@]}" scripts/server/Caddyfile            "$HOST:/tmp/qel-Caddyfile"
  "${SCP[@]}" scripts/server/qel-mirror.service   "$HOST:/tmp/qel-mirror.service"
  "${SCP[@]}" scripts/server/qel-mirror.timer     "$HOST:/tmp/qel-mirror.timer"
  "${SCP[@]}" scripts/server/99-qel-bbr.conf      "$HOST:/tmp/qel-99-bbr.conf"
  "${SCP[@]}" scripts/server/qel-bbr-modules.conf "$HOST:/tmp/qel-bbr-modules.conf"
  "${SCP[@]}" scripts/mirror-releases.sh          "$HOST:/tmp/qel-mirror-releases.sh"

  "${SSH[@]}" "set -e
    # Caddy 配置：先备份，校验通过才生效，校验不过自动回滚，
    # 免得一个手误把正在跑的站点改挂。
    sudo -n cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$STAMP 2>/dev/null || true
    sudo -n install -m 644 -o root -g root /tmp/qel-Caddyfile /etc/caddy/Caddyfile
    if ! sudo -n caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
      echo '× Caddyfile 校验没过，已回滚'
      sudo -n cp /etc/caddy/Caddyfile.bak.$STAMP /etc/caddy/Caddyfile
      exit 1
    fi
    sudo -n systemctl reload caddy

    # 镜像同步脚本 + 每日定时器
    sudo -n install -m 755 -o root -g root /tmp/qel-mirror-releases.sh /usr/local/bin/qel-mirror-releases.sh
    sudo -n mkdir -p $DL_DIR
    sudo -n chown root:root $DL_DIR
    sudo -n install -m 644 -o root -g root /tmp/qel-mirror.service /etc/systemd/system/qel-mirror.service
    sudo -n install -m 644 -o root -g root /tmp/qel-mirror.timer   /etc/systemd/system/qel-mirror.timer
    sudo -n touch /var/log/qel-mirror.log
    sudo -n systemctl daemon-reload
    sudo -n systemctl enable --now qel-mirror.timer >/dev/null 2>&1

    # BBR：跨境链路提速。实测安装包下载从 60 KB/s 提到约 2.5 MB/s。
    sudo -n install -m 644 -o root -g root /tmp/qel-99-bbr.conf /etc/sysctl.d/99-qel-bbr.conf
    sudo -n install -m 644 -o root -g root /tmp/qel-bbr-modules.conf /etc/modules-load.d/qel-bbr.conf
    sudo -n modprobe tcp_bbr 2>/dev/null || true
    sudo -n systemctl restart systemd-sysctl

    rm -f /tmp/qel-Caddyfile /tmp/qel-mirror.service /tmp/qel-mirror.timer \
          /tmp/qel-99-bbr.conf /tmp/qel-bbr-modules.conf /tmp/qel-mirror-releases.sh

    printf '    caddy=%s  定时器=%s  BBR=%s\n' \
      \"\$(systemctl is-active caddy)\" \
      \"\$(systemctl is-active qel-mirror.timer)\" \
      \"\$(sysctl -n net.ipv4.tcp_congestion_control)\""

  echo "==> 首次同步安装包镜像（约 217MB，半分钟左右）"
  "${SSH[@]}" "sudo -n systemctl start qel-mirror.service; sudo -n tail -3 /var/log/qel-mirror.log"
fi

# ---------- 1c. 只同步镜像 ----------
if [ "${1:-}" = "--mirror" ]; then
  echo "==> 同步安装包镜像"
  "${SSH[@]}" "sudo -n systemctl start qel-mirror.service; sudo -n tail -12 /var/log/qel-mirror.log"
  exit 0
fi

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

# ---------- 8. 安装包镜像 ----------
# 页面本身很小、加载很快，用户真正等的是安装包。这里顺手把镜像同步一次
# （幂等，已经是最新版就 0.5 秒跳过），免得「页面更新了、安装包还指着 GitHub」。
echo "==> 同步安装包镜像"
if "${SSH[@]}" "test -x /usr/local/bin/qel-mirror-releases.sh"; then
  "${SSH[@]}" "sudo -n systemctl start qel-mirror.service; sudo -n tail -4 /var/log/qel-mirror.log" \
    | sed 's/^/    /'

  # 核对与自测都在服务器上做：这台 Windows 机器的 curl 连不上 api.github.com
  # （schannel 吊销检查失败，实测 exit 35），而服务器直连没问题。
  # 另外这些检查一律不能把已经成功的部署判成失败 —— 所以整段都带 || true，
  # 出问题只提示，不改退出码。
  "${SSH[@]}" '
    API="https://api.github.com/repos/piaochongdeng/quadratic-exact-lab/releases/latest"
    TAG=$(curl -fsSL -m 20 -H "Accept: application/vnd.github+json" "$API" 2>/dev/null \
          | jq -r ".tag_name // empty" 2>/dev/null || true)
    MTAG=$(jq -r ".tag // empty" '"$DL_DIR"'/dl-mirror.json 2>/dev/null || true)
    if [ -n "$TAG" ] && [ "$TAG" = "$MTAG" ]; then
      echo "    镜像版本 $MTAG 与最新发布一致 ✓"
    elif [ -z "$TAG" ]; then
      echo "    ? 读不到最新发布版本，跳过核对"
    else
      echo "    ! 最新发布是 $TAG，镜像清单是 $MTAG —— 页面会退回 GitHub 链接"
    fi

    # 清单里的每个文件都真取一次（前 1 字节）。
    # 只看清单不够：清单对了，文件也可能权限不对或根本没落盘。
    for f in $(jq -r ".assets | keys[]" '"$DL_DIR"'/dl-mirror.json 2>/dev/null || true); do
      C=$(curl -s -m 20 -r 0-0 -o /dev/null -w "%{http_code}" "http://127.0.0.1/dl/$f" || echo 000)
      if [ "$C" = "200" ] || [ "$C" = "206" ]; then
        echo "    $f 可下载 ✓"
      else
        echo "    ! $f 取不到（HTTP $C）"
      fi
    done
  ' || true
else
  echo "    跳过：服务器上还没装镜像脚本，跑一次 bash scripts/deploy-site.sh --setup"
fi

# ---------- 9. 对外可访问性 ----------
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
