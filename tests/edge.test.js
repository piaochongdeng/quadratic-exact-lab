/* 边界用例自检：node tests/edge.test.js */
'use strict';
const assert = require('assert');
const R = require('../report.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function rangeOf(input) {
  const r = R.build(input);
  assert.ok(r.ok, '生成失败：' + r.error);
  return r;
}
function closed(a, b) { return { mode: 'interval', left: { value: a, open: false }, right: { value: b, open: false } }; }

t('退化区间 [2,2] 的值域是单点 [3,3]', () => {
  const r = rangeOf({ form: 'general', a: '1', b: '-2', c: '3', domain: closed('2', '2') });
  assert.strictEqual(r.data.extrema.min.value, 3);
  assert.strictEqual(r.data.extrema.max.value, 3);
  assert.ok(r.markdown.includes('$[3,\\ 3]$'));
});

t('负分数系数：-1/3(x-2/3)(x+4) 的最大值为 49/27', () => {
  const r = rangeOf({ form: 'factored', a: '-1/3', r1: '2/3', r2: '-4' });
  assert.strictEqual(r.data.extrema.max.value, 49 / 27);
  assert.strictEqual(r.data.extrema.min, null);
  assert.ok(r.markdown.includes('\\frac{49}{27}'), '应出现 49/27');
});

t('开区间 (2,4)：两端都取不到，值域 (3,11)', () => {
  const r = rangeOf({ form: 'general', a: '1', b: '-2', c: '3',
    domain: { mode: 'interval', left: { value: '2', open: true }, right: { value: '4', open: true } } });
  assert.strictEqual(r.data.extrema.min.attained, false);
  assert.strictEqual(r.data.extrema.max.attained, false);
  assert.ok(r.markdown.includes('$(3,\\ 11)$'), '值域应为 (3, 11)');
});

t('a<0 且定义域整体在对称轴左侧：最小值 -47、最大值 -15', () => {
  const r = rangeOf({ form: 'vertex', a: '-1/2', h: '10', k: '3', domain: closed('0', '4') });
  assert.strictEqual(r.data.extrema.min.value, -47);
  assert.strictEqual(r.data.extrema.max.value, -15);
  assert.ok(r.markdown.includes('$[-47,\\ -15]$'));
});

t('极大系数 a=1000 仍精确', () => {
  const r = rangeOf({ form: 'general', a: '1000', b: '0', c: '-1000' });
  assert.strictEqual(r.data.extrema.min.value, -1000);
  assert.ok(r.markdown.includes('$x_1 = -1$'));
  assert.ok(r.markdown.includes('$x_2 = 1$'));
});

t('开区间 (1/3,+∞)：下确界 1/27 取不到', () => {
  const r = rangeOf({ form: 'general', a: '1/3', b: '0', c: '0',
    domain: { mode: 'interval', left: { value: '1/3', open: true }, right: { value: '', open: true } } });
  assert.strictEqual(r.data.extrema.min.attained, false);
  assert.ok(Math.abs(r.data.extrema.min.value - 1 / 27) < 1e-12);
  assert.ok(r.markdown.includes('\\frac{1}{27}'));
  assert.ok(r.markdown.includes('$(\\frac{1}{27},\\ +\\infty)$'), '值域应为 (1/27, +∞)');
});

t('顶点恰好落在开端点上时该最值取不到', () => {
  const r = rangeOf({ form: 'general', a: '1', b: '-2', c: '3',
    domain: { mode: 'interval', left: { value: '1', open: true }, right: { value: '5', open: false } } });
  assert.strictEqual(r.data.extrema.min.attained, false);
  assert.strictEqual(r.data.extrema.min.value, 2);
});

t('分数端点：[1/2, 7/3] 上的最值均为分数', () => {
  const r = rangeOf({ form: 'general', a: '1/2', b: '-3', c: '5', domain: closed('1/2', '7/3') });
  assert.ok(r.ok);
  assert.ok(r.markdown.includes('\\frac{'), '报告里应出现分数');
});

t('三点确定函数：分数系数 a=1/2 也精确', () => {
  const r = rangeOf({ form: 'points', p1: { x: '0', y: '1' }, p2: { x: '2', y: '3' }, p3: { x: '4', y: '9' } });
  assert.strictEqual(r.data.a, 0.5);
  assert.strictEqual(r.data.b, 0);
  assert.strictEqual(r.data.c, 1);
  assert.ok(r.markdown.includes('$y = \\frac{1}{2}x^{2} + 1$'), '一般式应为 y = ½x² + 1');
  assert.ok(r.markdown.includes('\\left(0,\\ 1\\right)'), '应回显已知点');
});

t('三点 + 定义域区间：最值与值域仍然精确', () => {
  const r = rangeOf({ form: 'points', p1: { x: '0', y: '3' }, p2: { x: '1', y: '0' }, p3: { x: '-1', y: '0' },
    domain: { mode: 'interval', left: { value: '-2', open: false }, right: { value: '2', open: false } } });
  /* y = -3x² + 3，顶点 (0,3)，端点 x=±2 处 y = -9 */
  assert.strictEqual(r.data.extrema.max.value, 3);
  assert.strictEqual(r.data.extrema.max.at, 0);
  assert.strictEqual(r.data.extrema.min.value, -9);
  assert.ok(r.markdown.includes('$[-9,\\ 3]$'), '值域应为 [-9, 3]');
});

t('无理判别式：根号一定化成最简根式', () => {
  const r = rangeOf({ form: 'general', a: '1', b: '0', c: '-70' });
  assert.ok(r.markdown.includes('\\sqrt{280} = 2\\sqrt{70}'), '应展示化简过程');
  /* Δ=280 → √280 = 2√70，零点 (0 ± 2√70)/2 = ±√70 */
  assert.ok(r.markdown.includes('x_1 = -\\sqrt{70}'), '零点应为最简根式 ±√70');
  assert.ok(r.markdown.includes('x_2 = \\sqrt{70}'));
});

t('b=0 时顶点式写成 x² 形式，不出现 (x - 0)²', () => {
  const r = rangeOf({ form: 'general', a: '2', b: '0', c: '-3' });
  assert.ok(!r.markdown.includes('(x - 0)^{2}'), '不应出现 (x - 0)^{2}');
  assert.ok(r.markdown.includes('$y = 2x^{2} - 3$'), '顶点式应为 2x² - 3');
});

t('非法输入：a=0 / 空值 / 乱码 / 端点颠倒 全部被拦截', () => {
  assert.strictEqual(R.build({ form: 'general', a: '0', b: '1', c: '1' }).ok, false);
  assert.strictEqual(R.build({ form: 'vertex', a: '1', h: '', k: '0' }).ok, false);
  assert.strictEqual(R.build({ form: 'factored', a: 'x', r1: '1', r2: '2' }).ok, false);
  assert.strictEqual(R.build({ form: 'general', a: '1', b: '0', c: '0',
    domain: { mode: 'interval', left: { value: '5', open: false }, right: { value: '1', open: false } } }).ok, false);
  assert.strictEqual(R.build({ form: 'general', a: '1', b: '0', c: '0',
    domain: { mode: 'interval', left: { value: '', open: true }, right: { value: '', open: true } } }).ok, false);
});

t('全角与中文标点输入也能识别', () => {
  const r = rangeOf({ form: 'general', a: '１', b: '－２', c: '３' });
  assert.strictEqual(r.data.a, 1);
  assert.strictEqual(r.data.b, -2);
  assert.strictEqual(r.data.c, 3);
});

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
