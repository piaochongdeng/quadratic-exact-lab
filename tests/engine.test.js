/* 精确引擎自检：node tests/engine.test.js */
'use strict';
const assert = require('assert');
const E = require('../engine.js');
const { Frac, Surd, Quad, parseRational, analyzeDomain, tex, plain, approx } = E;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (err) { fail++; console.log('  FAIL ' + name + '\n       ' + err.message); }
}
function eqFrac(f, n, d, msg) {
  assert.strictEqual(f.n, BigInt(n), (msg || '') + ' 分子=' + f.n);
  assert.strictEqual(f.d, BigInt(d), (msg || '') + ' 分母=' + f.d);
}
function eqSurd(s, a, b, rad, msg) {
  assert.ok(s instanceof Surd, (msg || '') + ' 应为根式');
  eqFrac(s.a, a[0], a[1], (msg || '') + ' 有理部');
  eqFrac(s.b, b[0], b[1], (msg || '') + ' 根号系数');
  assert.strictEqual(s.rad, BigInt(rad), (msg || '') + ' 根号内=' + s.rad);
}

console.log('\n[1] 有理数解析与运算');
t('整数 / 分数 / 小数 / 全角', () => {
  eqFrac(parseRational('7'), 7, 1);
  eqFrac(parseRational('-3/4'), -3, 4);
  eqFrac(parseRational('0.25'), 1, 4);
  eqFrac(parseRational('1.5'), 3, 2);
  eqFrac(parseRational('２．５'), 5, 2);
  eqFrac(parseRational(' - 6 / - 8 '), 3, 4);
});
t('约分与四则运算', () => {
  eqFrac(new Frac(6, -8), -3, 4);
  eqFrac(new Frac(1, 3).add(new Frac(1, 6)), 1, 2);
  eqFrac(new Frac(3, 4).div(new Frac(9, 8)), 2, 3);
  eqFrac(new Frac(0, 5), 0, 1);
  assert.strictEqual(new Frac(-1, 2).cmp(new Frac(1, 3)), -1);
});
t('除零报错', () => {
  assert.throws(() => new Frac(1, 0));
  assert.throws(() => new Frac(1, 2).div(new Frac(0, 1)));
});

console.log('\n[2] 二次根式');
t('开方并化简 √8=2√2, √(1/2)=√2/2, √12/3? ', () => {
  eqSurd(Surd.sqrtOfFrac(new Frac(8)), [0, 1], [2, 1], 2);
  eqSurd(Surd.sqrtOfFrac(new Frac(1, 2)), [0, 1], [1, 2], 2);
  eqSurd(Surd.sqrtOfFrac(new Frac(0)), [0, 1], [0, 1], 1);
  eqSurd(Surd.sqrtOfFrac(new Frac(9)), [3, 1], [0, 1], 1);
  eqSurd(Surd.sqrtOfFrac(new Frac(4, 9)), [2, 3], [0, 1], 1);
});
t('(1+√2)(1-√2) = -1', () => {
  const r2 = Surd.sqrtOfFrac(new Frac(2));
  const one = Surd.one();
  eqSurd(one.add(r2).mul(one.sub(r2)), [-1, 1], [0, 1], 1);
});
t('1/(1+√2) = √2-1（分母有理化）', () => {
  const r2 = Surd.sqrtOfFrac(new Frac(2));
  eqSurd(Surd.one().add(r2).inv(), [-1, 1], [1, 1], 2);
});
t('精确判号（无浮点）', () => {
  const r2 = Surd.sqrtOfFrac(new Frac(2));
  assert.strictEqual(r2.sub(Surd.one()).sign(), 1);
  assert.strictEqual(Surd.one().sub(r2).sign(), -1);
  assert.strictEqual(r2.cmp(new Frac(3, 2)), -1);
  assert.strictEqual(r2.cmp(new Frac(7, 5)), 1);
  assert.strictEqual(Surd.one().add(r2).sub(Surd.one().add(r2)).sign(), 0);
});
t('不同根式域相加会报错', () => {
  const r2 = Surd.sqrtOfFrac(new Frac(2));
  const r3 = Surd.sqrtOfFrac(new Frac(3));
  assert.throws(() => r2.add(r3));
});

console.log('\n[3] 三种形式的互化');
t('顶点式 → 一般式：2(x-1)²-1 = 2x²-4x+1', () => {
  const q = Quad.fromVertex(2, 1, -1);
  eqFrac(q.a, 2, 1); eqFrac(q.b, -4, 1); eqFrac(q.c, 1, 1);
  const v = Quad.vertex(q);
  eqFrac(v.h, 1, 1); eqFrac(v.k, -1, 1);
});
t('交点式 → 一般式：(1/3)(x+1)(x-5)', () => {
  const q = Quad.fromFactored(new Frac(1, 3), -1, 5);
  eqFrac(q.a, 1, 3); eqFrac(q.b, -4, 3); eqFrac(q.c, -5, 3);
  const r = Quad.roots(q);
  assert.strictEqual(r.kind, 'two');
  eqSurd(r.list[0], [-1, 1], [0, 1], 1);
  eqSurd(r.list[1], [5, 1], [0, 1], 1);
});
t('顶点式含分数：(1/2)(x-3)²+4', () => {
  const q = Quad.fromVertex(new Frac(1, 2), 3, 4);
  eqFrac(q.a, 1, 2); eqFrac(q.b, -3, 1);
  eqFrac(q.c, 17, 2);
  const v = Quad.vertex(q);
  eqFrac(v.h, 3, 1); eqFrac(v.k, 4, 1);
});

console.log('\n[4] 判别式与零点');
t('x²-2 的零点为 ±√2', () => {
  const q = Quad.fromGeneral(1, 0, -2);
  const r = Quad.roots(q);
  assert.strictEqual(r.kind, 'two');
  eqSurd(r.list[0], [0, 1], [-1, 1], 2);
  eqSurd(r.list[1], [0, 1], [1, 1], 2);
  assert.strictEqual(Quad.evalAtSurd(q, r.list[1]).sign(), 0);
});
t('x²-4x+1 的零点为 2±√3', () => {
  const q = Quad.fromGeneral(1, -4, 1);
  const r = Quad.roots(q);
  eqFrac(r.delta, 12, 1);
  eqSurd(r.list[0], [2, 1], [-1, 1], 3);
  eqSurd(r.list[1], [2, 1], [1, 1], 3);
  assert.strictEqual(Quad.evalAtSurd(q, r.list[0]).sign(), 0);
});
t('2x²-4x-1 的零点为 1 ± (√6)/2（自动约分）', () => {
  const q = Quad.fromGeneral(2, -4, -1);
  const r = Quad.roots(q);
  eqFrac(r.delta, 24, 1);
  eqSurd(r.list[1], [1, 1], [1, 2], 6);
});
t('x²+1 无实根（共轭复根 ±i）', () => {
  const q = Quad.fromGeneral(1, 0, 1);
  const r = Quad.roots(q);
  assert.strictEqual(r.kind, 'none');
  eqFrac(r.real, 0, 1); eqSurd(r.imag, [1, 1], [0, 1], 1);
});
t('x²-6x+9 有二重根 3', () => {
  const q = Quad.fromGeneral(1, -6, 9);
  const r = Quad.roots(q);
  assert.strictEqual(r.kind, 'double');
  eqSurd(r.list[0], [3, 1], [0, 1], 1);
});
t('韦达定理', () => {
  const q = Quad.fromGeneral(2, -4, -1);
  const v = Quad.vieta(q);
  eqFrac(v.sum, 2, 1); eqFrac(v.product, -1, 2);
});

console.log('\n[5] 定义域 / 值域 / 区间最值');
t('y=x²-2x+3 在 [-1,3]：min 2@1, max 6@两端', () => {
  const q = Quad.fromGeneral(1, -2, 3);
  const a = analyzeDomain(q, new Frac(-1), new Frac(3));
  assert.strictEqual(a.branch, 'vertex-inside');
  eqFrac(a.min.value, 2, 1); eqFrac(a.min.at, 1, 1);
  eqFrac(a.max.value, 6, 1);
  assert.strictEqual(a.max.where, 'both-ends');
  eqFrac(a.range.lo, 2, 1); eqFrac(a.range.hi, 6, 1);
});
t('y=x²-2x+3 在 [2,4]：单调递增', () => {
  const q = Quad.fromGeneral(1, -2, 3);
  const a = analyzeDomain(q, new Frac(2), new Frac(4));
  assert.strictEqual(a.branch, 'right-of-axis');
  eqFrac(a.min.value, 3, 1); eqFrac(a.min.at, 2, 1);
  eqFrac(a.max.value, 11, 1); eqFrac(a.max.at, 4, 1);
});
t('y=-x²+4x-1 在 [0,5]：max 3@2, min -6@5', () => {
  const q = Quad.fromGeneral(-1, 4, -1);
  const a = analyzeDomain(q, new Frac(0), new Frac(5));
  eqFrac(a.max.value, 3, 1); eqFrac(a.max.at, 2, 1);
  eqFrac(a.min.value, -6, 1); eqFrac(a.min.at, 5, 1);
  eqFrac(a.range.lo, -6, 1); eqFrac(a.range.hi, 3, 1);
});
t('全体实数：y=2x²-4x+1 有最小值 -1，无最大值', () => {
  const q = Quad.fromGeneral(2, -4, 1);
  const a = analyzeDomain(q, null, null);
  eqFrac(a.min.value, -1, 1); eqFrac(a.min.at, 1, 1);
  assert.strictEqual(a.max.exists, false);
  assert.strictEqual(a.range.hiKind, '+inf');
});
t('[3,+∞)：y=x²-2x+3 在 [3,+∞) 上单调递增', () => {
  const q = Quad.fromGeneral(1, -2, 3);
  const a = analyzeDomain(q, new Frac(3), null);
  assert.strictEqual(a.branch, 'right-of-axis');
  eqFrac(a.min.value, 6, 1); eqFrac(a.min.at, 3, 1);
  assert.strictEqual(a.max.exists, false);
});
t('(-∞,0]：y=x²-2x+3 最小值 3@0', () => {
  const q = Quad.fromGeneral(1, -2, 3);
  const a = analyzeDomain(q, null, new Frac(0));
  eqFrac(a.min.value, 3, 1); eqFrac(a.min.at, 0, 1);
});
t('[3,+∞)：y=-x²+4x-1 最大值 2@3', () => {
  const q = Quad.fromGeneral(-1, 4, -1);
  const a = analyzeDomain(q, new Frac(3), null);
  eqFrac(a.max.value, 2, 1); eqFrac(a.max.at, 3, 1);
  assert.strictEqual(a.min.exists, false);
});
t('分数端点的精确最值：y=(1/2)x²-3x+5 在 [-1,7]', () => {
  const q = Quad.fromGeneral(new Frac(1, 2), -3, 5);
  const a = analyzeDomain(q, new Frac(-1), new Frac(7));
  eqFrac(a.min.value, 1, 2);               // f(3) = 1/2
  eqFrac(a.max.value, 17, 2);              // f(-1) = f(7) = 17/2
  assert.strictEqual(a.max.where, 'both-ends');
  assert.strictEqual(a.max.ats.length, 2);
});
t('区间非法时报错', () => {
  const q = Quad.fromGeneral(1, 0, 0);
  assert.throws(() => analyzeDomain(q, new Frac(3), new Frac(1)));
});
t('a=0 时报错', () => {
  assert.throws(() => Quad.fromGeneral(0, 1, 1));
});

console.log('\n[5.5] 三点确定二次函数');
t('(0,0)(1,1)(2,4) 给出 y = x²', () => {
  const q = Quad.fromPoints({ x: new Frac(0), y: new Frac(0) }, { x: new Frac(1), y: new Frac(1) }, { x: new Frac(2), y: new Frac(4) });
  eqFrac(q.a, 1, 1); eqFrac(q.b, 0, 1); eqFrac(q.c, 0, 1);
});
t('(1,2)(2,3)(3,6) 给出 y = x²-2x+3', () => {
  const q = Quad.fromPoints({ x: new Frac(1), y: new Frac(2) }, { x: new Frac(2), y: new Frac(3) }, { x: new Frac(3), y: new Frac(6) });
  eqFrac(q.a, 1, 1); eqFrac(q.b, -2, 1); eqFrac(q.c, 3, 1);
});
t('分数坐标也能精确求解', () => {
  const q = Quad.fromPoints(
    { x: new Frac(0), y: new Frac(1, 2) },
    { x: new Frac(1, 2), y: new Frac(0) },
    { x: new Frac(1), y: new Frac(1, 2) });
  eqFrac(q.a, 2, 1); eqFrac(q.b, -2, 1); eqFrac(q.c, 1, 2);
});
t('三点共线时报错', () => {
  assert.throws(() => Quad.fromPoints({ x: new Frac(1), y: new Frac(0) }, { x: new Frac(2), y: new Frac(3) }, { x: new Frac(3), y: new Frac(6) }), /共线/);
});
t('有两点横坐标相同且纵坐标不同时报错', () => {
  assert.throws(() => Quad.fromPoints({ x: new Frac(1), y: new Frac(0) }, { x: new Frac(1), y: new Frac(5) }, { x: new Frac(3), y: new Frac(6) }), /横坐标相同/);
});
t('三点完全重合时报错', () => {
  assert.throws(() => Quad.fromPoints({ x: new Frac(1), y: new Frac(1) }, { x: new Frac(1), y: new Frac(1) }, { x: new Frac(1), y: new Frac(1) }), /重合/);
});

console.log('\n[6] 排版（分数 / 根号）');
t('一般式多项式排版', () => {
  assert.strictEqual(tex.poly([{ c: new Frac(1, 2), p: 2 }, { c: -3, p: 1 }, { c: 5, p: 0 }]),
    '\\frac{1}{2}x^{2} - 3x + 5');
  assert.strictEqual(tex.poly([{ c: 1, p: 2 }, { c: 0, p: 1 }, { c: -2, p: 0 }]), 'x^{2} - 2');
  assert.strictEqual(tex.poly([{ c: -1, p: 2 }]), '-x^{2}');
});
t('顶点式排版', () => {
  assert.strictEqual(tex.vertexForm(new Frac(1, 2), 3, 4), '\\frac{1}{2}(x - 3)^{2} + 4');
  assert.strictEqual(tex.vertexForm(1, new Frac(-3, 2), new Frac(-7, 4)), '(x + \\frac{3}{2})^{2} - \\frac{7}{4}');
});
t('交点式排版（含无理根）', () => {
  assert.strictEqual(tex.factoredForm(new Frac(1, 3), -1, 5), '\\frac{1}{3}(x + 1)(x - 5)');
  const r2 = Surd.sqrtOfFrac(new Frac(2));
  assert.strictEqual(tex.factoredForm(1, r2.neg(), r2), '(x + \\sqrt{2})(x - \\sqrt{2})');
  assert.strictEqual(plain.factoredForm(1, r2.neg(), r2), '(x + √2)(x - √2)');
});
t('无理根的排版', () => {
  const q = Quad.fromGeneral(1, -4, 1);
  const r = Quad.roots(q);
  assert.strictEqual(tex.exact(r.list[0]), '2 - \\sqrt{3}');
  assert.strictEqual(tex.exact(r.list[1]), '2 + \\sqrt{3}');
  const q2 = Quad.fromGeneral(2, -4, -1);
  assert.strictEqual(tex.exact(Quad.roots(q2).list[1]), '1 + \\frac{\\sqrt{6}}{2}');
});
t('根式必须化为最简根式', () => {
  assert.strictEqual(tex.sqrtSimplest(new Frac(280)), '2\\sqrt{70}');
  assert.strictEqual(tex.sqrtChain(new Frac(280)), '\\sqrt{280} = 2\\sqrt{70}');
  assert.strictEqual(tex.sqrtChain(new Frac(70)), '\\sqrt{70}');
  assert.strictEqual(tex.sqrtChain(new Frac(4)), '\\sqrt{4} = 2');
  assert.strictEqual(tex.sqrtChain(new Frac(1, 2)), '\\sqrt{\\frac{1}{2}} = \\frac{\\sqrt{2}}{2}');
  assert.strictEqual(tex.sqrtSimplest(new Frac(12)), '2\\sqrt{3}');
  assert.strictEqual(tex.sqrtSimplest(new Frac(1000)), '10\\sqrt{10}');
  /* 判别式化简后必须与根式域内化简结果一致 */
  const q = Quad.fromGeneral(1, -4, 1);
  const D = Quad.discriminant(q);
  assert.strictEqual(tex.sqrtChain(D), '\\sqrt{12} = 2\\sqrt{3}');
});

t('纯文本排版与近似值', () => {
  assert.strictEqual(plain.exact(new Frac(7, 4)), '7/4');
  assert.strictEqual(plain.exact(Quad.roots(Quad.fromGeneral(1, 0, -2)).list[1]), '√2');
  assert.strictEqual(approx(new Frac(1, 3)), '0.3333');
  assert.strictEqual(approx(new Frac(7, 4)), '1.75');
});

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
