/*!
 * quadratic-exact-lab · make-site.js
 * ------------------------------------------------------------------
 * 把官网要发布的东西拼到 docs/ 下（GitHub Pages 的发布目录）：
 *
 *   docs/app/**          在线试用版（与桌面/安卓同一套代码，直接复用 www/）
 *   docs/site/releases.json   最新发布快照，作为官网下载区的兜底数据
 *                             （路径必须和 site.js 里的 FALLBACK 一致）
 *   docs/.nojekyll       关掉 Jekyll，避免它多管闲事
 *
 * 官网页面本身（docs/index.html、docs/site/**）是手写的，不由本脚本生成。
 *
 * 用法：
 *   node scripts/make-site.js            正常生成
 *   node scripts/make-site.js --offline  不访问 GitHub，只用现有 releases.json
 *
 * 关于「以后更新自动同步」：官网下载区优先实时读 GitHub Releases API，
 * 所以发新版之后官网自己就变了，不需要重跑本脚本。
 * releases.json 只是 API 被限流/断网时的兜底，重跑一次即可刷新。
 * ------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const OUT = path.join(ROOT, 'docs');
const OUT_APP = path.join(OUT, 'app');

const REPO = 'piaochongdeng/quadratic-exact-lab';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

const OFFLINE = process.argv.includes('--offline');

/* 与 make-www.js 保持一致的运行时清单：官网试用版就是 www/ 的内容 */
const FILES = [
  'index.html', 'styles.css', 'engine.js', 'report.js',
  'markdown.js', 'help.js', 'ui.js',
  'trig.js', 'trig-report.js', 'trig-ui.js'
];
const DIRS = ['vendor'];

/* 拒绝把不该发布的目录混进来（与 make-www.js 同一套护栏） */
const FORBIDDEN = /(^|[\\/])(node_modules|desktop|tests|dist-desktop|dist-release|android|scripts|\.git)([\\/]|$)/;

let failed = 0;
function ok(msg) { console.log('  \u2713 ' + msg); }
function bad(msg) { console.log('  \u2717 ' + msg); failed++; }
function warn(msg) { console.log('  ! ' + msg); }

/* ===================== 1. 复制在线试用版 ===================== */
function copyTrial() {
  console.log('\n[1/4] 在线试用版 → docs/app/');

  if (!fs.existsSync(WWW)) {
    bad('找不到 www/，先跑 node scripts/make-www.js');
    return;
  }

  fs.rmSync(OUT_APP, { recursive: true, force: true });
  fs.mkdirSync(OUT_APP, { recursive: true });

  let n = 0;
  for (const f of FILES) {
    const src = path.join(WWW, f);
    if (!fs.existsSync(src)) { bad(`www/ 缺少 ${f}`); continue; }
    if (FORBIDDEN.test(path.relative(ROOT, src))) { bad(`拒绝复制 ${f}`); continue; }
    fs.copyFileSync(src, path.join(OUT_APP, f));
    n++;
  }
  ok(`${n} 个文件`);

  let dn = 0;
  for (const d of DIRS) {
    const src = path.join(WWW, d);
    if (!fs.existsSync(src)) { bad(`www/ 缺少目录 ${d}/`); continue; }
    if (FORBIDDEN.test(path.relative(ROOT, src))) { bad(`拒绝复制目录 ${d}`); continue; }
    copyTree(src, path.join(OUT_APP, d));
    dn++;
  }
  ok(`${dn} 个目录（KaTeX）`);

  // 试用版首页的标题加个前缀，免得和官网首页在标签页里分不清
  const appIndex = path.join(OUT_APP, 'index.html');
  if (fs.existsSync(appIndex)) {
    let html = fs.readFileSync(appIndex, 'utf8');
    if (!/quadratic-exact-lab · 在线版/.test(html)) {
      html = html.replace(/<title>([^<]*)<\/title>/,
        '<title>quadratic-exact-lab · 在线版</title>');
      html = html.replace('</head>',
        '<meta name="robots" content="noindex">\n</head>');
      fs.writeFileSync(appIndex, html);
    }
    ok('已标注在线版标题');
  }
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

/* ===================== 2. 检查图片素材 ===================== */
function checkImages() {
  console.log('\n[2/4] 官网配图 → docs/site/img/');

  const dir = path.join(OUT, 'site', 'img');
  if (!fs.existsSync(dir)) {
    bad('docs/site/img/ 不存在，先跑：\n      node scripts/make-screenshots.js\n      py scripts/optimize-screens.py');
    return;
  }

  const need = [
    'desktop-quad.webp', 'desktop-quad-report.webp', 'desktop-interval.webp',
    'desktop-trig.webp', 'phone-quad.webp', 'phone-report.webp', 'phone-trig.webp'
  ];
  let bytes = 0, missing = 0;
  for (const f of need) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) { bad(`缺少 ${f}`); missing++; continue; }
    bytes += fs.statSync(p).size;
  }
  if (!missing) {
    ok(`${need.length} 张（合计 ${(bytes / 1048576).toFixed(2)} MB，不含 @2x）`);
  }
}

/* ===================== 3. 生成发布快照 ===================== */
function gitToken() {
  try {
    const out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
    });
    const m = out.match(/^password=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch (e) {
    return '';
  }
}

/* 拿最新发布。优先走 gh（本机已登录，网络最稳），
   不行再退回 Node 的 fetch。两条路都失败就让调用方决定怎么办。 */
async function fetchRelease() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || gitToken();

  try {
    const out = execFileSync('gh', ['api', `repos/${REPO}/releases/latest`], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: Object.assign({}, process.env, token ? { GH_TOKEN: token } : {}),
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const json = JSON.parse(out);
    if (json && json.tag_name) return json;
    throw new Error('gh 返回的内容里没有 tag_name');
  } catch (e) {
    const viaGh = e.message;
    const headers = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'quadratic-exact-lab-make-site'
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API, { headers });
    if (!res.ok) {
      throw new Error(`gh 失败（${viaGh}），fetch 也返回 ${res.status}`);
    }
    return res.json();
  }
}

/* 资产归类规则必须与 docs/site/site.js 里的 pickAsset 一致 */
function pickAsset(assets, kind) {
  const apks = assets.filter((a) => /\.apk$/i.test(a.name));
  const exes = assets.filter((a) => /\.exe$/i.test(a.name));
  const zips = assets.filter((a) => /\.zip$/i.test(a.name));

  if (kind === 'android') {
    if (!apks.length) return null;
    const rel = apks.filter((a) => /release/i.test(a.name));
    const pool = rel.length ? rel : apks;
    const uni = pool.filter((a) => !/(arm64|armeabi|armv7|x86_64|x86)/i.test(a.name));
    return (uni.length ? uni : pool)[0];
  }
  if (kind === 'win-setup') {
    if (!exes.length) return null;
    const x64 = exes.filter((a) => /x64|amd64|64/i.test(a.name));
    return (x64.length ? x64 : exes)[0];
  }
  if (kind === 'win-zip') {
    if (!zips.length) return null;
    const xz = zips.filter((a) => /x64|amd64|win/i.test(a.name));
    return (xz.length ? xz : zips)[0];
  }
  return null;
}

async function writeReleasesJson() {
  /* 必须和 site.js 里的 FALLBACK 指向同一个文件：
     之前写的是 docs/releases.json，而页面 fetch 的是 site/releases.json，
     线上一直 404，断网兜底等于没有（上线后 curl 才发现）。 */
  console.log('\n[3/4] 发布快照 → docs/site/releases.json');
  const dst = path.join(OUT, 'site', 'releases.json');
  fs.mkdirSync(path.dirname(dst), { recursive: true });

  if (OFFLINE) {
    warn('--offline：保持现有 releases.json 不变');
    if (!fs.existsSync(dst)) bad('releases.json 不存在，去掉 --offline 再跑一次');
    return;
  }

  let json;
  try {
    json = await fetchRelease();
  } catch (e) {
    warn('读取 GitHub Releases 失败：' + e.message);
    if (fs.existsSync(dst)) {
      warn('保留现有 releases.json（官网仍可实时读取 API）');
    } else {
      bad('既拿不到线上数据，本地也没有快照');
    }
    return;
  }

  const assets = (json.assets || []).map((a) => ({
    name: a.name,
    size: a.size,
    count: a.download_count,
    url: a.browser_download_url,
    /* GitHub 现在直接给 sha256（形如 "sha256:abc…"），不用自己记账 */
    sha256: String(a.digest || '').replace(/^sha256:/, '') || null
  }));

  const snapshot = {
    tag: json.tag_name || json.name || '未知版本',
    date: json.published_at || '',
    htmlUrl: json.html_url || `https://github.com/${REPO}/releases`,
    note: '由 scripts/make-site.js 生成，供官网在 GitHub API 不可用时兜底显示。',
    assets
  };

  fs.writeFileSync(dst, JSON.stringify(snapshot, null, 2) + '\n');

  const got = ['android', 'win-setup', 'win-zip']
    .map((k) => { const a = pickAsset(assets, k); return k + '=' + (a ? a.name : '无'); })
    .join('  ');
  ok(`${snapshot.tag}（${snapshot.date.slice(0, 10)}）`);
  ok(got);

  const missing = ['android', 'win-setup', 'win-zip']
    .filter((k) => !pickAsset(assets, k));
  if (missing.length) bad('发布里缺少这些平台的资产：' + missing.join(', '));
}

/* ===================== 4. 收尾 ===================== */
function finish() {
  console.log('\n[4/4] 收尾');

  const nojekyll = path.join(OUT, '.nojekyll');
  fs.writeFileSync(nojekyll, '');
  ok('.nojekyll（关掉 Jekyll）');

  const index = path.join(OUT, 'index.html');
  if (!fs.existsSync(index)) {
    bad('docs/index.html 不存在——官网首页是手写的，别把它删了');
  } else {
    ok('docs/index.html 就位');
  }

  /* 兜底快照必须和 site.js 的 FALLBACK 指同一个文件，
     否则断网时页面白等一场（曾经写错路径，线上 404）。 */
  const siteJsPath = path.join(OUT, 'site', 'site.js');
  if (fs.existsSync(siteJsPath)) {
    const m = fs.readFileSync(siteJsPath, 'utf8').match(/FALLBACK\s*=\s*'([^']+)'/);
    if (!m) {
      bad('site.js 里找不到 FALLBACK 定义');
    } else if (!fs.existsSync(path.join(OUT, m[1]))) {
      bad('site.js 的兜底 ' + m[1] + ' 不存在（断网时下载区会没有数据）');
    } else {
      ok('兜底快照 ' + m[1] + ' 就位（与 site.js 的 FALLBACK 一致）');
    }
  }

  /* 发布前自检：页面里引用的本地文件是否都真的存在 */
  const html = fs.readFileSync(index, 'utf8');
  const refs = [];
  const re = /(?:src|href)="([^"#:?]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[1];
    if (/^(https?:|mailto:|data:|\/\/)/.test(u)) continue;
    if (u.endsWith('.md')) continue; /* 文档走 GitHub 渲染 */
    refs.push(u.split('?')[0]);
  }
  let miss = 0;
  for (const r of refs) {
    if (!fs.existsSync(path.join(OUT, r))) { bad(`首页引用了不存在的文件：${r}`); miss++; }
  }
  if (!miss) ok(`${refs.length} 个本地引用全部存在`);
}

/* ===================== main ===================== */
(async function main() {
  console.log('生成官网发布目录 → docs/');
  copyTrial();
  checkImages();
  await writeReleasesJson();
  finish();

  console.log('');
  if (failed) {
    console.log(`失败 ${failed} 项，先修好再发布。`);
    process.exit(1);
  }
  console.log('完成。发布目录：docs/');
})();
