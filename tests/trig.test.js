/* 三角函数与直角三角形：精确计算 + 报告排版自检
 * 用法： node tests/trig.test.js
 */
'use strict';
const assert = require('assert');
const E = require('../engine.js');
const T = require('../trig.js');
const R = require('../trig-report.js');
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
  while ((mt = re.exec(md)) !== null) out.push({ tex: (mt[1] !== undefined ? mt[1] : mt[2]), display: mt[1] !== undefined });
  return out;
}

function malformed(tex) {
  const bad = [];
  if (/[-+]\s*[-+]/.test(tex)) bad.push('连续运算符: ' + tex);
  if (/\\dfrac\{\}|\\frac\{\}\{\}|\\frac\{[^}]*\}\{\}/.test(tex)) bad.push('空分数: ' + tex);
  if (/\\sqrt\{\}/.test(tex)) bad.push('空根号: ' + tex);
  if (/[+\-]\s*$/.test(tex)) bad.push('以运算符结尾: ' + tex);
  if (/\\quad\\quad/.test(tex)) bad.push('多余间距: ' + tex);
  if (/\bx_\{?\}\b/.test(tex)) bad.push('空下标: ' + tex);
  if (/\\dfrac\{[^}]*\}\{\s*\}/.test(tex)) bad.push('空分母: ' + tex);
  return bad;
}

const CASES = [
  { name: '30° · 对边 3（精确）', input: { fn: 'sin', angle: '30', sideKind: 'opposite', side: '3', digits: 4 } },
  { name: '45° · 斜边 5（精确）', input: { fn: 'cos', angle: '45', sideKind: 'hypotenuse', side: '5', digits: 4 } },
  { name: '60° · 邻边 2（精确）', input: { fn: 'tan', angle: '60', sideKind: 'adjacent', side: '2', digits: 4 } },
  { name: '30° · 斜边 1/3（分数边）', input: { fn: 'sin', angle: '30', sideKind: 'hypotenuse', side: '1/3', digits: 6 } },
  { name: '120°（特殊角但超出直角三角形）', input: { fn: 'cos', angle: '120', sideKind: 'opposite', side: '3', digits: 4 } },
  { name: '90°（tan 不存在）', input: { fn: 'tan', angle: '90', sideKind: 'opposite', side: '1', digits: 4 } },
  { name: '0°（退化）', input: { fn: 'sin', angle: '0', sideKind: 'opposite', side: '1', digits: 4 } },
  { name: '390°（终边相同）', input: { fn: 'sin', angle: '390', sideKind: 'opposite', side: '3', digits: 4 } },
  { name: '-30°（负角）', input: { fn: 'cos', angle: '-30', sideKind: 'adjacent', side: '2', digits: 4 } },
  { name: '37° · 斜边 5（非特殊角）', input: { fn: 'sin', angle: '37', sideKind: 'hypotenuse', side: '5', digits: 4 } },
  { name: '15°（双重根式，走近似）', input: { fn: 'cos', angle: '15', sideKind: 'adjacent', side: '1', digits: 6 } },
  { name: '7.5°（小数角度）', input: { fn: 'tan', angle: '7.5', sideKind: 'adjacent', side: '2', digits: 3 } },
  { name: '用户输入 sin = 0.6（精确 4/5）', input: { fn: 'sin', valueSource: 'user', value: '0.6', sideKind: 'hypotenuse', side: '10', digits: 4 } },
  { name: '用户输入 tan = 3/4（精确 3/5、4/5）', input: { fn: 'tan', valueSource: 'user', value: '3/4', sideKind: 'opposite', side: '6', digits: 4 } },
  { name: '用户输入 cos = 1/3（精确 √8/3）', input: { fn: 'cos', valueSource: 'user', value: '1/3', sideKind: 'adjacent', side: '2', digits: 6 } },
  { name: '用户输入 sin = 0.7071067812（近似）', input: { fn: 'sin', valueSource: 'user', value: '0.7071067812', sideKind: 'hypotenuse', side: '10', digits: 6 } },
  { name: '用户输入 tan = 1（精确 45°）', input: { fn: 'tan', valueSource: 'user', value: '1', sideKind: 'adjacent', side: '7', digits: 4 } },
  { name: '用户输入值 + 角度（一致）', input: { fn: 'sin', valueSource: 'user', value: '0.5', angle: '30', sideKind: 'hypotenuse', side: '4', digits: 4 } },
  { name: '用户输入值 + 角度（矛盾）', input: { fn: 'sin', valueSource: 'user', value: '0.5', angle: '60', sideKind: 'hypotenuse', side: '4', digits: 4 } },
  { name: '超大边长（等比缩放）', input: { fn: 'sin', angle: '30', sideKind: 'hypotenuse', side: '3000000', digits: 2 } },
  { name: '超小边长', input: { fn: 'tan', angle: '45', sideKind: 'opposite', side: '0.0007', digits: 8 } },
  { name: '精度 0 位', input: { fn: 'sin', angle: '37', sideKind: 'hypotenuse', side: '5', digits: 0 } },
  { name: '精度 10 位', input: { fn: 'sin', angle: '37', sideKind: 'hypotenuse', side: '5', digits: 10 } },
  { name: '不填边长（只算函数值）', input: { fn: 'cos', angle: '30', sideKind: 'opposite', side: '', digits: 4 } }
];

console.log('\n[1] 三角函数表：特殊角必须精确');
t('30° / 45° / 60° 的精确值', function () {
  const s30 = T.specialOf('30');
  assert.strictEqual(s30.sin.toString(), '1/2');
  assert.strictEqual(s30.cos.toString(), '(1/2)√3');
  assert.strictEqual(s30.tan.toString(), '(1/3)√3');
  const s45 = T.specialOf('45');
  assert.strictEqual(s45.sin.toString(), '(1/2)√2');
  assert.strictEqual(s45.tan.toString(), '1');
  const s60 = T.specialOf('60');
  assert.strictEqual(s60.sin.toString(), '(1/2)√3');
  assert.strictEqual(s60.cos.toString(), '1/2');
  assert.strictEqual(s60.tan.toString(), '√3');
});
t('所有特殊角的根式都是最简根式', function () {
  const squareFree = function (n) {
    if (n <= 0) return true;
    for (let i = 2; i * i <= n; i++) if (n % (i * i) === 0) return false;
    return true;
  };
  T.TABLE.forEach(function (row) {
    ['sin', 'cos', 'tan'].forEach(function (k) {
      if (row[k] === null) return;
      const s = E.toSurd(T.specialOf(String(row.d))[k]);
      assert.ok(squareFree(Number(s.rad)), row.d + '° 的 ' + k + ' 根号内含平方因子：√' + s.rad);
    });
  });
});
t('角度归一化：390° 与 30° 等价，-30° 与 330° 等价', function () {
  assert.strictEqual(T.specialOf('390').sin.toString(), T.specialOf('30').sin.toString());
  assert.strictEqual(T.specialOf('-30').sin.toString(), T.specialOf('330').sin.toString());
  assert.strictEqual(T.specialOf('450').degText, '90');
  assert.strictEqual(T.normDeg('7.5').toString(), '15/2');
});
t('非特殊角不误判为特殊角', function () {
  ['15', '37', '7.5', '89', '1'].forEach(function (a) {
    assert.strictEqual(T.isSpecial(a), false, a + '° 被误判为特殊角');
  });
  assert.strictEqual(T.isHalfSpecial('15'), true);
  assert.strictEqual(T.isHalfSpecial('45'), false);
});
t('近似值与标准库一致（1e-12）', function () {
  ['1', '37', '15', '89', '7.5', '123.456'].forEach(function (a) {
    const n = T.numeric(a);
    const r = Number(a) * Math.PI / 180;
    assert.ok(Math.abs(n.sin - Math.sin(r)) < 1e-12, a + '° 的 sin 偏差过大');
    assert.ok(Math.abs(n.cos - Math.cos(r)) < 1e-12, a + '° 的 cos 偏差过大');
    if (n.tan !== null) assert.ok(Math.abs(n.tan - Math.tan(r)) < 1e-9, a + '° 的 tan 偏差过大');
  });
});

console.log('\n[2] 由已知函数值精确反推');
t('sin = 3/5 → cos = 4/5、tan = 3/4', function () {
  const d = T.deriveFromValue('sin', '3/5');
  assert.strictEqual(d.cos.toString(), '4/5');
  assert.strictEqual(d.tan.toString(), '3/4');
});
t('cos = 1/3 → sin = (2/3)√2、tan = 2√2', function () {
  const d = T.deriveFromValue('cos', '1/3');
  assert.strictEqual(d.sin.toString(), '(2/3)√2');
  assert.strictEqual(d.tan.toString(), '2√2');
});
t('tan = 1/2 → sin = (1/5)√5、cos = (2/5)√5', function () {
  const d = T.deriveFromValue('tan', '1/2');
  assert.strictEqual(d.sin.toString(), '(1/5)√5');
  assert.strictEqual(d.cos.toString(), '(2/5)√5');
});
t('sin = 1 → cos = 0、tan 不存在', function () {
  const d = T.deriveFromValue('sin', '1');
  assert.strictEqual(d.cos.toString(), '0');
  assert.strictEqual(d.tan, null);
});
t('sin / cos 超过 1 报错', function () {
  assert.throws(function () { T.deriveFromValue('sin', '2'); }, /不能大于 1/);
  assert.throws(function () { T.deriveFromValue('cos', '1.5'); }, /不能大于 1/);
});
t('无理结果不硬凑：根号内平方因子过大时返回 null（改用近似）', function () {
  /* 0.7071067812 对应 cos² 的分母是 10^10 级别，√(1-v²) 会得到巨大根式，
     这时宁可返回 null 走浮点，也不要吐出满屏数字 */
  assert.strictEqual(T.deriveFromValue('sin', '0.7071067812'), null);
  assert.strictEqual(T.deriveFromValue('tan', '0.1234567891'), null);
});
t('反推结果与浮点近似一致（抽样 200 组有理数）', function () {
  for (let i = 1; i <= 200; i++) {
    const v = E.Frac.of(i + '/' + (i + 1));
    const d = T.deriveFromValue('sin', v);
    if (!d) continue;
    const s = d.sin.toNumber(), c = d.cos.toNumber();
    assert.ok(Math.abs(s * s + c * c - 1) < 1e-12, '反推后不满足 sin²+cos²=1');
    if (d.tan) assert.ok(Math.abs(d.tan.toNumber() - s / c) < 1e-12, 'tan = sin/cos 不成立');
  }
});

console.log('\n[3] 直角三角形求解（精确模式）');
t('30°、对边 3 → 邻边 3√3、斜边 6', function () {
  const s = T.specialOf('30');
  const tri = T.solveRightTriangle({ sin: s.sin, cos: s.cos, tan: s.tan, sideKind: 'opposite', side: E.toSurd(E.Frac.of('3')), exact: true });
  assert.strictEqual(tri.a.toString(), '3√3');
  assert.strictEqual(tri.h.toString(), '6');
  assert.strictEqual(tri.area.toString(), '(9/2)√3');
  assert.strictEqual(tri.perimeter.toString(), '9 + 3√3');
});
t('45°、斜边 5 → 两直角边都是 (5/2)√2', function () {
  const s = T.specialOf('45');
  const tri = T.solveRightTriangle({ sin: s.sin, cos: s.cos, tan: s.tan, sideKind: 'hypotenuse', side: E.toSurd(E.Frac.of('5')), exact: true });
  assert.strictEqual(tri.o.toString(), '(5/2)√2');
  assert.strictEqual(tri.a.toString(), '(5/2)√2');
});
t('三种已知边互相自洽：勾股定理精确成立', function () {
  const s = T.specialOf('60');
  const one = E.toSurd(E.Frac.of('1'));
  ['opposite', 'adjacent', 'hypotenuse'].forEach(function (kind) {
    const tri = T.solveRightTriangle({ sin: s.sin, cos: s.cos, tan: s.tan, sideKind: kind, side: one, exact: true });
    const lhs = tri.o.mul(tri.o).add(tri.a.mul(tri.a));
    assert.ok(lhs.sub(tri.h.mul(tri.h)).sign() === 0, kind + ' 下勾股定理不成立');
  });
});
t('近似模式返回普通数字', function () {
  const tri = T.solveRightTriangle({ sin: 0.5, cos: Math.sqrt(3) / 2, tan: 1 / Math.sqrt(3), sideKind: 'opposite', side: 3, exact: false });
  assert.ok(Math.abs(tri.h - 6) < 1e-12);
  assert.ok(Math.abs(tri.a - 3 * Math.sqrt(3)) < 1e-12);
  assert.ok(Math.abs(tri.area - 4.5 * Math.sqrt(3)) < 1e-12);
});

console.log('\n[4] 报告结构：完整、可排版、无畸形公式');
CASES.forEach(function (cs) {
  t(cs.name, function () {
    const res = R.build(cs.input);
    assert.ok(res.ok, '生成失败：' + res.error);
    const md = res.markdown;
    assert.ok(md.startsWith('# 三角函数与直角三角形解析报告'), '缺少标题');
    ['## 一、已知条件', '## 二、三角函数值', '## 三、直角三角形求解', '## 四、面积与周长',
     '## 五、恒等式检验', '## 六、求解步骤', '## 七、图像与缩放说明', '## 八、精度说明'].forEach(function (h) {
      assert.ok(md.indexOf(h) >= 0, '缺少章节：' + h);
    });
    assert.ok(res.data && typeof res.data.angleNum === 'number', '缺少绘图数据');

    /* 表格列数一致 */
    const lines = md.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^\|\s*---/.test(lines[i])) {
        const cols = (l) => l.split('|').length - 2;
        const c1 = cols(lines[i]);
        assert.strictEqual(cols(lines[i - 1]), c1, '表格列数不一致，第 ' + (i + 1) + ' 行');
        let j = i + 1;
        while (j < lines.length && lines[j].startsWith('|')) {
          assert.strictEqual(cols(lines[j]), c1, '表格第 ' + (j + 1) + ' 行列数不一致');
          j++;
        }
      }
    }
    /* 美元符号成对 */
    assert.strictEqual((md.match(/\$/g) || []).length % 2, 0, '美元符号数量为奇数，可能有未闭合的公式');
    /* 没有残留的未渲染 Markdown 加粗在公式里 */
    assert.ok(md.indexOf('**$') < 0, '加粗与公式嵌套异常');

    /* 公式可被 KaTeX 排版 */
    const maths = extractMath(md);
    assert.ok(maths.length > 10, '公式数量过少：' + maths.length);
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

    /* 报告里出现的所有根式都必须是最简根式（根号内不含平方因子） */
    const squareFree = function (n) {
      if (n <= 0) return true;
      for (let i = 2; i * i <= n; i++) if (n % (i * i) === 0) return false;
      return true;
    };
    const re = /\\sqrt\{(\d+)\}/g;
    let m;
    while ((m = re.exec(md)) !== null) {
      const n = Number(m[1]);
      const after = md.slice(m.index + m[0].length, m.index + m[0].length + 4);
      if (after.indexOf(' = ') === 0) continue;   /* 化简过程允许出现原式 */
      assert.ok(squareFree(n), '出现未化简的根式 \\sqrt{' + n + '}（' + cs.name + '）');
    }
  });
});

console.log('\n[5] 具体结论正确性');
t('30° 的精确值写成分数与最简根式', function () {
  const r = R.build({ fn: 'sin', angle: '30', sideKind: 'opposite', side: '3', digits: 4 });
  assert.ok(r.markdown.indexOf('\\frac{1}{2}') >= 0, '缺 sin30 = 1/2');
  assert.ok(r.markdown.indexOf('\\frac{\\sqrt{3}}{2}') >= 0, '缺 cos30 = √3/2');
  assert.ok(r.markdown.indexOf('\\frac{\\sqrt{3}}{3}') >= 0, '缺 tan30 = √3/3');
  assert.strictEqual(r.data.exact, true);
});
t('30° / 对边 3 的三边与面积周长', function () {
  const r = R.build({ fn: 'sin', angle: '30', sideKind: 'opposite', side: '3', digits: 4 });
  assert.strictEqual(r.data.tri.a.plain, '3√3');
  assert.strictEqual(r.data.tri.h.plain, '6');
  assert.strictEqual(r.data.tri.area.plain, '9√3/2');
  assert.strictEqual(r.data.tri.perimeter.plain, '9 + 3√3');
});
t('非特殊角明确说明只能给近似值', function () {
  const r = R.build({ fn: 'sin', angle: '37', sideKind: 'hypotenuse', side: '5', digits: 4 });
  assert.strictEqual(r.data.exact, false);
  assert.ok(/不是特殊角/.test(r.markdown), '缺少非特殊角说明');
  assert.ok(r.markdown.indexOf('无法精确表示') >= 0, '未说明无法精确表示');
  assert.ok(r.markdown.indexOf('全部是精确值') < 0, '不该声称全部精确');
});
t('15° 指出需要双重根式', function () {
  const r = R.build({ fn: 'cos', angle: '15', sideKind: 'adjacent', side: '1', digits: 6 });
  assert.ok(r.markdown.indexOf('双重根式') >= 0, '未说明双重根式');
  assert.ok(r.markdown.indexOf('\\sqrt{6}') >= 0, '未给出 (√6±√2)/4 的说明');
});
t('90° 的 tan 明确写「不存在」', function () {
  const r = R.build({ fn: 'tan', angle: '90', sideKind: 'opposite', side: '1', digits: 4 });
  assert.strictEqual(r.data.ratio.tan.missing, true);
  assert.ok(r.markdown.indexOf('不存在') >= 0);
});
t('用户输入 sin = 0.6 得到精确的 4/5 与 3/4', function () {
  const r = R.build({ fn: 'sin', valueSource: 'user', value: '0.6', sideKind: 'hypotenuse', side: '10', digits: 4 });
  assert.strictEqual(r.data.exact, true);
  assert.strictEqual(r.data.ratio.cos.plain, '4/5');
  assert.strictEqual(r.data.ratio.tan.plain, '3/4');
  assert.strictEqual(r.data.tri.o.plain, '6');
  assert.strictEqual(r.data.tri.a.plain, '8');
  assert.ok(r.markdown.indexOf('\\frac{4}{5}') >= 0);
});
t('用户输入无理数走近似并明确标注', function () {
  const r = R.build({ fn: 'sin', valueSource: 'user', value: '0.7071067812', sideKind: 'hypotenuse', side: '10', digits: 6 });
  assert.strictEqual(r.data.exact, false);
  assert.ok(r.markdown.indexOf('无法精确表示') >= 0);
});
t('用户输入值与原填角度矛盾时给出警告', function () {
  const r = R.build({ fn: 'sin', valueSource: 'user', value: '0.5', angle: '60', sideKind: 'hypotenuse', side: '4', digits: 4 });
  assert.ok(r.data.angleCheck, '缺少对照信息');
  assert.strictEqual(r.data.angleCheck.consistent, false);
  assert.ok(r.markdown.indexOf('不一致') >= 0, '未提示不一致');
});
t('用户输入值与原填角度一致时不报警', function () {
  const r = R.build({ fn: 'sin', valueSource: 'user', value: '0.5', angle: '30', sideKind: 'hypotenuse', side: '4', digits: 4 });
  assert.strictEqual(r.data.angleCheck.consistent, true);
  assert.ok(r.markdown.indexOf('一致') >= 0);
});
t('超大数值仍能正常计算（等比缩放由画布负责）', function () {
  const r = R.build({ fn: 'sin', angle: '30', sideKind: 'hypotenuse', side: '3000000', digits: 2 });
  assert.strictEqual(r.data.tri.h.num, 3000000);
  assert.strictEqual(r.data.tri.o.num, 1500000);
  assert.ok(isFinite(r.data.tri.a.num));
  assert.ok(r.data.tri.exact, '30° 且边长为整数时应为精确值');
  assert.strictEqual(r.data.tri.a.plain, '1500000√3');
});
t('极小数正常计算', function () {
  const r = R.build({ fn: 'tan', angle: '45', sideKind: 'opposite', side: '0.0007', digits: 8 });
  assert.ok(Math.abs(r.data.tri.o.num - 0.0007) < 1e-15);
  assert.ok(Math.abs(r.data.tri.a.num - 0.0007) < 1e-15);
});
t('精度设置会影响所有近似值', function () {
  const a = R.build({ fn: 'sin', angle: '37', sideKind: 'hypotenuse', side: '5', digits: 2 });
  const b = R.build({ fn: 'sin', angle: '37', sideKind: 'hypotenuse', side: '5', digits: 8 });
  assert.strictEqual(a.data.digits, 2);
  assert.strictEqual(b.data.digits, 8);
  assert.ok(a.markdown.indexOf('小数点后 $2$ 位') >= 0);
  assert.ok(b.markdown.indexOf('小数点后 $8$ 位') >= 0);
  /* 近似值字符串的小数位数必须真的不同 */
  const pick = (md) => (md.match(/\|\s*\$0\.\d+\$\s*\|/) || [])[0] || '';
  assert.notStrictEqual(pick(a.markdown), pick(b.markdown));
});
t('精度被限制在 0 ~ 10', function () {
  assert.strictEqual(R.clampDigits(-5), 0);
  assert.strictEqual(R.clampDigits(99), 10);
  assert.strictEqual(R.clampDigits('abc'), 4);
  assert.strictEqual(R.clampDigits(3.7), 4);
});
t('不填边长时仍然给出函数值，并说明如何继续', function () {
  const r = R.build({ fn: 'cos', angle: '30', sideKind: 'opposite', side: '', digits: 4 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.tri, null);
  assert.ok(/还没有填写已知边/.test(r.data.triError));
});
t('120° 时跳过直角三角形但保留函数值', function () {
  const r = R.build({ fn: 'cos', angle: '120', sideKind: 'opposite', side: '3', digits: 4 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.tri, null);
  assert.ok(r.data.triError.indexOf('90^{\\circ}') >= 0);
  assert.strictEqual(r.data.ratio.cos.plain, '-1/2');
});
t('390° 与 30° 结论一致', function () {
  const a = R.build({ fn: 'sin', angle: '30', sideKind: 'opposite', side: '3', digits: 4 });
  const b = R.build({ fn: 'sin', angle: '390', sideKind: 'opposite', side: '3', digits: 4 });
  assert.strictEqual(a.data.ratio.sin.plain, b.data.ratio.sin.plain);
  assert.strictEqual(a.data.tri.h.plain, b.data.tri.h.plain);
});

console.log('\n[6] 错误处理');
t('角度为空报错', function () {
  const r = R.build({ fn: 'sin', angle: '', sideKind: 'opposite', side: '1' });
  assert.strictEqual(r.ok, false);
  assert.ok(/请填写角度/.test(r.error), r.error);
});
t('角度无法识别报错', function () {
  const r = R.build({ fn: 'sin', angle: 'abc', sideKind: 'opposite', side: '1' });
  assert.strictEqual(r.ok, false);
  assert.ok(/无法识别/.test(r.error), r.error);
});
t('用户模式下函数值不能为空', function () {
  const r = R.build({ fn: 'sin', valueSource: 'user', value: '', sideKind: 'opposite', side: '1' });
  assert.strictEqual(r.ok, false);
  assert.ok(/请填写/.test(r.error), r.error);
});
t('sin 值超过 1 报错', function () {
  const r = R.build({ fn: 'sin', valueSource: 'user', value: '2', sideKind: 'opposite', side: '1' });
  assert.strictEqual(r.ok, false);
  assert.ok(/不能大于 1/.test(r.error), r.error);
});
t('边长为负报错', function () {
  const r = R.build({ fn: 'sin', angle: '30', sideKind: 'opposite', side: '-3' });
  assert.strictEqual(r.ok, false);
  assert.ok(/必须是正数/.test(r.error), r.error);
});
t('边长为 0 报错', function () {
  const r = R.build({ fn: 'sin', angle: '30', sideKind: 'opposite', side: '0' });
  assert.strictEqual(r.ok, false);
  assert.ok(/必须是正数/.test(r.error), r.error);
});
t('边长无法识别报错', function () {
  const r = R.build({ fn: 'sin', angle: '30', sideKind: 'opposite', side: 'xyz' });
  assert.strictEqual(r.ok, false);
  assert.ok(/无法识别/.test(r.error), r.error);
});
t('分数、小数、全角输入都能识别', function () {
  const a = R.build({ fn: 'sin', angle: '３０', sideKind: 'opposite', side: '３', digits: 4 });
  assert.ok(a.ok, a.error);
  assert.strictEqual(a.data.tri.h.plain, '6');
  const b = R.build({ fn: 'sin', angle: '30', sideKind: 'opposite', side: '0.5', digits: 4 });
  assert.ok(b.ok, b.error);
  assert.strictEqual(b.data.tri.o.plain, '1/2');
  const c = R.build({ fn: 'sin', angle: '30', sideKind: 'opposite', side: '1/2', digits: 4 });
  assert.strictEqual(c.data.tri.h.plain, '1');
});

console.log('\n[7] 画布数据完整性（供 trig-ui.js 使用）');
CASES.forEach(function (cs) {
  t('画布数据 · ' + cs.name, function () {
    const r = R.build(cs.input);
    assert.ok(r.ok, r.error);
    const d = r.data;
    assert.ok(isFinite(d.angleNum), 'angleNum 不是有限数');
    ['sin', 'cos', 'tan'].forEach(function (k) {
      const v = d.ratio[k];
      assert.ok(v.plain !== undefined, k + ' 缺少 plain');
      if (!v.missing) {
        assert.ok(typeof v.num === 'number' && isFinite(v.num), k + ' 的 num 不是有限数');
        assert.ok(v.exact ? (v.tex && v.tex.length > 0) : true, k + ' 标记为精确但没有 tex');
      }
    });
    if (d.tri) {
      ['o', 'a', 'h', 'area', 'perimeter'].forEach(function (k) {
        const v = d.tri[k];
        assert.ok(isFinite(v.num) && v.num > 0, k + ' 不是有限正数');
        assert.ok(typeof v.plain === 'string' && v.plain.length > 0, k + ' 缺少 plain');
      });
      /* 三边必须能构成直角三角形 */
      const o = d.tri.o.num, a = d.tri.a.num, h = d.tri.h.num;
      const rel = Math.abs(o * o + a * a - h * h) / Math.max(h * h, 1e-12);
      assert.ok(rel < 1e-6, '勾股定理偏差过大：' + rel);
      assert.ok(Math.abs(d.tri.thetaNum + d.tri.otherNum - 90) < 1e-9, '两个锐角之和不等于 90°');
    }
  });
});

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项' + (katex ? '（含 KaTeX 排版校验）' : '（未加载 KaTeX）'));
console.log('========================================\n');
process.exit(fail ? 1 : 0);