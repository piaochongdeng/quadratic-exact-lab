/* 报告生成 + LaTeX 合法性自检：node tests/report.test.js */
'use strict';
const assert = require('assert');
const E = require('../engine.js');
const Report = require('../report.js');
let katex = null;
try { katex = require('../vendor/katex/katex.min.js'); } catch (e) { katex = null; }

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (err) { fail++; console.log('  FAIL ' + name + '\n       ' + (err && err.message)); }
}

/* 抽出所有数学片段：$$...$$ 优先，其次 $...$ */
function extractMath(md) {
  const out = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let mt;
  while ((mt = re.exec(md)) !== null) {
    out.push({ tex: (mt[1] !== undefined ? mt[1] : mt[2]), display: mt[1] !== undefined });
  }
  return out;
}

/* 检查一个公式是否明显畸形 */
function malformed(tex) {
  const bad = [];
  if (/[-+]\s*[-+]/.test(tex)) bad.push('连续运算符: ' + tex);
  if (/\\dfrac\{\}|\\frac\{\}\{\}|\\frac\{[^}]*\}\{\}/.test(tex)) bad.push('空分数: ' + tex);
  if (/\\sqrt\{\}/.test(tex)) bad.push('空根号: ' + tex);
  if (/[+\-]\s*$/.test(tex)) bad.push('以运算符结尾: ' + tex);
  if (/\\quad\\quad/.test(tex)) bad.push('多余间距: ' + tex);
  if (/\bx_\{?\}\b/.test(tex)) bad.push('空下标: ' + tex);
  return bad;
}

const CASES = [
  { name: '一般式 · 两个有理根', input: { form: 'general', a: '1', b: '-4', c: '3' } },
  { name: '一般式 · 无理根', input: { form: 'general', a: '1', b: '-4', c: '1' } },
  { name: '一般式 · 分数系数', input: { form: 'general', a: '1/2', b: '-3', c: '5' } },
  { name: '一般式 · 无实根', input: { form: 'general', a: '1', b: '0', c: '1' } },
  { name: '一般式 · 二重根', input: { form: 'general', a: '-2', b: '4', c: '-2' } },
  { name: '一般式 · 判别式非完全平方', input: { form: 'general', a: '2', b: '-4', c: '-1' } },
  { name: '一般式 · 过原点', input: { form: 'general', a: '3', b: '0', c: '0' } },
  { name: '顶点式 · 分数顶点', input: { form: 'vertex', a: '1/2', h: '3', k: '4' } },
  { name: '顶点式 · 负顶点', input: { form: 'vertex', a: '-1', h: '-3/2', k: '-7/4' } },
  { name: '顶点式 · a=1', input: { form: 'vertex', a: '1', h: '0', k: '0' } },
  { name: '交点式 · 分数 a', input: { form: 'factored', a: '1/3', r1: '-1', r2: '5' } },
  { name: '交点式 · 无理数系数', input: { form: 'factored', a: '-2', r1: '0', r2: '3/2' } },
  { name: '定义域 · 闭区间含顶点', input: { form: 'general', a: '1', b: '-2', c: '3', domain: { mode: 'interval', left: { value: '-1', open: false }, right: { value: '3', open: false } } } },
  { name: '定义域 · 开区间取不到顶点', input: { form: 'general', a: '1', b: '-2', c: '3', domain: { mode: 'interval', left: { value: '1', open: true }, right: { value: '4', open: false } } } },
  { name: '定义域 · 轴在左侧（单调）', input: { form: 'general', a: '1', b: '-2', c: '3', domain: { mode: 'interval', left: { value: '2', open: false }, right: { value: '4', open: false } } } },
  { name: '定义域 · 轴在右侧（单调）', input: { form: 'general', a: '-1', b: '4', c: '-1', domain: { mode: 'interval', left: { value: '-6', open: false }, right: { value: '0', open: true } } } },
  { name: '定义域 · 半无界 [3,+∞)', input: { form: 'general', a: '1', b: '-2', c: '3', domain: { mode: 'interval', left: { value: '3', open: false }, right: { value: '', open: true } } } },
  { name: '定义域 · 半无界 (-∞,0]', input: { form: 'vertex', a: '-2', h: '1', k: '5', domain: { mode: 'interval', left: { value: '', open: true }, right: { value: '0', open: false } } } },
  { name: '定义域 · 分数端点', input: { form: 'general', a: '1/2', b: '-3', c: '5', domain: { mode: 'interval', left: { value: '-1/2', open: false }, right: { value: '7/3', open: false } } } },
  { name: '三点 · 有理零点', input: { form: 'points', p1: { x: '0', y: '3' }, p2: { x: '1', y: '0' }, p3: { x: '-1', y: '0' } } },
  { name: '三点 · 无理零点', input: { form: 'points', p1: { x: '0', y: '-2' }, p2: { x: '1', y: '-1' }, p3: { x: '2', y: '2' } } },
  { name: '三点 · 分数坐标', input: { form: 'points', p1: { x: '0', y: '1/2' }, p2: { x: '1/2', y: '0' }, p3: { x: '1', y: '1/2' } } },
  { name: '三点 · 定义域区间', input: { form: 'points', p1: { x: '0', y: '3' }, p2: { x: '1', y: '0' }, p3: { x: '-1', y: '0' }, domain: { mode: 'interval', left: { value: '-2', open: false }, right: { value: '2', open: true } } } },
  { name: '一般式 · 判别式 280（根式需化简）', input: { form: 'general', a: '1', b: '0', c: '-70' } },
  { name: '一般式 · 判别式 1000（根式需化简）', input: { form: 'general', a: '1', b: '-2', c: '-249' } }
];

console.log('\n[1] 报告生成：结构完整性');
CASES.forEach(function (cs) {
  t(cs.name, function () {
    const res = Report.build(cs.input);
    assert.ok(res.ok, '生成失败：' + res.error);
    const md = res.markdown;
    assert.ok(md.startsWith('# 二次函数精确解析报告'), '缺少标题');
    ['## 一、已知条件', '## 二、各种形式的互化', '## 三、顶点与对称轴', '## 四、判别式与零点',
     '## 五、定义域与最值', '## 六、单调性', '## 七、图像特征', '## 八、精确值与近似值对照',
     '## 九、求解步骤', '## 十、结果检验'].forEach(function (h) {
      assert.ok(md.indexOf(h) >= 0, '缺少章节：' + h);
    });
    assert.ok(res.data && typeof res.data.a === 'number', '缺少绘图数据');
    // 表格列数一致
    const lines = md.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^\|\s*---/.test(lines[i])) {
        const cols = (l) => l.split('|').length - 2;
        const c0 = cols(lines[i - 1]), c1 = cols(lines[i]);
        assert.strictEqual(c0, c1, '表格列数不一致，第 ' + (i + 1) + ' 行');
        let j = i + 1;
        while (j < lines.length && lines[j].startsWith('|')) {
          assert.strictEqual(cols(lines[j]), c1, '表格第 ' + (j + 1) + ' 行列数不一致');
          j++;
        }
      }
    }
    // 美元符号成对
    assert.strictEqual((md.match(/\$/g) || []).length % 2, 0, '美元符号数量为奇数，可能有未闭合的公式');
  });
});

console.log('\n[2] 公式质量：无畸形、可被 KaTeX 正确排版');
CASES.forEach(function (cs) {
  t(cs.name, function () {
    const res = Report.build(cs.input);
    assert.ok(res.ok);
    const maths = extractMath(res.markdown);
    assert.ok(maths.length > 20, '公式数量过少：' + maths.length);
    maths.forEach(function (mm) {
      const bad = malformed(mm.tex);
      assert.deepStrictEqual(bad, [], '畸形公式：' + JSON.stringify(bad));
      if (katex) {
        let html;
        try {
          html = katex.renderToString(mm.tex, { displayMode: mm.display, throwOnError: true, strict: false });
        } catch (err) {
          throw new Error('KaTeX 无法排版：$' + mm.tex + '$\n       ' + err.message);
        }
        assert.ok(html.indexOf('katex-error') < 0, 'KaTeX 报错：' + mm.tex);
      }
    });
  });
});

console.log('\n[3] 具体结论正确性');
t('顶点式 → 一般式与顶点', function () {
  const r = Report.build({ form: 'vertex', a: '1/2', h: '3', k: '4' });
  assert.ok(r.ok, r.error);
  assert.ok(r.markdown.includes('$y = \\frac{1}{2}x^{2} - 3x + \\frac{17}{2}$'), '一般式错误');
  assert.ok(r.markdown.includes('\\frac{1}{2}(x - 3)^{2} + 4'), '顶点式错误');
  assert.ok(r.markdown.includes('$x = 3$'), '对称轴错误');
  assert.strictEqual(r.data.h, 3); assert.strictEqual(r.data.k, 4);
});
t('交点式 → 一般式与零点', function () {
  const r = Report.build({ form: 'factored', a: '1/3', r1: '-1', r2: '5' });
  assert.ok(r.markdown.includes('$y = \\frac{1}{3}x^{2} - \\frac{4}{3}x - \\frac{5}{3}$'), '一般式错误：\n' + r.markdown.slice(0, 0));
  assert.ok(r.markdown.includes('x_1 = -1'), '零点错误');
});
t('无理零点以根号表示', function () {
  const r = Report.build({ form: 'general', a: '1', b: '-4', c: '1' });
  assert.ok(r.markdown.includes('$x_1 = 2 - \\sqrt{3}$'), '缺 2-√3');
  assert.ok(r.markdown.includes('$x_2 = 2 + \\sqrt{3}$'), '缺 2+√3');
});
t('分数零点以分数表示', function () {
  const r = Report.build({ form: 'general', a: '2', b: '-1', c: '-3' });
  assert.ok(r.markdown.includes('$x_1 = -1$'), '缺 -1');
  assert.ok(r.markdown.includes('x_2 = \\frac{3}{2}'), '缺 3/2');
});
t('无实根时明确说明没有交点式', function () {
  const r = Report.build({ form: 'general', a: '1', b: '0', c: '1' });
  assert.ok(r.markdown.includes('没有实数零点'), '缺少说明');
  assert.ok(r.markdown.includes('不存在（$\\Delta < 0$'), '交点式行错误');
});
t('闭区间最值', function () {
  const r = Report.build({ form: 'general', a: '1', b: '-2', c: '3',
    domain: { mode: 'interval', left: { value: '-1', open: false }, right: { value: '3', open: false } } });
  assert.strictEqual(r.data.extrema.min.value, 2);
  assert.strictEqual(r.data.extrema.min.at, 1);
  assert.strictEqual(r.data.extrema.max.value, 6);
  assert.strictEqual(r.data.extrema.max.where, 'both-ends');
  assert.ok(r.markdown.includes('$[2,\\ 6]$'), '值域错误');
});
t('开区间端点取不到，值域用圆括号', function () {
  const r = Report.build({ form: 'general', a: '1', b: '-2', c: '3',
    domain: { mode: 'interval', left: { value: '1', open: true }, right: { value: '4', open: false } } });
  assert.strictEqual(r.data.extrema.min.attained, false);
  assert.ok(r.markdown.includes('$(2,\\ 11]$'), '值域应为 (2, 11]，实际：' + JSON.stringify(r.markdown.match(/\$\([^$]*\$/g)));
});
t('半无界定义域：无最大值', function () {
  const r = Report.build({ form: 'general', a: '1', b: '-2', c: '3',
    domain: { mode: 'interval', left: { value: '3', open: false }, right: { value: '', open: true } } });
  assert.strictEqual(r.data.extrema.max, null);
  assert.ok(r.markdown.includes('$[6,\\ +\\infty)$'), '值域应为 [6, +∞)');
});
t('a<0 且定义域在轴右侧：最大值在左端点', function () {
  const r = Report.build({ form: 'general', a: '-1', b: '4', c: '-1',
    domain: { mode: 'interval', left: { value: '3', open: false }, right: { value: '6', open: false } } });
  assert.strictEqual(r.data.extrema.max.value, 2);
  assert.strictEqual(r.data.extrema.max.at, 3);
  assert.strictEqual(r.data.extrema.min.value, -13);
  assert.ok(r.markdown.includes('单调递减'), '应说明单调递减');
});

console.log('\n[3.5] 互化章节与最简根式');
t('互化一节被拆成醒目的小节', function () {
  const r = Report.build({ form: 'vertex', a: '1/2', h: '3', k: '4' });
  assert.ok(r.ok, r.error);
  ['### 2.1 三种形式对照', '### 2.2', '### 2.3', '### 2.4'].forEach(function (h) {
    assert.ok(r.markdown.indexOf(h) >= 0, '缺少小节：' + h);
  });
  assert.ok(r.markdown.indexOf('> **一眼看清三种形式') >= 0, '缺少醒目的速览块');
  assert.ok(/\$\$y = .*\\Longleftrightarrow.*\\Longleftrightarrow/.test(r.markdown), '速览块应并列三种形式');
});

t('三点输入时报告里出现方程组与克莱姆法则', function () {
  const r = Report.build({ form: 'points', p1: { x: '0', y: '3' }, p2: { x: '1', y: '0' }, p3: { x: '-1', y: '0' } });
  assert.ok(r.ok, r.error);
  assert.ok(r.markdown.indexOf('三点确定函数的求解过程') >= 0, '缺少三点求解小节');
  assert.ok(r.markdown.indexOf('\\begin{cases}') >= 0, '缺少方程组');
  assert.ok(r.markdown.indexOf('克莱姆法则') >= 0, '缺少克莱姆法则');
  assert.ok(r.markdown.indexOf('$y = -3x^{2} + 3$') >= 0, '函数式错误');
  assert.strictEqual(r.givenPoints.length, 3, '应回传三个已知点供绘图');
  assert.strictEqual(r.data.a, -3);
});

t('所有根式都是最简根式（根号内不含平方因子）', function () {
  const squareFree = function (n) {
    if (n <= 0) return true;
    for (let i = 2; i * i <= n; i++) if (n % (i * i) === 0) return false;
    return true;
  };
  const inputs = [
    { form: 'general', a: '1', b: '0', c: '-70' },
    { form: 'general', a: '1', b: '-2', c: '-249' },
    { form: 'general', a: '2', b: '-4', c: '-1' },
    { form: 'general', a: '1', b: '0', c: '-2' },
    { form: 'general', a: '1', b: '-6', c: '1' },
    { form: 'general', a: '1', b: '0', c: '-1000' },
    { form: 'points', p1: { x: '0', y: '-2' }, p2: { x: '1', y: '-1' }, p3: { x: '2', y: '2' } },
    { form: 'general', a: '3', b: '-12', c: '5' }
  ];
  inputs.forEach(function (input) {
    const r = Report.build(input);
    assert.ok(r.ok, '生成失败：' + r.error);
    const re = /\\sqrt\{(\d+)\}/g;
    let m;
    while ((m = re.exec(r.markdown)) !== null) {
      const n = Number(m[1]);
      const after = r.markdown.slice(m.index + m[0].length, m.index + m[0].length + 4);
      if (after.indexOf(' = ') === 0) continue;      /* 化简过程「√280 = 2√70」允许出现原式 */
      assert.ok(squareFree(n), '出现未化简的根式 \\sqrt{' + n + '}（输入：' + JSON.stringify(input) + '）');
    }
  });
});

t('判别式不是完全平方时，报告展示化简过程', function () {
  const r = Report.build({ form: 'general', a: '1', b: '0', c: '-70' });
  assert.ok(r.markdown.indexOf('\\sqrt{280} = 2\\sqrt{70}') >= 0, '缺少 √280 的化简过程');
  assert.ok(r.markdown.indexOf('2\\sqrt{70}') >= 0);
  assert.ok(r.markdown.indexOf('\\sqrt{280}') < 0 || r.markdown.indexOf('\\sqrt{280} = ') >= 0, '不应出现孤立的 √280');
});

console.log('\n[4] 错误处理');
t('a = 0 报错', function () {
  const r = Report.build({ form: 'general', a: '0', b: '1', c: '1' });
  assert.strictEqual(r.ok, false);
  assert.ok(/a 不能为 0/.test(r.error), r.error);
});
t('空输入报错', function () {
  const r = Report.build({ form: 'vertex', a: '1', h: '', k: '0' });
  assert.strictEqual(r.ok, false);
  assert.ok(/不能为空/.test(r.error), r.error);
});
t('非法输入报错', function () {
  const r = Report.build({ form: 'general', a: 'abc', b: '1', c: '1' });
  assert.strictEqual(r.ok, false);
  assert.ok(/无法识别/.test(r.error), r.error);
});
t('端点顺序颠倒报错', function () {
  const r = Report.build({ form: 'general', a: '1', b: '0', c: '0',
    domain: { mode: 'interval', left: { value: '3', open: false }, right: { value: '1', open: false } } });
  assert.strictEqual(r.ok, false);
  assert.ok(/不能大于/.test(r.error), r.error);
});
t('三点共线被拦截', function () {
  const r = Report.build({ form: 'points', p1: { x: '1', y: '0' }, p2: { x: '2', y: '3' }, p3: { x: '3', y: '6' } });
  assert.strictEqual(r.ok, false);
  assert.ok(/共线/.test(r.error), r.error);
});
t('三点中有两点横坐标相同被拦截', function () {
  const r = Report.build({ form: 'points', p1: { x: '1', y: '0' }, p2: { x: '1', y: '5' }, p3: { x: '3', y: '6' } });
  assert.strictEqual(r.ok, false);
  assert.ok(/横坐标相同/.test(r.error), r.error);
});
t('三点缺坐标被拦截', function () {
  const r = Report.build({ form: 'points', p1: { x: '1', y: '0' }, p2: { x: '2', y: '' }, p3: { x: '3', y: '6' } });
  assert.strictEqual(r.ok, false);
  assert.ok(/不能为空/.test(r.error), r.error);
});
t('小数输入被精确转为分数', function () {
  const r = Report.build({ form: 'general', a: '0.5', b: '-1.25', c: '0.75' });
  assert.ok(r.ok, r.error);
  assert.ok(r.markdown.includes('$a = \\frac{1}{2}$') || r.markdown.includes('a = \\frac{1}{2}'), 'a 未转分数');
  assert.ok(r.markdown.includes('\\frac{5}{4}'), 'b 未转分数');
});

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项' + (katex ? '（含 KaTeX 排版校验）' : '（未加载 KaTeX）'));
console.log('========================================\n');
process.exit(fail ? 1 : 0);
