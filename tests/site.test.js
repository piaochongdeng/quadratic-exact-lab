/* 官网自测：node tests/site.test.js
 *
 * 检查的是「发布目录 docs/ 能不能真的当网站跑起来」，不重新构建：
 *   - 首页与在线试用页存在、没有残留占位符
 *   - 所有本地引用（src/href）在磁盘上真的存在
 *   - 下载区不写死版本号：数据来自 releases.json / GitHub API
 *   - 首页不能出现 file:// 或绝对盘符路径（发布到子目录也要能用）
 *   - KaTeX 只依赖 renderToString，不引用不存在的 auto-render
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (err) { fail++; console.log('  FAIL ' + name + '\n       ' + (err && err.message)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

if (!fs.existsSync(path.join(DOCS, 'index.html'))) {
  console.log('  skip 还没有 docs/index.html（先跑 node scripts/make-site.js）');
  process.exit(0);
}

const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
const siteJs = fs.readFileSync(path.join(DOCS, 'site', 'site.js'), 'utf8');
const siteCss = fs.readFileSync(path.join(DOCS, 'site', 'site.css'), 'utf8');

t('首页存在且是一份完整 HTML', () => {
  assert(/^<!DOCTYPE html>/i.test(html.trim()), '缺少 DOCTYPE');
  assert(html.indexOf('</html>') > 0, '缺少 </html>');
  assert(html.length > 8000, '首页太短，疑似没生成完整');
});

t('首页没有残留占位符 / 模板标记', () => {
  /* 只查真正的占位符。别查 }} —— LaTeX 的 \dfrac{\sqrt{6}}{2} 里就有 }}，
     那是正文内容，不是模板没替换（踩过）。 */
  ['TODO', 'FIXME', 'XXX', '{{', 'lorem ipsum', 'PLACEHOLDER'].forEach((bad) => {
    assert(html.toLowerCase().indexOf(bad.toLowerCase()) < 0, '出现占位符：' + bad);
  });
  /* 未替换的模板变量：${...} 或 %s / %d 之类 */
  assert(!/\$\{[a-zA-Z_]/.test(html), '出现未替换的 ${...} 模板变量');
  assert(!/%[sd]\b/.test(html), '出现未替换的 %s / %d 占位符');
});

t('首页所有本地引用都在磁盘上存在', () => {
  const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
  let m, checked = 0;
  const missing = [];
  while ((m = re.exec(html))) {
    const u = m[1];
    if (/^(https?:|mailto:|data:|#|\/\/)/.test(u)) continue;
    if (/\.md$/i.test(u)) continue;
    const p = path.join(DOCS, u.split('#')[0].split('?')[0]);
    checked++;
    if (!fs.existsSync(p)) missing.push(u);
  }
  assert(checked >= 10, '本地引用只有 ' + checked + ' 个，疑似解析失败');
  assert(missing.length === 0, '引用了不存在的文件：' + missing.join('、'));
});

t('首页不出现绝对路径 / file:// （要能放在子目录下访问）', () => {
  assert(html.indexOf('file://') < 0, '出现 file://');
  assert(!/(?:src|href)\s*=\s*"\/[^/]/.test(html), '出现以 / 开头的绝对路径');
  assert(!/[A-Za-z]:\\\\/.test(html), '出现 Windows 盘符路径');
});

t('下载区不写死版本号（数据来自 GitHub Releases）', () => {
  assert(/api\.github\.com\/repos\//.test(siteJs), 'site.js 没有读 GitHub Releases API');
  assert(siteJs.indexOf('releases/latest') > 0, '没有读 latest 发布');
  assert(/FALLBACK\s*=\s*'site\/releases\.json'/.test(siteJs), '缺少本地快照兜底');
  // 首页里不能出现形如 v1.4.1 的硬编码版本号
  assert(!/v\d+\.\d+\.\d+/.test(html), '首页里写死了版本号，以后发版就不会自动更新了');
});

t('下载区有手机与电脑两个平台的入口', () => {
  ['android', 'win-setup', 'win-zip'].forEach((k) => {
    assert(html.indexOf('data-dl="' + k + '"') > 0, '缺少下载卡片 ' + k);
  });
  assert((html.match(/data-dl-btn/g) || []).length === 3, '下载按钮数量不是 3 个');
  assert(html.indexOf('data-cta-primary') > 0, '缺少首屏主下载按钮');
});

t('KaTeX 只依赖 renderToString，不引用不存在的 auto-render', () => {
  assert(html.indexOf('auto-render') < 0, '首页引用了 auto-render（vendor 里没有这个文件）');
  assert(siteJs.indexOf('renderToString') > 0, 'site.js 没有自己渲染公式');
  assert(fs.existsSync(path.join(DOCS, 'app', 'vendor', 'katex', 'katex.min.js')), '缺 KaTeX');
});

/* 读 WebP 的真实像素尺寸（VP8 / VP8L / VP8X 三种头都要认）。
   首屏大图是靠 srcset 的宽度描述符挑文件的，描述符和图片实际宽度对不上时，
   浏览器会挑错文件、按错误的比例占位，页面会跳一下——这种错很隐蔽，
   只有把描述符和真实尺寸对一遍才能发现。 */
function webpSize(file) {
  const b = fs.readFileSync(file);
  const tag = b.toString('ascii', 12, 16);
  if (tag === 'VP8X') {
    return { w: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
             h: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1 };
  }
  if (tag === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (tag === 'VP8 ') {
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  throw new Error('认不出的 WebP 头：' + tag);
}

t('首屏大图的 srcset 宽度描述符与图片真实尺寸一致', () => {
  const m = html.match(/srcset="([^"]*hero-panel[^"]*)"/);
  assert(m, '首页里找不到 hero-panel 的 srcset');
  const items = m[1].split(',').map((x) => x.trim().split(/\s+/));
  assert(items.length >= 2, 'srcset 至少要有 1x 和 2x 两个候选');
  items.forEach(([url, desc]) => {
    const declared = parseInt(desc, 10);
    assert(declared > 0, url + ' 缺少宽度描述符');
    const p = path.join(DOCS, url);
    assert(fs.existsSync(p), 'srcset 里的 ' + url + ' 不存在');
    const real = webpSize(p);
    assert(real.w === declared,
      url + ' 描述符写的是 ' + declared + 'w，图片实际宽 ' + real.w);
  });
  /* width/height 属性决定占位比例，也必须和真图一致，否则加载时会跳版。
     注意要在 <img ... hero-panel ...> 这一段里找：
     整页直接搜 width="N" height="N" 会先撞上行内 SVG 图标（15×15）。 */
  const imgTag = html.match(/<img[^>]*hero-panel[^>]*>/);
  assert(imgTag, '找不到首屏大图的 <img>');
  const dim = imgTag[0].match(/width="(\d+)"\s+height="(\d+)"/);
  assert(dim, '首屏大图缺少 width/height 属性');
  const real1x = webpSize(path.join(DOCS, items[0][0]));
  assert(parseInt(dim[1], 10) === real1x.w && parseInt(dim[2], 10) === real1x.h,
    'width/height 属性（' + dim[1] + '×' + dim[2] + '）与图片实际尺寸（' +
    real1x.w + '×' + real1x.h + '）不一致');
});

t('断网兜底快照存在，且与 site.js 的 FALLBACK 指同一个文件', () => {
  /* 曾经写错路径：生成到 docs/releases.json，页面却 fetch site/releases.json，
     线上 404，断网兜底等于没有。加自检防止再犯。 */
  const m = siteJs.match(/FALLBACK\s*=\s*'([^']+)'/);
  assert(m, 'site.js 里找不到 FALLBACK');
  assert(fs.existsSync(path.join(DOCS, m[1])), 'FALLBACK 指向的 ' + m[1] + ' 不存在');
});

t('发布目录带 .nojekyll（否则 GitHub Pages 会吃掉下划线开头的文件）', () => {
  assert(fs.existsSync(path.join(DOCS, '.nojekyll')), '缺少 docs/.nojekyll');
});

t('在线试用页在 app/ 下，且带 noindex', () => {
  const appIndex = path.join(DOCS, 'app', 'index.html');
  assert(fs.existsSync(appIndex), '缺少 docs/app/index.html');
  const a = fs.readFileSync(appIndex, 'utf8');
  assert(/name="robots"[^>]*noindex/i.test(a), '在线试用页没有 noindex（会和首页抢收录）');
});

t('页面标题与描述不为空（分享出去要有像样的标题）', () => {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  assert(m && m[1].trim().length >= 4, '标题为空或过短');
  const d = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  assert(d && d[1].trim().length >= 20, '缺少或过短的 description');
});

t('CSS 里没有指向已删除元素的规则残留', () => {
  // hero-shot-phone 是删掉的手机小图，样式若还在说明没清干净
  assert(siteCss.indexOf('hero-shot-phone') < 0, 'CSS 里还留着 hero-shot-phone');
});

t('在线试用版与仓库源码同步（改了源码要重跑 make-site.js）', () => {
  /* docs/app/ 是 www/ 的拷贝，而 www/ 是仓库根目录源码的拷贝。
     改了根目录的 .js/.css 却忘了重新生成，官网的在线试用就会跑旧代码。 */
  const files = ['engine.js', 'report.js', 'markdown.js', 'ui.js',
    'trig.js', 'trig-report.js', 'trig-ui.js', 'styles.css'];
  const drift = [];
  files.forEach((f) => {
    const a = path.join(ROOT, f);
    const b = path.join(DOCS, 'app', f);
    if (!fs.existsSync(a) || !fs.existsSync(b)) return;
    if (fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8')) drift.push(f);
  });
  assert(drift.length === 0,
    '这些文件与仓库源码不一致：' + drift.join('、') + '（跑 node scripts/make-site.js 重新生成）');
});

t('首屏顶栏在深色 hero 上是透明的（不能压一条浅色横条）', () => {
  const i = siteCss.indexOf('.topbar {');
  assert(i > 0, '找不到 .topbar 规则');
  const block = siteCss.slice(i, siteCss.indexOf('}', i));
  assert(/background:\s*transparent/.test(block), '首屏顶栏不是透明的，会和深色 hero 撞成硬边');
  assert(siteCss.indexOf('.topbar.solid') > 0, '缺少滚过 hero 后的实心态');
});

/* 部署脚本里有两处「删掉也能跑、但会悄悄出错」的地方，钉住它。
   不是格式偏好，是踩过的坑：
   - core.autocrlf=false：本机是 Windows 且 core.autocrlf=true，
     不显式关掉，git archive 会把 HTML/CSS/JS 的 LF 全转成 CRLF，
     服务器上那份就不再等于 GitHub Pages 那份（曾多出 525 个 CR 字节）。
   - 未提交改动的拦截：部署的是 git 里那一份，工作区改了没提交不会生效，
     不拦住就会出现「以为更新了其实没有」。 */
t('部署脚本保留了「从 git 导出 / 换行符 / 未提交改动」三道守卫', () => {
  const p = path.join(ROOT, 'scripts', 'deploy-site.sh');
  assert(fs.existsSync(p), '找不到 scripts/deploy-site.sh');
  /* 只看真正的命令行。注释里提到这些关键字不算数 —— 这点是实测出来的：
     一开始直接搜整个文件，把 core.autocrlf=false 从命令里删掉、
     注释还留着，测试照样通过，等于没测。 */
  const code = fs.readFileSync(p, 'utf8')
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  assert(/^git\b[^\n]*-c core\.autocrlf=false[^\n]*archive\b/m.test(code),
    'git archive 没带 -c core.autocrlf=false —— 本机 core.autocrlf=true，' +
    '换行符会被转成 CRLF，服务器与 GitHub Pages 的内容就不再是同一份');
  assert(/^git\b[^\n]*archive[^\n]*HEAD:docs/m.test(code),
    '部署脚本不是从 git 已提交的 docs/ 导出的 —— 那样两个站点就不再同源');
  assert(/tr -cd '\\r'/.test(code),
    '缺少「包内 CR 字节数必须为 0」的检查');
  assert(/^if ! git diff --quiet -- docs\//m.test(code),
    '缺少未提交改动的拦截（不拦就会出现「以为更新了其实没有」）');
});

/* 安装包镜像。这里的每一条都对应一个具体的坑：
   - 不在镜像站上却去取 dl-mirror.json：GitHub Pages 上没有这个文件，
     白白多一次 404 请求。
   - 不比对版本就用镜像地址：刚发新版、镜像还没同步时，按钮会指向
     一个不存在的文件，用户点了直接 404 —— 比慢更糟。
   - 镜像目录混进站点目录：站点是「整份替换」部署的，217MB 的安装包
     会跟着被删掉，而且会一起提交进 git 和 Pages。 */
t('镜像只在自己的服务器上启用（GitHub Pages 上没有 dl/ 目录）', () => {
  const m = siteJs.match(/var MIRROR_HOSTS\s*=\s*\[([^\]]*)\]/);
  assert(m, 'site.js 里找不到 MIRROR_HOSTS');
  assert(/'43\.155\.128\.66'/.test(m[1]),
    'MIRROR_HOSTS 里没有服务器 IP，镜像等于没接上');
  assert(/function onMirrorHost\(\)[\s\S]{0,200}indexOf\(location\.hostname\)/.test(siteJs),
    'onMirrorHost() 不是按 location.hostname 判断的');
  assert(/function loadMirror\(\)\s*\{[\s\S]{0,200}!onMirrorHost\(\)\)\s*return Promise\.resolve\(null\)/.test(siteJs),
    'loadMirror() 没有先判断是不是在镜像站上 —— 在 GitHub Pages 上会多一次必然 404 的请求');
});

t('镜像地址要版本对得上才用，否则退回 GitHub 链接', () => {
  const fn = siteJs.match(/function mirrorUrl\(asset, release\)\s*\{[\s\S]*?\n  \}/);
  assert(fn, 'site.js 里找不到 mirrorUrl()');
  assert(/mirror\.tag\s*!==\s*release\.tag/.test(fn[0]),
    'mirrorUrl() 没有比对版本号 —— 刚发新版、镜像还没同步时，' +
    '按钮会指向不存在的文件，用户点了直接 404');
  assert(/mirror\.assets\[asset\.name\]/.test(fn[0]),
    'mirrorUrl() 没有检查清单里到底有没有这个文件名');
  assert(/btn\.href\s*=\s*localUrl\s*\|\|\s*asset\.url/.test(siteJs),
    '下载按钮没有在「有镜像用镜像、没有退回 GitHub」之间做选择');
});

t('镜像同步脚本：先校验后改名，失败不清理旧版本', () => {
  const p = path.join(ROOT, 'scripts', 'mirror-releases.sh');
  assert(fs.existsSync(p), '找不到 scripts/mirror-releases.sh');
  const code = fs.readFileSync(p, 'utf8')
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  /* 下到 .part 再改名：中途断了不会留下一个「看着存在、其实是半截」的安装包，
     而官网正是靠「文件在不在」决定要不要用镜像地址。 */
  assert(/curl[^\n]*-o "\$FILE\.part"/.test(code),
    '不是先下到 .part —— 下载中断会留下半截文件，官网会把它当成完整安装包');
  assert(/sha256sum "\$FILE\.part"/.test(code),
    '改名之前没有校验 sha256');
  assert(/mv -f "\$FILE\.part" "\$FILE"/.test(code),
    '缺少 .part 改名到正式文件这一步');
  /* API 挂了/某个文件没下成，就不能动旧版本，否则镜像会变成空的 */
  assert(/if \[ "\$FAILED" = "0" \]; then[\s\S]{0,600}?find "\$DEST"/.test(code),
    '清理旧版本没有以「本次全部成功」为前提 —— 拉取失败时会把还能用的旧文件删掉');
  /* 两个实例同时跑会写同一个 .part 文件 */
  assert(/flock -n 9/.test(code),
    '没有加锁 —— 手动触发撞上定时任务时，两边会同时写同一个 .part 文件');
  /* 清单只列校验通过的文件，所以必须在下载之后写 */
  const iDl = code.indexOf('mv -f "$FILE.part" "$FILE"');
  const iManifest = code.indexOf('dl-mirror.json.tmp');
  assert(iDl > 0 && iManifest > iDl,
    '清单在文件就位之前就写了 —— 页面会拿到一个指向不存在文件的地址');
});

t('Caddy 把镜像目录单独挂出来，且不混进站点目录', () => {
  const p = path.join(ROOT, 'scripts', 'server', 'Caddyfile');
  assert(fs.existsSync(p), '找不到 scripts/server/Caddyfile（服务器配置的母本）');
  const conf = fs.readFileSync(p, 'utf8');

  assert(/handle_path \/dl\/\*/.test(conf), 'Caddyfile 里没有 /dl/* 的处理规则');
  assert(/root \* \/srv\/qel-downloads/.test(conf),
    '/dl/* 没有指向独立的镜像目录 —— 混进站点目录的话，' +
    '下次整份替换部署会把这 217MB 一起删掉');
  assert(/handle \/dl-mirror\.json[\s\S]{0,300}?Cache-Control "no-cache"/.test(conf),
    '镜像清单没有设成不缓存 —— 缓存住会出现「文件同步好了，页面还指着 GitHub」');
  /* 安装包文件名带版本号，内容不会变，可以长期缓存 */
  assert(/handle_path \/dl\/\*[\s\S]{0,300}?immutable/.test(conf),
    '安装包没有长期缓存，重复下载会白白再走一遍网络');
});

t('部署脚本会把镜像脚本装到服务器并核对版本', () => {
  const code = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy-site.sh'), 'utf8')
    .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert(/--setup/.test(code), 'deploy-site.sh 没有 --setup');
  assert(/qel-mirror-releases\.sh/.test(code), '--setup 没有安装镜像脚本');
  assert(/qel-mirror\.timer/.test(code), '--setup 没有装定时器');
  /* 光看清单不够：清单对了，文件也可能没有读权限 */
  assert(/dl\/\$F/.test(code) || /"\$URL\/dl\/\$F"/.test(code),
    '部署后没有真的去取一次镜像文件 —— 清单存在不等于文件能被下载');
  assert(/"\$TAG" = "\$MTAG"/.test(code),
    '部署后没有核对镜像版本与最新发布是否一致');
});

console.log('\n  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
