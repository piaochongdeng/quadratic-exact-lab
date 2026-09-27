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
    ['## 一、结论速览', '### 1.1 顶点坐标与对称轴', '### 1.2 定义域上的最值与值域', '### 1.3 三种形式的互化',
     '## 二、已知条件', '## 三、判别式与零点', '## 四、图像特征',
     '## 五、配方与因式分解详解', '## 六、单调性', '## 七、精确值与近似值对照',
     '## 八、求解步骤', '## 九、结果检验'].forEach(function (h) {
      assert.ok(md.indexOf(h) >= 0, '缺少章节：' + h);
    });
    /* 结论必须排在前面：顶点 / 最值 / 三式互化都排在第二章之前 */
    const at = (h) => md.indexOf(h);
    assert.ok(at('### 1.1 顶点坐标与对称轴') < at('## 二、已知条件'), '顶点结论应排在最前面');
    assert.ok(at('### 1.2 定义域上的最值与值域') < at('## 二、已知条件'), '最值结论应排在最前面');
    assert.ok(at('### 1.3 三种形式的互化') < at('## 二、已知条件'), '三式互化应排在最前面');
    assert.ok(at('## 二、已知条件') < at('## 五、配方与因式分解详解'), '推导细节应排在结论之后');
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

console.log('\n[3.5] 结论速览与最简根式');
t('结论速览把顶点、最值、三式互化摆在一起', function () {
  const r = Report.build({ form: 'vertex', a: '1/2', h: '3', k: '4' });
  assert.ok(r.ok, r.error);
  const head = r.markdown.slice(0, r.markdown.indexOf('## 二、已知条件'));
  assert.ok(head.indexOf('顶点坐标') >= 0, '速览里应有顶点坐标');
  assert.ok(head.indexOf('对称轴') >= 0, '速览里应有对称轴');
  assert.ok(head.indexOf('最大值') >= 0 && head.indexOf('最小值') >= 0, '速览里应有区间最值');
  assert.ok(head.indexOf('值域') >= 0, '速览里应有值域');
  ['一般式', '顶点式', '交点式'].forEach(function (f) {
    assert.ok(head.indexOf(f) >= 0, '速览里应有' + f);
  });
  assert.ok(/\$\$y = .*\\Longleftrightarrow.*\\Longleftrightarrow/.test(head), '速览块应并列三种形式');
  assert.ok(r.markdown.indexOf('### 5.1') > r.markdown.indexOf('## 二、已知条件'), '配方推导应排在速览之后');
});

t('速览给出的尖端点结论与 data 一致', function () {
  const r = Report.build({
    form: 'general', a: '1', b: '-2', c: '3',
    domain: { mode: 'interval', left: { value: '2', open: false }, right: { value: '4', open: false } }
  });
  assert.ok(r.ok, r.error);
  const head = r.markdown.slice(0, r.markdown.indexOf('## 二、已知条件'));
  assert.ok(head.indexOf('$y_{\\min} = 3$') >= 0, '速览应给出最小值 3');
  assert.ok(head.indexOf('$y_{\\max} = 11$') >= 0, '速览应给出最大值 11');
  assert.strictEqual(r.data.extrema.min.value, 3);
  assert.strictEqual(r.data.extrema.max.value, 11);
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

console.log('\n[3.6] 根号输入');
t('系数里可以写 √2、2√3、(1+√3)/2', function () {
  const cases = [
    { input: { form: 'general', a: '√2', b: '-2√2', c: '√2' }, want: { a: '\\sqrt{2}', b: '-2\\sqrt{2}', c: '\\sqrt{2}' } },
    { input: { form: 'factored', a: '√2', r1: '-1', r2: '3' }, want: { a: '\\sqrt{2}' } },
    { input: { form: 'factored', a: '(1+√3)/2', r1: '-1', r2: '3' }, want: { a: '\\frac{1}{2} + \\frac{\\sqrt{3}}{2}' } }
  ];
  cases.forEach(function (c) {
    const r = Report.build(c.input);
    assert.ok(r.ok, JSON.stringify(c.input) + ' → ' + r.error);
    Object.keys(c.want).forEach(function (k) {
      const re = new RegExp('\\$' + k + ' = ' + c.want[k].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\$');
      assert.ok(re.test(r.markdown) || r.markdown.indexOf(c.want[k]) >= 0,
        '缺少 ' + k + ' = ' + c.want[k]);
    });
    /* 绘图数据必须是可用的数字 */
    assert.ok(Number.isFinite(r.data.a) && Number.isFinite(r.data.b) && Number.isFinite(r.data.c), '绘图数据应为数字');
  });
});

t('定义域端点也能写根号', function () {
  const r = Report.build({
    form: 'general', a: '1', b: '0', c: '0',
    domain: { mode: 'interval', left: { value: '-√2', open: false }, right: { value: '√2', open: false } }
  });
  assert.ok(r.ok, r.error);
  assert.ok(r.markdown.indexOf('-\\sqrt{2}') >= 0, '左端点应保留根号');
  assert.ok(r.markdown.indexOf('$y_{\\max} = 2$') >= 0, '最大值应为 2');
  assert.strictEqual(r.data.extrema.max.value, 2);
});

t('根号系数导致零点超出根式范围时给出清楚提示', function () {
  const r = Report.build({ form: 'general', a: '1', b: '0', c: '-√2' });
  assert.strictEqual(r.ok, false);
  assert.ok(/超出了本工具能表示的根式范围/.test(r.error), r.error);
});

/* v1.4.1 回归：Δ < 0 且 Δ 是无理数时，复根的虚部是 √(4√2) 这种「双重根式」，
   既约不掉也不该算错。以前这里会连累整份报告失败，于是「没有实数零点」这个
   本来很确定的结论反而看不到 —— 真机自测就是这么发现的。 */
t('Δ < 0 且 Δ 为无理数时，仍然给出「没有实数零点」的完整报告', function () {
  ['√2', '2√3', '√3/2', '√(2/3)'].forEach(function (c) {
    const r = Report.build({ form: 'general', a: '1', b: '0', c: c });
    assert.ok(r.ok, 'c = ' + c + ' → ' + r.error);
    assert.ok(r.markdown.indexOf('< 0$') >= 0, 'c = ' + c + '：没有给出 Δ < 0 的判断');
    assert.ok(r.markdown.indexOf('没有交点') >= 0, 'c = ' + c + '：没有说明图像与 x 轴没有交点');
    assert.ok(r.markdown.indexOf('没有实数零点') >= 0, 'c = ' + c + '：没有给出「没有实数零点」的结论');
    assert.ok(r.markdown.indexOf('不存在交点式') >= 0, 'c = ' + c + '：没有说明不存在交点式');
    /* 虚部算不出来时不能硬编一个假值，也不能留下 undefined */
    assert.ok(r.markdown.indexOf('undefined') < 0, 'c = ' + c + '：报告里出现了 undefined');
    assert.ok(r.data.extrema.min.value > 0, 'c = ' + c + '：最小值应为正数');
  });
});

t('Δ < 0 但虚部能写成有限根式时，照旧给出共轭复根的精确值', function () {
  const r = Report.build({ form: 'general', a: '1', b: '0', c: '2' });
  assert.ok(r.ok, r.error);
  assert.ok(r.markdown.indexOf('共轭复根') >= 0, '应给出共轭复根');
  assert.ok(r.markdown.indexOf('\\sqrt{2}\\,i') >= 0, 'i 前面的系数应为 √2：' + r.markdown.slice(0, 200));
});

t('「虚部写不出来」的说法本身也要说人话', function () {
  const r = Report.build({ form: 'general', a: '1', b: '0', c: '√2' });
  assert.ok(r.ok, r.error);
  assert.ok(r.markdown.indexOf('无法写成有限根式') >= 0, '应说明虚部无法写成有限根式');
  assert.ok(r.markdown.indexOf('只讨论实数范围') >= 0, '应说明本工具只讨论实数范围');
});

t('根号输入的报错看得懂', function () {
  const r = Report.build({ form: 'general', a: '√', b: '1', c: '1' });
  assert.strictEqual(r.ok, false);
  assert.ok(/无法识别/.test(r.error), r.error);
  assert.ok(/√2/.test(r.error), '提示里应示范怎么写根号：' + r.error);
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
