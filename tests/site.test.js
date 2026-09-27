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

console.log('\n  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
