/*!
 * quadratic-exact-lab · engine.js  (v1.0.0)
 * ------------------------------------------------------------------
 * 精确二次函数计算引擎
 *   · Frac   —— 任意精度有理数（基于 BigInt，自动约分）
 *   · Surd   —— 二次根式 a + b·√rad（a、b 为有理数，rad 无平方因子）
 *   · Quad   —— 二次函数三种形式的互化、顶点、判别式、零点
 *   · analyzeDomain —— 任意定义域上的最值 / 值域分析
 * 纯原创实现，零第三方依赖，浏览器与 Node.js 通用。
 * ------------------------------------------------------------------
 */
(function (global, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.QuadEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ==========================================================
   * 0. 大整数工具
   * ========================================================== */
  function bigAbs(x) { return x < 0n ? -x : x; }

  function bigGcd(a, b) {
    a = bigAbs(a); b = bigAbs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }

  /* 整数平方根（向下取整），牛顿迭代，无精度损失 */
  function bigSqrt(n) {
    if (n < 0n) throw new Error('不能对负数开平方');
    if (n < 2n) return n;
    var x = n, y = (n + 1n) / 2n;
    while (y < x) { x = y; y = (x + n / x) / 2n; }
    return x;
  }

  function bigIsSquare(n) {
    if (n < 0n) return false;
    var r = bigSqrt(n);
    return r * r === n;
  }

  function bigPow10(k) { return 10n ** BigInt(k); }

  /* ==========================================================
   * 1. Frac —— 有理数
   * ========================================================== */
  class Frac {
    constructor(n, d) {
      if (d === undefined) d = 1n;
      n = typeof n === 'bigint' ? n : BigInt(n);
      d = typeof d === 'bigint' ? d : BigInt(d);
      if (d === 0n) throw new Error('分母不能为 0');
      if (d < 0n) { n = -n; d = -d; }
      var g = bigGcd(n, d);
      if (g === 0n) g = 1n;
      this.n = n / g;
      this.d = d / g;
    }

    static of(x) {
      if (x instanceof Frac) return x;
      if (typeof x === 'string') return parseRational(x);
      if (typeof x === 'bigint' || typeof x === 'number') return new Frac(x);
      if (x && typeof x === 'object' && 'n' in x && 'd' in x) return new Frac(x.n, x.d);
      throw new Error('无法转换为有理数：' + String(x));
    }

    add(o) { o = Frac.of(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { o = Frac.of(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { o = Frac.of(o); return new Frac(this.n * o.n, this.d * o.d); }
    div(o) {
      o = Frac.of(o);
      if (o.n === 0n) throw new Error('除数不能为 0');
      return new Frac(this.n * o.d, this.d * o.n);
    }
    neg() { return new Frac(-this.n, this.d); }
    abs() { return this.n < 0n ? this.neg() : this; }
    inv() { if (this.n === 0n) throw new Error('0 没有倒数'); return new Frac(this.d, this.n); }
    sign() { return this.n === 0n ? 0 : (this.n < 0n ? -1 : 1); }
    isZero() { return this.n === 0n; }
    isInt() { return this.d === 1n; }
    isOne() { return this.n === 1n && this.d === 1n; }
    cmp(o) {
      o = Frac.of(o);
      var l = this.n * o.d, r = o.n * this.d;
      return l < r ? -1 : (l > r ? 1 : 0);
    }
    eq(o) { return this.cmp(o) === 0; }
    toNumber() { return Number(this.n) / Number(this.d); }
    toString() { return this.d === 1n ? String(this.n) : this.n + '/' + this.d; }
  }

  /* ---------- 数值文本解析（支持分数、小数、全角） ---------- */
  function normalizeChars(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      var c = ch.charCodeAt(0);
      if (c >= 0xFF10 && c <= 0xFF19) out += String.fromCharCode(c - 0xFEE0);   // 全角数字
      else if (ch === '＋') out += '+';
      else if (ch === '－' || ch === '−' || ch === '–' || ch === '—' || ch === 'ー') out += '-';
      else if (ch === '／' || ch === '∕') out += '/';
      else if (ch === '．') out += '.';
      else if (ch === '，' || ch === ',') out += '';
      else if (ch === '　') out += ' ';
      else out += ch;
    }
    return out;
  }

  function decimalToFrac(text) {
    var s = text.replace(/\s+/g, '');
    var sign = 1n;
    if (s.charAt(0) === '+') s = s.slice(1);
    else if (s.charAt(0) === '-') { sign = -1n; s = s.slice(1); }
    if (s === '') throw new Error('数值为空');
    if (!/^\d*\.?\d*$/.test(s) || s === '.') throw new Error('无法识别的数值：' + text);
    var parts = s.split('.');
    var intPart = parts[0] || '0';
    var fracPart = parts.length > 1 ? parts[1] : '';
    var digits = (intPart + fracPart).replace(/^0+(?=\d)/, '');
    if (digits === '') digits = '0';
    return new Frac(sign * BigInt(digits), bigPow10(fracPart.length));
  }

  function parseRational(text) {
    if (text instanceof Frac) return text;
    if (typeof text === 'bigint') return new Frac(text);
    if (typeof text === 'number') {
      if (!Number.isFinite(text)) throw new Error('数值必须有限');
      if (Number.isInteger(text)) return new Frac(BigInt(text));
      return decimalToFrac(String(text));
    }
    var s = normalizeChars(String(text)).trim().replace(/\s+/g, '');
    if (s === '') throw new Error('输入不能为空');
    if (s.charAt(0) === '+') s = s.slice(1);
    if (s.indexOf('/') >= 0) {
      var idx = s.indexOf('/');
      var num = s.slice(0, idx), den = s.slice(idx + 1);
      if (num === '' || den === '') throw new Error('分数写法不正确：' + text);
      return decimalToFrac(num).div(decimalToFrac(den));
    }
    return decimalToFrac(s);
  }

  /* ==========================================================
   * 2. Surd —— 二次根式 a + b√rad
   * ========================================================== */
  /* 合并加法：一方为有理数时可直接归入另一方的根式域 */
  function mergeAdd(x, y) {
    if (x.rad === y.rad) return new Surd(x.a.add(y.a), x.b.add(y.b), x.rad);
    if (x.isRational()) return new Surd(x.a.add(y.a), y.b, y.rad);
    if (y.isRational()) return new Surd(x.a.add(y.a), x.b, x.rad);
    throw new Error('√' + x.rad + ' 与 √' + y.rad + ' 属于不同的根式域，无法直接合并');
  }

  /* 合并乘法（同理） */
  function mergeMul(x, y) {
    if (x.rad === y.rad) {
      var d = new Frac(x.rad);
      return new Surd(
        x.a.mul(y.a).add(x.b.mul(y.b).mul(d)),
        x.a.mul(y.b).add(x.b.mul(y.a)),
        x.rad
      );
    }
    if (x.isRational()) return new Surd(x.a.mul(y.a), x.a.mul(y.b), y.rad);
    if (y.isRational()) return new Surd(y.a.mul(x.a), y.a.mul(x.b), x.rad);
    throw new Error('√' + x.rad + ' 与 √' + y.rad + ' 属于不同的根式域，无法直接相乘');
  }

  class Surd {
    constructor(a, b, rad) {
      a = a === undefined ? new Frac(0n) : Frac.of(a);
      b = b === undefined ? new Frac(0n) : Frac.of(b);
      rad = rad === undefined ? 1n : (typeof rad === 'bigint' ? rad : BigInt(rad));
      if (b.isZero()) rad = 1n;
      if (rad <= 0n) throw new Error('根号内必须是正整数');
      if (rad === 1n) { a = a.add(b); b = new Frac(0n); }
      this.a = a; this.b = b; this.rad = rad;
    }

    static of(x) {
      if (x instanceof Surd) return x;
      if (x instanceof Frac) return new Surd(x, new Frac(0n), 1n);
      if (typeof x === 'string') return new Surd(parseRational(x), new Frac(0n), 1n);
      if (typeof x === 'number' || typeof x === 'bigint') return new Surd(new Frac(x), new Frac(0n), 1n);
      if (x && typeof x === 'object' && 'a' in x) return new Surd(x.a, x.b, x.rad);
      throw new Error('无法转换为精确数：' + String(x));
    }

    static rational(f) { return new Surd(Frac.of(f), new Frac(0n), 1n); }
    static zero() { return new Surd(new Frac(0n), new Frac(0n), 1n); }
    static one() { return new Surd(new Frac(1n), new Frac(0n), 1n); }

    /* √(n/d) = √(n·d)/d ，再提出平方因子 */
    static sqrtOfFrac(f) {
      f = Frac.of(f);
      if (f.sign() < 0) throw new Error('实数范围内负数不能开平方');
      if (f.isZero()) return Surd.zero();
      var m = f.n * f.d;
      var k = 1n, s = m;
      var LIMIT = 2000000n;
      var i = 2n;
      while (i * i <= s && i <= LIMIT) {
        while (s % (i * i) === 0n) { s = s / (i * i); k = k * i; }
        i += 1n;
      }
      if (s > 1n) {
        var r = bigSqrt(s);
        if (r * r === s) { k = k * r; s = 1n; }
      }
      return new Surd(new Frac(0n), new Frac(k, f.d), s);
    }

    isRational() { return this.b.isZero(); }
    isZero() { return this.a.isZero() && this.b.isZero(); }

    add(o) { return mergeAdd(this, Surd.of(o)); }
    sub(o) { return this.add(Surd.of(o).neg()); }
    neg() { return new Surd(this.a.neg(), this.b.neg(), this.rad); }

    mul(o) { return mergeMul(this, Surd.of(o)); }

    /* 1/(a+b√d) = (a-b√d)/(a²-b²d) */
    inv() {
      if (this.isZero()) throw new Error('除数不能为 0');
      var d = new Frac(this.rad);
      var den = this.a.mul(this.a).sub(this.b.mul(this.b).mul(d));
      if (den.isZero()) throw new Error('该根式的分母为 0');
      return new Surd(this.a.div(den), this.b.neg().div(den), this.rad);
    }
    div(o) { return this.mul(Surd.of(o).inv()); }

    /* 精确判号：不借助任何浮点运算 */
    sign() {
      if (this.b.isZero()) return this.a.sign();
      if (this.a.isZero()) return this.b.sign();
      var sa = this.a.sign(), sb = this.b.sign();
      if (sa === sb) return sa;
      var lhs = this.a.mul(this.a);
      var rhs = this.b.mul(this.b).mul(new Frac(this.rad));
      var c = lhs.cmp(rhs);
      if (c === 0) return 0;
      return c > 0 ? sa : sb;
    }
    cmp(o) { return this.sub(o).sign(); }
    eq(o) { return this.cmp(o) === 0; }
    abs() { return this.sign() < 0 ? this.neg() : this; }
    toNumber() { return this.a.toNumber() + this.b.toNumber() * Math.sqrt(Number(this.rad)); }
    toString() { return plainExact(this); }
  }

  /* ==========================================================
   * 3. 精确值的两种排版：TeX（→ 分数/根号）与纯文本
   * ========================================================== */
  function toSurd(x) {
    if (x instanceof Surd) return x;
    return new Surd(Frac.of(x), new Frac(0n), 1n);
  }

  function texFracMag(f) {
    f = Frac.of(f).abs();
    if (f.d === 1n) return String(f.n);
    return '\\frac{' + f.n + '}{' + f.d + '}';
  }
  function texFracSigned(f) {
    f = Frac.of(f);
    if (f.n === 0n) return '0';
    return (f.n < 0n ? '-' : '') + texFracMag(f);
  }
  function texRadicalMag(b, rad) {
    b = Frac.of(b).abs();
    var root = '\\sqrt{' + rad + '}';
    if (b.isZero()) return '0';
    if (b.d === 1n) return (b.n === 1n ? '' : String(b.n)) + root;
    if (b.n === 1n) return '\\frac{' + root + '}{' + b.d + '}';
    return '\\frac{' + b.n + root + '}{' + b.d + '}';
  }
  function texExact(x) {
    var s = toSurd(x);
    if (s.isRational()) return texFracSigned(s.a);
    var radPart = texRadicalMag(s.b, s.rad);
    var bs = s.b.sign();
    if (s.a.isZero()) return (bs < 0 ? '-' : '') + radPart;
    if (bs < 0) return texFracSigned(s.a) + ' - ' + radPart;
    if (s.a.sign() > 0) return texFracSigned(s.a) + ' + ' + radPart;
    return radPart + ' - ' + texFracMag(s.a);
  }
  function texExactMag(x) {
    var s = toSurd(x);
    return s.sign() < 0 ? texExact(s.neg()) : texExact(s);
  }
  function texExactParen(x) {
    var s = toSurd(x);
    if (s.isRational() && s.a.sign() >= 0) return texExact(s);
    return '(' + texExact(s) + ')';
  }

  function plainFracMag(f) {
    f = Frac.of(f).abs();
    return f.d === 1n ? String(f.n) : f.n + '/' + f.d;
  }
  function plainFracSigned(f) {
    f = Frac.of(f);
    if (f.n === 0n) return '0';
    return (f.n < 0n ? '-' : '') + plainFracMag(f);
  }
  function plainRadicalMag(b, rad) {
    b = Frac.of(b).abs();
    var root = '√' + rad;
    if (b.isZero()) return '0';
    if (b.d === 1n) return (b.n === 1n ? '' : String(b.n)) + root;
    return '(' + b.n + '/' + b.d + ')' + root;
  }
  function plainExact(x) {
    var s = toSurd(x);
    if (s.isRational()) return plainFracSigned(s.a);
    var radPart = plainRadicalMag(s.b, s.rad);
    var bs = s.b.sign();
    if (s.a.isZero()) return (bs < 0 ? '-' : '') + radPart;
    if (bs < 0) return plainFracSigned(s.a) + ' - ' + radPart;
    if (s.a.sign() > 0) return plainFracSigned(s.a) + ' + ' + radPart;
    return radPart + ' - ' + plainFracMag(s.a);
  }

  /* 多项式排版：terms = [{c: 精确数, p: 次数}, ...] */
  function texPoly(terms, v) {
    v = v || 'x';
    var list = terms.filter(function (t) { return toSurd(t.c).sign() !== 0; });
    if (!list.length) return '0';
    var out = '';
    list.forEach(function (t, idx) {
      var c = toSurd(t.c);
      var p = t.p || 0;
      var negative = c.sign() < 0;
      var mag = negative ? c.neg() : c;
      var varPart = p > 0 ? (p === 1 ? v : v + '^{' + p + '}') : '';
      var coefPart = '';
      var isOne = mag.isRational() && mag.a.n === 1n && mag.a.d === 1n;
      if (!(isOne && p > 0)) coefPart = texExact(mag);
      if (coefPart && varPart && !mag.isRational() && !mag.a.isZero()) coefPart = '(' + coefPart + ')';
      var body = coefPart + varPart || '1';
      out += idx === 0 ? (negative ? '-' : '') + body : (negative ? ' - ' : ' + ') + body;
    });
    return out;
  }

  function plainPoly(terms, v) {
    v = v || 'x';
    var list = terms.filter(function (t) { return toSurd(t.c).sign() !== 0; });
    if (!list.length) return '0';
    var out = '';
    list.forEach(function (t, idx) {
      var c = toSurd(t.c);
      var p = t.p || 0;
      var negative = c.sign() < 0;
      var mag = negative ? c.neg() : c;
      var varPart = p > 0 ? (p === 1 ? v : v + '^' + p) : '';
      var coefPart = '';
      var isOne = mag.isRational() && mag.a.n === 1n && mag.a.d === 1n;
      if (!(isOne && p > 0)) coefPart = plainExact(mag);
      if (coefPart && varPart && !mag.isRational()) coefPart = '(' + coefPart + ')';
      var body = coefPart + varPart || '1';
      out += idx === 0 ? (negative ? '-' : '') + body : (negative ? ' - ' : ' + ') + body;
    });
    return out;
  }

  /* 顶点式 y = a(x-h)² + k */
  function texVertexForm(a, h, k, v) {
    v = v || 'x';
    var an = toSurd(a), neg = an.sign() < 0, amag = neg ? an.neg() : an;
    var isOne = amag.isRational() && amag.a.n === 1n && amag.a.d === 1n;
    var head = '';
    if (!isOne) {
      head = texExact(amag);
      if (!amag.isRational()) head = '(' + head + ')';
    }
    var hs = toSurd(h);
    var tail = '';
    var ks = toSurd(k);
    if (!ks.isZero()) tail = (ks.sign() < 0 ? ' - ' : ' + ') + texExactMag(ks);
    var prefix = (neg ? '-' : '') + head;
    if (hs.isZero()) return prefix + v + '^{2}' + tail;      /* h = 0：直接写 ax² + k */
    var inner = hs.sign() < 0 ? v + ' + ' + texExact(hs.neg()) : v + ' - ' + texExact(hs);
    return prefix + '(' + inner + ')^{2}' + tail;
  }

  /* 交点式 y = a(x-x₁)(x-x₂) */
  function texFactoredForm(a, r1, r2, v) {
    v = v || 'x';
    var an = toSurd(a), neg = an.sign() < 0, amag = neg ? an.neg() : an;
    var isOne = amag.isRational() && amag.a.n === 1n && amag.a.d === 1n;
    var head = '';
    if (!isOne) {
      head = texExact(amag);
      if (!amag.isRational()) head = '(' + head + ')';
    }
    function factor(r) {
      var s = toSurd(r);
      if (s.sign() < 0) return '(' + v + ' + ' + texExact(s.neg()) + ')';
      return '(' + v + ' - ' + texExact(s) + ')';
    }
    return (neg ? '-' : '') + head + factor(r1) + factor(r2);
  }

  function plainVertexForm(a, h, k, v) {
    v = v || 'x';
    var an = toSurd(a), neg = an.sign() < 0, amag = neg ? an.neg() : an;
    var isOne = amag.isRational() && amag.a.n === 1n && amag.a.d === 1n;
    var head = '';
    if (!isOne) { head = plainExact(amag); if (!amag.isRational()) head = '(' + head + ')'; }
    var hs = toSurd(h);
    var inner = hs.sign() < 0 ? v + ' + ' + plainExact(hs.neg()) : v + ' - ' + plainExact(hs);
    var ks = toSurd(k);
    var tail = '';
    if (!ks.isZero()) tail = (ks.sign() < 0 ? ' - ' : ' + ') + (ks.sign() < 0 ? plainExact(ks.neg()) : plainExact(ks));
    return (neg ? '-' : '') + head + '(' + inner + ')^2' + tail;
  }

  function plainFactoredForm(a, r1, r2, v) {
    v = v || 'x';
    var an = toSurd(a), neg = an.sign() < 0, amag = neg ? an.neg() : an;
    var isOne = amag.isRational() && amag.a.n === 1n && amag.a.d === 1n;
    var head = '';
    if (!isOne) { head = plainExact(amag); if (!amag.isRational()) head = '(' + head + ')'; }
    function factor(r) {
      var s = toSurd(r);
      if (s.sign() < 0) return '(' + v + ' + ' + plainExact(s.neg()) + ')';
      return '(' + v + ' - ' + plainExact(s) + ')';
    }
    return (neg ? '-' : '') + head + factor(r1) + factor(r2);
  }

  /* 最简根式（不带过程）：√280 → 2\sqrt{70}；完全平方 → 整数 */
  function texSqrtSimplest(f) {
    f = Frac.of(f);
    if (f.sign() < 0) return '\\sqrt{' + texExact(f) + '}';
    if (f.isZero()) return '0';
    return texExact(Surd.sqrtOfFrac(f));
  }

  /* 最简根式（带化简过程）：√280 → "\sqrt{280} = 2\sqrt{70}"；已最简时只返回根式本身 */
  function texSqrtChain(f) {
    f = Frac.of(f);
    if (f.sign() < 0) return '\\sqrt{' + texExact(f) + '}';
    if (f.isZero()) return '0';
    var raw = '\\sqrt{' + texExact(f) + '}';
    var simp = texExact(Surd.sqrtOfFrac(f));
    return raw === simp ? simp : raw + ' = ' + simp;
  }

  /* 近似值：默认保留 4 位小数，去掉多余的 0 */
  function approx(x, digits) {
    digits = digits === undefined ? 4 : digits;
    var v = toSurd(x).toNumber();
    if (!Number.isFinite(v)) return String(v);
    var s = v.toFixed(digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  /* ==========================================================
   * 4. Quad —— 二次函数
   * ========================================================== */
  var Quad = {
    make: function (a, b, c) {
      a = Frac.of(a); b = Frac.of(b); c = Frac.of(c);
      if (a.isZero()) throw new Error('二次项系数 a 不能为 0（否则不是二次函数）');
      return { a: a, b: b, c: c };
    },
    fromGeneral: function (a, b, c) { return Quad.make(a, b, c); },

    /* y = a(x-h)² + k  →  y = ax² + bx + c */
    fromVertex: function (a, h, k) {
      a = Frac.of(a); h = Frac.of(h); k = Frac.of(k);
      var b = a.mul(h).mul(new Frac(-2n));
      var c = a.mul(h).mul(h).add(k);
      return Quad.make(a, b, c);
    },

    /* y = a(x-x₁)(x-x₂)  →  y = ax² + bx + c */
    fromFactored: function (a, r1, r2) {
      a = Frac.of(a); r1 = Frac.of(r1); r2 = Frac.of(r2);
      var b = a.mul(r1.add(r2)).neg();
      var c = a.mul(r1).mul(r2);
      return Quad.make(a, b, c);
    },

    /* 三阶行列式：c1、c2、c3 为三列 */
    det3: function (c1, c2, c3) {
      return c1[0].mul(c2[1].mul(c3[2]).sub(c3[1].mul(c2[2])))
        .sub(c2[0].mul(c1[1].mul(c3[2]).sub(c3[1].mul(c1[2]))))
        .add(c3[0].mul(c1[1].mul(c2[2]).sub(c2[1].mul(c1[2]))));
    },

    /*
     * 三点确定二次函数：把三个点代入 y = ax² + bx + c，
     * 用克莱姆法则（三阶行列式）精确解出 a、b、c。
     * 全程有理数运算，不会有任何浮点误差。
     */
    fromPoints: function (p1, p2, p3) {
      var pts = [p1, p2, p3].map(function (p) {
        return { x: Frac.of(p.x), y: Frac.of(p.y) };
      });
      var X = pts.map(function (p) { return p.x; });
      var Y = pts.map(function (p) { return p.y; });
      var X2 = X.map(function (x) { return x.mul(x); });
      var ONE = [new Frac(1n), new Frac(1n), new Frac(1n)];

      /* 系数行列式 = -(x1-x2)(x1-x3)(x2-x3)，为零说明有两点横坐标相同 */
      var D = Quad.det3(X2, X, ONE);
      if (D.isZero()) {
        for (var i = 0; i < 3; i++) {
          for (var j = i + 1; j < 3; j++) {
            if (X[i].eq(X[j])) {
              var tag = '\u7b2c ' + (i + 1) + ' \u4e2a\u70b9\u4e0e\u7b2c ' + (j + 1) + ' \u4e2a\u70b9';
              if (Y[i].eq(Y[j])) throw new Error(tag + '\u5b8c\u5168\u91cd\u5408\uff0c\u4e09\u4e2a\u70b9\u65e0\u6cd5\u552f\u4e00\u786e\u5b9a\u4e8c\u6b21\u51fd\u6570');
              throw new Error(tag + '\u6a2a\u5750\u6807\u76f8\u540c\u4f46\u7eb5\u5750\u6807\u4e0d\u540c\uff0c\u4e0d\u53ef\u80fd\u5728\u540c\u4e00\u4e2a\u51fd\u6570\u56fe\u50cf\u4e0a');
            }
          }
        }
        throw new Error('\u4e09\u4e2a\u70b9\u7684\u6a2a\u5750\u6807\u51fa\u73b0\u91cd\u590d\uff0c\u65e0\u6cd5\u552f\u4e00\u786e\u5b9a\u4e8c\u6b21\u51fd\u6570');
      }

      var a = Quad.det3(Y, X, ONE).div(D);
      var b = Quad.det3(X2, Y, ONE).div(D);
      var c = Quad.det3(X2, X, Y).div(D);
      if (a.isZero()) throw new Error('\u4e09\u70b9\u5171\u7ebf\uff0c\u4e8c\u6b21\u9879\u7cfb\u6570 a = 0\uff0c\u65e0\u6cd5\u786e\u5b9a\u4e8c\u6b21\u51fd\u6570');

      var q = Quad.make(a, b, c);
      /* 代回验证，确保三个点都在图像上 */
      pts.forEach(function (p) {
        if (!Quad.evalAt(q, p.x).eq(p.y)) throw new Error('\u5185\u90e8\u6821\u9a8c\u5931\u8d25\uff1a\u70b9\u5750\u6807\u4ee3\u56de\u540e\u4e0d\u6210\u7acb');
      });
      return q;
    },

    evalAt: function (q, x) {
      x = Frac.of(x);
      return q.a.mul(x).mul(x).add(q.b.mul(x)).add(q.c);
    },

    /* 在二次根式点处求值（用于验证零点等） */
    evalAtSurd: function (q, x) {
      x = toSurd(x);
      return toSurd(q.a).mul(x).mul(x).add(toSurd(q.b).mul(x)).add(toSurd(q.c));
    },

    vertex: function (q) {
      var h = q.b.neg().div(q.a.mul(new Frac(2n)));
      var k = Quad.evalAt(q, h);
      return { h: h, k: k };
    },

    discriminant: function (q) {
      return q.b.mul(q.b).sub(q.a.mul(q.c).mul(new Frac(4n)));
    },

    /* 零点：返回 {kind:'two'|'double'|'none', list, delta, real, imag} */
    roots: function (q) {
      var D = Quad.discriminant(q);
      var twoA = q.a.mul(new Frac(2n));
      var base = q.b.neg().div(twoA);
      if (D.isZero()) {
        return { kind: 'double', delta: D, list: [new Surd(base, new Frac(0n), 1n)], base: base };
      }
      if (D.sign() < 0) {
        var mag = Surd.sqrtOfFrac(D.neg()).div(new Surd(twoA, new Frac(0n), 1n));
        return { kind: 'none', delta: D, list: [], real: base, imag: mag };
      }
      var root = Surd.sqrtOfFrac(D);
      var den = new Surd(twoA, new Frac(0n), 1n);
      var b0 = new Surd(base, new Frac(0n), 1n);
      var half = root.div(den);          /* √Δ / (2a) */
      var r1 = b0.sub(half);             /* -b/(2a) - √Δ/(2a) */
      var r2 = b0.add(half);             /* -b/(2a) + √Δ/(2a) */
      /* 让小的根排在前面 */
      if (r1.cmp(r2) > 0) { var t = r1; r1 = r2; r2 = t; }
      return { kind: 'two', delta: D, list: [r1, r2], base: base, root: root, den: twoA };
    },

    /* 韦达定理 */
    vieta: function (q) {
      return { sum: q.b.neg().div(q.a), product: q.c.div(q.a) };
    }
  };

  /* ==========================================================
   * 5. 定义域 / 值域 / 最值分析
   * ========================================================== */
  /*
   * m、n 为 Frac 或 null（null 表示该侧无限）
   * 返回 { up, vertex, domain, min, max, range, branch }
   *   min/max = { exists, value, ats, at, where, attained }
 *   where: vertex | left-end | right-end | both-ends | unbounded；attained 表示该极值在定义域内是否真的取得到
   */
  function analyzeDomain(q, m, n, leftOpen, rightOpen) {
    leftOpen = !!leftOpen; rightOpen = !!rightOpen;
    var v = Quad.vertex(q);
    var h = v.h, k = v.k;
    var up = q.a.sign() > 0;
    var hasLeft = (m !== null && m !== undefined);
    var hasRight = (n !== null && n !== undefined);
    m = hasLeft ? Frac.of(m) : null;
    n = hasRight ? Frac.of(n) : null;
    if (hasLeft && hasRight && m.cmp(n) > 0) throw new Error('区间左端点不能大于右端点');

    var vertexInside = (!hasLeft || h.cmp(m) >= 0) && (!hasRight || h.cmp(n) <= 0);
    var f = function (x) { return Quad.evalAt(q, x); };
    var res = {
      a: q.a, up: up, vertex: v,
      domain: { hasLeft: hasLeft, hasRight: hasRight, m: m, n: n, vertexInside: vertexInside },
      min: null, max: null, range: null, branch: ''
    };

    /* 在若干候选点中取最大 / 最小，并收集所有取到极值的点 */
    function pick(pairs, wantMax) {
      var best = null, ats = [];
      pairs.forEach(function (pr) {
        if (best === null) { best = pr.y; ats = [pr.x]; return; }
        var c = pr.y.cmp(best);
        if (wantMax ? c > 0 : c < 0) { best = pr.y; ats = [pr.x]; }
        else if (c === 0 && !ats.some(function (z) { return z.eq(pr.x); })) ats.push(pr.x);
      });
      var where = ats.length > 1 ? 'both-ends' : (ats[0].eq(m) ? 'left-end' : 'right-end');
      var attained = where === 'both-ends' ? (!leftOpen || !rightOpen)
        : (where === 'left-end' ? !leftOpen : !rightOpen);
      return { exists: true, value: best, ats: ats, at: ats[0], where: where, attained: attained };
    }

    /* 顶点：a>0 时它是最小值，a<0 时它是最大值 */
    var extreme;
    if (vertexInside) {
      var vAttained = true;
      if (hasLeft && h.eq(m) && leftOpen) vAttained = false;
      if (hasRight && h.eq(n) && rightOpen) vAttained = false;
      extreme = { exists: true, value: k, ats: [h], at: h, where: 'vertex', attained: vAttained };
      res.branch = 'vertex-inside';
    } else if (hasLeft && h.cmp(m) < 0) {
      extreme = { exists: true, value: f(m), ats: [m], at: m, where: 'left-end', attained: !leftOpen };
      res.branch = 'right-of-axis';
    } else {
      extreme = { exists: true, value: f(n), ats: [n], at: n, where: 'right-end', attained: !rightOpen };
      res.branch = 'left-of-axis';
    }

    /* 另一端：两侧都有界时才存在。a>0 时它是最大值，a<0 时是最小值 */
    var far;
    if (hasLeft && hasRight) {
      far = pick([{ x: m, y: f(m) }, { x: n, y: f(n) }], up);
    } else {
      far = { exists: false, value: null, ats: [], at: null, where: 'unbounded' };
    }

    if (up) { res.min = extreme; res.max = far; }
    else { res.max = extreme; res.min = far; }

    var lower = res.min, upper = res.max;
    res.range = {
      loKind: lower.exists ? 'finite' : '-inf',
      lo: lower.exists ? lower.value : null,
      loOpen: lower.exists ? !lower.attained : true,
      hiKind: upper.exists ? 'finite' : '+inf',
      hi: upper.exists ? upper.value : null,
      hiOpen: upper.exists ? !upper.attained : true
    };
    return res;
  }

  /* ==========================================================
   * 6. 导出
   * ========================================================== */
  return {
    version: '1.0.0',
    Frac: Frac,
    Surd: Surd,
    parseRational: parseRational,
    toSurd: toSurd,
    Quad: Quad,
    analyzeDomain: analyzeDomain,
    tex: {
      frac: texFracSigned,
      fracMag: texFracMag,
      exact: texExact,
      exactMag: texExactMag,
      exactParen: texExactParen,
      poly: texPoly,
      vertexForm: texVertexForm,
      factoredForm: texFactoredForm,
      sqrtSimplest: texSqrtSimplest,
      sqrtChain: texSqrtChain
    },
    plain: {
      frac: plainFracSigned,
      exact: plainExact,
      poly: plainPoly,
      vertexForm: plainVertexForm,
      factoredForm: plainFactoredForm
    },
    approx: approx
  };
});
