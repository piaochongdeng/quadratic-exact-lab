/* 使用说明自检：node tests/help.test.js
 * 检查三件事：
 *   1. help.js 与 docs/USAGE.md 完全一致（App 里的说明不会和仓库文档走样）
 *   2. 说明正文能被自带 Markdown 渲染器渲染，且每个公式都能被 KaTeX 排版
 *   3. 说明里承诺的功能在 index.html 里真的存在（数学键盘、设置、快捷键、弹窗）
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const Help = require(path.join(ROOT, 'help.js'));
const Md = require(path.join(ROOT, 'markdown.js'));
const katex = require(path.join(ROOT, 'vendor/katex/katex.min.js'));
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MD_FILE = fs.readFileSync(path.join(ROOT, 'docs', 'USAGE.md'), 'utf8').replace(/\r\n?/g, '\n');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (err) { fail++; console.log('  FAIL ' + name + '\n       ' + (err && err.message)); }
}

console.log('\n[1] 文档与 App 内说明同源');
t('help.js 与 docs/USAGE.md 逐字一致', () => {
  assert.strictEqual(Help.markdown, MD_FILE, 'help.js 与 docs/USAGE.md 不一致，请跑 node scripts/make-help.js');
});
t('help.js 提供标题与版本号', () => {
  assert.ok(typeof Help.title === 'string' && Help.title.length > 0, '缺少标题');
  assert.ok(/^\d+\.\d+\.\d+$/.test(Help.version), '版本号格式不对：' + Help.version);
});
t('index.html 在 ui.js 之前加载 help.js', () => {
  const order = [...HTML.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  assert.ok(order.indexOf('help.js') >= 0, 'index.html 没有引入 help.js');
  assert.ok(order.indexOf('help.js') < order.indexOf('ui.js'), 'help.js 必须在 ui.js 之前加载');
});
t('打包清单里也有 help.js', () => {
  const mk = fs.readFileSync(path.join(ROOT, 'scripts', 'make-www.js'), 'utf8');
  assert.ok(/['"]help\.js['"]/.test(mk), 'scripts/make-www.js 的 FILES 里没有 help.js');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const files = (pkg.build && pkg.build.files) || [];
  assert.ok(files.some(f => String(f).indexOf('help.js') >= 0), 'package.json 的 build.files 里没有 help.js');
});

console.log('\n[2] 说明正文能渲染');
const renderer = Md.createRenderer(katex);
const html = renderer.render(Help.markdown);

t('渲染出完整的章节结构', () => {
  const h1 = (html.match(/<h1/g) || []).length;
  const h2 = (html.match(/<h2/g) || []).length;
  assert.strictEqual(h1, 1, '应该只有一个一级标题，实际 ' + h1);
  assert.ok(h2 >= 12, '二级章节太少：' + h2);
  assert.ok((html.match(/<table/g) || []).length >= 4, '表格太少');
  assert.ok((html.match(/<ul>/g) || []).length >= 3, '列表太少');
});

t('没有残留的 $ 与占位符', () => {
  assert.strictEqual(html.split('$$').join('').indexOf('$'), -1, '有未渲染的 $');
  assert.strictEqual(html.indexOf('\u0001'), -1, '有残留占位符');
});

t('每个公式都能被 KaTeX 排版', () => {
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let m, n = 0;
  while ((m = re.exec(Help.markdown)) !== null) {
    const tex = (m[1] !== undefined ? m[1] : m[2]);
    n++;
    let out;
    try {
      out = katex.renderToString(tex, { displayMode: m[1] !== undefined, throwOnError: true, strict: false });
    } catch (e) {
      throw new Error('KaTeX 无法排版：$' + tex + '$ → ' + e.message);
    }
    assert.ok(out.indexOf('katex-error') < 0, 'KaTeX 报错：' + tex);
  }
  assert.ok(n >= 3, '说明里的公式太少：' + n);
});

t('表格列数一致', () => {
  const lines = Help.markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*---/.test(lines[i])) {
      const cols = (l) => l.split('|').length - 2;
      const c0 = cols(lines[i - 1]), c1 = cols(lines[i]);
      assert.strictEqual(c0, c1, '表头列数不一致，第 ' + (i + 1) + ' 行');
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith('|')) {
        assert.strictEqual(cols(lines[j]), c1, '表格第 ' + (j + 1) + ' 行列数不一致');
        j++;
      }
    }
  }
});

console.log('\n[3] 说明里承诺的功能确实存在');
t('数学键盘的每个按键都在说明里写过', () => {
  const keys = [...HTML.matchAll(/<button[^>]*class="mk[^"]*"[^>]*>(.*?)<\/button>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
  assert.ok(keys.length >= 8, '数学键盘按键太少：' + keys.length);
  assert.ok(keys.indexOf('√') >= 0, '数学键盘里没有 √ 键');
  assert.ok(keys.indexOf('√( )') >= 0, '数学键盘里没有 √( ) 键');
  keys.forEach(k => {
    assert.ok(Help.markdown.indexOf(k) >= 0, '说明里没提到数学键盘的「' + k + '」');
  });
});

t('设置面板的每一项都在说明里解释过', () => {
  const ids = ['opt-decimals', 'opt-detail', 'opt-theme'];
  ids.forEach(id => assert.ok(HTML.indexOf('id="' + id + '"') >= 0, 'index.html 缺少 ' + id));
  ['小数位数', '报告详细程度', '主题'].forEach(word => {
    assert.ok(Help.markdown.indexOf(word) >= 0, '说明里没解释「' + word + '」');
  });
});

t('两个工作区各有一块数学键盘，都能在说明里查到', () => {
  const pads = [...HTML.matchAll(/<div class="math-keys" id="([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(pads, ['math-keys', 'trig-math-keys'], '数学键盘的位置或数量变了：' + pads.join('、'));
  assert.ok(Help.markdown.indexOf('两个工作区') >= 0, '说明里没讲清楚两块键盘');

  /* 两块键盘必须一模一样：用户在两个工作区之间来回切，不该有两套肌肉记忆 */
  const keysOf = (id) => {
    const seg = HTML.split(`<div class="math-keys" id="${id}"`)[1].split('</div>')[0];
    return [...seg.matchAll(/data-(?:insert|action)="([^"]+)"/g)].map(m => m[1]).join(',');
  };
  const quad = keysOf('math-keys');
  const trig = keysOf('trig-math-keys');
  assert.strictEqual(trig, quad, '三角函数的键盘与二次函数的不一致：\n  ' + quad + '\n  ' + trig);
  assert.ok(quad.split(',').length >= 10, '键位太少，只有 ' + quad.split(',').length + ' 个');
  ['√', '/', '^', '×'].forEach(k => {
    assert.ok(quad.split(',').indexOf(k) >= 0, '键盘缺少 ' + k + ' 键');
  });
});

t('设置与说明都是弹窗，且共用一套开关', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8');
  ['settings-modal', 'settings-backdrop', 'settings-close'].forEach(frag => {
    assert.ok(HTML.indexOf(frag) >= 0, 'index.html 缺少 ' + frag);
  });
  assert.ok(/openSettings:/.test(ui) && /closeSettings:/.test(ui), 'ui.js 没有暴露设置弹窗的开关');
  /* 两个弹窗都要能被 Esc 关掉 */
  assert.ok(/SettingsPanel\.isOpen\(\)\) \{ SettingsPanel\.close\(\); return; \}/.test(ui), 'Esc 没有关掉设置弹窗');
});

t('说明里列的快捷键与 ui.js 里的一致', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8');
  assert.ok(/k === 'r'/.test(ui), 'ui.js 里没有 R 键复位');
  assert.ok(/k === 'm'/.test(ui), 'ui.js 里没有 M 键切工具');
  assert.ok(/ev\.key === '\?'/.test(ui), 'ui.js 里没有 ? 键开说明');
  assert.ok(/ev\.key === 'Escape'/.test(ui), 'ui.js 里没有 Esc 关弹窗');
  assert.ok(/k === ','/.test(ui), 'ui.js 里没有 , 键开设置');
  ['`C`', '`T`', '`R`', '`M`', '`,`', '`?`', '`Esc`'].forEach(k => {
    assert.ok(Help.markdown.indexOf(k) >= 0, '说明里漏了快捷键 ' + k);
  });
});

t('说明里的报错文案与真实报错对得上', () => {
  const E = require(path.join(ROOT, 'engine.js'));
  const Report = require(path.join(ROOT, 'report.js'));
  const cases = [
    /* 引擎层：解析类错误 */
    [() => E.parseExact('(1+2'), '括号没有配对'],
    [() => E.parseExact('1/(1-1)'), '除数不能为 0'],
    [() => E.parseExact('\u221a(-4)'), '负数不能开平方'],
    [() => E.parseExact('\u221a(1+\u221a5)'), '不能写成有限根式'],
    [() => E.parseExact('2^100'), '指数太大'],
    /* 报告层：输入校验类错误 */
    [() => Report.build({ form: 'vertex', a: '1', h: '', k: '0' }), '不能为空'],
    [() => Report.build({ form: 'general', a: 'abc', b: '1', c: '1' }), '无法识别'],
    [() => Report.build({ form: 'general', a: '0', b: '1', c: '1' }), 'a 不能为 0'],
    [() => Report.build({ form: 'general', a: '1', b: '0', c: '-\u221a2' }), '超出了本工具能表示的根式范围']
  ];
  cases.forEach(function (c) {
    var err = '';
    var r = null;
    try { r = c[0](); } catch (e) { err = e.message; }
    if (!err && r && r.error) err = r.error;
    assert.ok(err.indexOf(c[1]) >= 0, '实际报错与预期不符：' + err);
    assert.ok(Help.markdown.indexOf(c[1]) >= 0, '说明里没写报错「' + c[1] + '」');
  });
});

console.log('========================================');
process.exit(fail ? 1 : 0);
