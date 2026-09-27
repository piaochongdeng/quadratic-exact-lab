/*!
 * quadratic-exact-lab · engine.js  (v1.0.0)
 * ------------------------------------------------------------------
 * 精确二次函数计算引擎
 *   · Frac   —— 任意精度有理数（基于 BigInt，自动约分）
 *   · Surd   —— 精确根式数：有理数 × 若干无平方因子根号 的和
 *               （a + b√2 + c√3 + …，四则运算与判号全部精确）
 *   · parseExact —— 数值表达式解析：√2、-√3、2√3、(1+√3)/2、sqrt(2)、2^3 …
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

    /* 与根式混算时交给 Surd：有理数 + √2 之类必须走精确根式层 */
    add(o) { if (o instanceof Surd) return Surd.of(this).add(o); o = Frac.of(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { if (o instanceof Surd) return Surd.of(this).sub(o); o = Frac.of(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { if (o instanceof Surd) return Surd.of(this).mul(o); o = Frac.of(o); return new Frac(this.n * o.n, this.d * o.d); }
    div(o) {
      if (o instanceof Surd) return Surd.of(this).div(o);
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
      if (o instanceof Surd) return Surd.of(this).sub(o).sign();
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
      else if (ch === '×' || ch === '✕' || ch === '＊' || ch === '·' || ch === '⋅') out += '*';
      else if (ch === '÷' || ch === '∕') out += '/';
      else if (ch === '（') out += '(';
      else if (ch === '）') out += ')';
      else if (ch === '＾') out += '^';
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
   * 1.5 数值表达式解析 —— 让输入框可以直接写根号
   *
   *   √2      -√3      2√3      3/2√5      (1+√3)/2     √(9/2)
   *   sqrt(2)  2√3+√5   -3√5/2    2^3        (1+√2)(1-√2)
   *
   *   · 支持 + − × ÷ ^ 与圆括号，乘号可以省略（2√3、3(1+√2)、√2√3）
   *   · 结果落在 Q(√p₁, …, √pₘ) 内，全程精确，绝不落到浮点
   *   · 化简不出有限根式的写法（例如 √(1+√2)）会给出明确的中文提示
   * ========================================================== */

  function tokenizeExpr(s) {
    var out = [], i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === ' ') { i++; continue; }
      if ((ch >= '0' && ch <= '9') || ch === '.') {
        var j = i;
        while (j < s.length && ((s.charAt(j) >= '0' && s.charAt(j) <= '9') || s.charAt(j) === '.')) j++;
        out.push({ k: 'num', v: s.slice(i, j) });
        i = j; continue;
      }
      if (s.slice(i, i + 4).toLowerCase() === 'sqrt') { out.push({ k: 'sqrt' }); i += 4; continue; }
      if (ch === '√') { out.push({ k: 'sqrt' }); i++; continue; }
      if ('+-*/^'.indexOf(ch) >= 0) { out.push({ k: 'op', v: ch }); i++; continue; }
      if (ch === '(') { out.push({ k: '(' }); i++; continue; }
      if (ch === ')') { out.push({ k: ')' }); i++; continue; }
      throw new Error('看不懂这个符号：' + ch);
    }
    return out;
  }

  function parseExact(text) {
    var s = normalizeChars(String(text === null || text === undefined ? '' : text)).trim();
    if (s === '') throw new Error('内容是空的');
    var toks = tokenizeExpr(s);
    var pos = 0;

    function peek() { return toks[pos]; }
    function eat(kind) {
      var t = toks[pos];
      if (t && t.k === kind) { pos++; return t; }
      return null;
    }
    /* 省略乘号的判断：下一个记号能起头一个「因子」时才隐含相乘 */
    function startsFactor(t) {
      return !!t && (t.k === 'num' || t.k === 'sqrt' || t.k === '(');
    }

    function parseExpr() {
      var v = parseTerm();
      for (;;) {
        var t = peek();
        if (t && t.k === 'op' && (t.v === '+' || t.v === '-')) {
          pos++;
          var r = parseTerm();
          v = t.v === '+' ? v.add(r) : v.sub(r);
        } else break;
      }
      return v;
    }

    function parseTerm() {
      var v = parseUnary();
      for (;;) {
        var t = peek();
        if (t && t.k === 'op' && (t.v === '*' || t.v === '/')) {
          pos++;
          var r = parseUnary();
          if (t.v === '/') {
            if (r.sign() === 0) throw new Error('除数不能为 0');
            v = v.div(r);
          } else v = v.mul(r);
        } else if (startsFactor(t)) {
          v = v.mul(parseUnary());
        } else break;
      }
      return v;
    }

    function parseUnary() {
      var t = peek();
      if (t && t.k === 'op' && (t.v === '+' || t.v === '-')) {
        pos++;
        var v = parseUnary();
        return t.v === '-' ? v.neg() : v;
      }
      return parsePower();
    }

    function parsePower() {
      var base = parsePrimary();
      var t = peek();
      if (t && t.k === 'op' && t.v === '^') {
        pos++;
        var e = parseUnary();
        if (!e.isRational()) throw new Error('指数必须是具体的数');
        var num = e.a.n, den = e.a.d;
        if (den !== 1n) {
          if (num === 1n && den === 2n) return Surd.sqrtOf(base);   /* 1/2 次方就是开平方 */
          throw new Error('指数 ' + plainExact(e) + ' 开不尽，本工具只支持整数与 1/2 次方');
        }
        var n = Number(num);
        if (n > 64 || n < -64) throw new Error('指数太大了（绝对值最多 64）');
        var acc = Surd.one();
        for (var i = 0; i < Math.abs(n); i++) acc = acc.mul(base);
        if (n < 0) {
          if (acc.sign() === 0) throw new Error('0 不能作负数次方');
          acc = acc.inv();
        }
        return acc;
      }
      return base;
    }

    function parsePrimary() {
      var t = peek();
      if (!t) throw new Error('算式在这里就结束了');
      if (t.k === 'num') {
        pos++;
        return Surd.rational(decimalToFrac(t.v));
      }
      if (t.k === 'sqrt') {
        pos++;
        /* √ 只吃掉紧跟其后的那一项：√2√3 = √2·√3，√2^2 = (√2)² */
        return Surd.sqrtOf(parsePrimary());
      }
      if (t.k === '(') {
        pos++;
        var inner = parseExpr();
        if (!eat(')')) throw new Error('括号没有配对（少了右括号）');
        return inner;
      }
      throw new Error('算式里出现了意外的符号');
    }

    var val = parseExpr();
    if (pos < toks.length) throw new Error('算式后面还有没读懂的内容：' + s.slice(pos));
    return val;
  }

  /* ==========================================================
   * 2. Surd —— 精确根式数：有理数 × 若干无平方因子根号 的和
   *
   *   内部表示：Map<'无平方因子整数', Frac>，'1' 存放有理部分。
   *   例如  1 + 2√3 − √5  →  { '1': 1, '3': 2, '5': −1 }
   *
   *   加、减、乘、除、比较、判号全部精确，不借助任何浮点误差。
   *   · 单根式 a + b√d ：O(1) 的精确判号（平方比较）
   *   · 多根式        ：自适应精度的整数区间法，精度不够就加倍重算
   *   旧接口 new Surd(a, b, rad) 与 .a / .b / .rad 仍然可用，
   *   单根式场景下行为与 v1 完全一致。
   * ========================================================== */

  /* 正整数 → k²·s（s 无平方因子），即 √n = k·√s */
  function squarefreeSplit(n) {
    if (n <= 0n) throw new Error('根号内必须是正整数');
    var k = 1n, s = n, i = 2n, LIMIT = 1000000n;
    while (i * i <= s && i <= LIMIT) {
      while (s % (i * i) === 0n) { s = s / (i * i); k = k * i; }
      i += 1n;
    }
    if (s > 1n) {
      var r = bigSqrt(s);
      if (r * r === s) { k = k * r; s = 1n; }
    }
    return { k: k, s: s };
  }

  /* 无平方因子正整数的质因数列表（求范数时用） */
  function primeFactorsOf(n) {
    var out = [], m = n, i = 2n, LIMIT = 1000000n;
    while (i * i <= m && i <= LIMIT) {
      if (m % i === 0n) { out.push(i); while (m % i === 0n) m = m / i; }
      i += 1n;
    }
    if (m > 1n) out.push(m);
    return out;
  }

  class Surd {
    /* 兼容旧写法：new Surd(a, b, rad) 表示 a + b·√rad */
    constructor(a, b, rad) {
      this.t = new Map();
      var aa = (a === undefined) ? new Frac(0n) : Frac.of(a);
      if (aa.n !== 0n) this.t.set('1', aa);
      var bb = (b === undefined) ? new Frac(0n) : Frac.of(b);
      if (bb.n !== 0n) {
        var rr = (rad === undefined) ? 1n : (typeof rad === 'bigint' ? rad : BigInt(rad));
        var sp = squarefreeSplit(rr);
        this._bump(sp.s === 1n ? '1' : String(sp.s), bb.mul(new Frac(sp.k)));
      }
    }

    /* 直接用一个 Map 造对象（内部用，跳过规范化检查） */
    static _make(map) {
      var s = Object.create(Surd.prototype);
      s.t = map;
      return s;
    }

    /* 累加一项；系数变成 0 就把这一项删掉，保证「零值 ⟺ 空表」 */
    _bump(key, c) {
      if (c.n === 0n) return;
      var cur = this.t.get(key);
      var v = cur ? cur.add(c) : c;
      if (v.n === 0n) this.t.delete(key); else this.t.set(key, v);
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
    static zero() { return new Surd(); }
    static one() { return new Surd(new Frac(1n), new Frac(0n), 1n); }

    /* ---------- 结构访问 ---------- */

    /* [ { d: 无平方因子整数, c: 有理系数 }, ... ]，按 d 升序 */
    radicals() {
      var out = [];
      this.t.forEach(function (c, k) {
        if (k !== '1') out.push({ d: BigInt(k), c: c });
      });
      out.sort(function (p, q) { return p.d < q.d ? -1 : (p.d > q.d ? 1 : 0); });
      return out;
    }

    get a() { var r = this.t.get('1'); return r === undefined ? new Frac(0n) : r; }
    get rad() { var r = this.radicals(); return r.length ? r[0].d : 1n; }
    get b() { var r = this.radicals(); return r.length ? r[0].c : new Frac(0n); }

    termCount() { return this.t.size; }
    isRational() { return this.radicals().length === 0; }
    isZero() { return this.t.size === 0; }
    isInt() { return this.isRational() && this.a.isInt(); }
    isOne() { return this.isRational() && this.a.isOne(); }
    isNegOne() { return this.isRational() && this.a.n === -1n && this.a.d === 1n; }

    /* ---------- 四则运算 ---------- */

    add(o) {
      o = Surd.of(o);
      if (this.t.size === 0) return o;
      if (o.t.size === 0) return this;
      var r = Surd._make(new Map(this.t));
      o.t.forEach(function (c, k) { r._bump(k, c); });
      return r;
    }
    sub(o) { return this.add(Surd.of(o).neg()); }

    neg() {
      var m = new Map();
      this.t.forEach(function (c, k) { m.set(k, c.neg()); });
      return Surd._make(m);
    }

    /* 乘以一个有理数 */
    _scale(f) {
      f = Frac.of(f);
      if (f.n === 0n) return Surd.zero();
      var m = new Map();
      this.t.forEach(function (c, k) { m.set(k, c.mul(f)); });
      return Surd._make(m);
    }

    mul(o) {
      o = Surd.of(o);
      if (this.t.size === 0 || o.t.size === 0) return Surd.zero();
      if (this.isRational()) return o._scale(this.a);
      if (o.isRational()) return this._scale(o.a);
      var r = Surd._make(new Map());
      this.t.forEach(function (c1, k1) {
        o.t.forEach(function (c2, k2) {
          var c = c1.mul(c2);
          if (c.n === 0n) return;
          var sp = squarefreeSplit(BigInt(k1) * BigInt(k2));
          r._bump(sp.s === 1n ? '1' : String(sp.s), c.mul(new Frac(sp.k)));
        });
      });
      return r;
    }

    /*
     * 倒数。域 Q(√p₁, …, √pₘ) 上，全体共轭之积就是范数（有理数），
     * 于是 x⁻¹ = (∏_{σ≠id} σ(x)) / N(x)，全程精确。
     */
    inv() {
      if (this.t.size === 0) throw new Error('除数不能为 0');
      if (this.isRational()) return Surd.rational(this.a.inv());

      var primes = [], signOf = new Map();
      this.radicals().forEach(function (r) {
        var fs = primeFactorsOf(r.d);
        signOf.set(String(r.d), fs);
        fs.forEach(function (p) { if (primes.indexOf(p) < 0) primes.push(p); });
      });
      if (primes.length > 8) {
        throw new Error('分母里有 ' + primes.length + ' 个不同的根号质因数，无法精确求倒数');
      }

      var norm = Surd.one(), num = Surd.one();
      for (var mask = 0; mask < (1 << primes.length); mask++) {
        var conj = this._conjugate(primes, mask, signOf);
        norm = norm.mul(conj);
        if (mask !== 0) num = num.mul(conj);
      }
      if (!norm.isRational() || norm.isZero()) {
        throw new Error('无法精确求出 ' + plainExact(this) + ' 的倒数');
      }
      return num._scale(norm.a.inv());
    }

    /* 把每个 √d 里的质因子按 mask 取反符号，得到一个共轭 */
    _conjugate(primes, mask, signOf) {
      var m = new Map();
      this.t.forEach(function (c, k) {
        if (k === '1') { m.set('1', c); return; }
        var flips = 0;
        signOf.get(k).forEach(function (p) {
          var idx = primes.indexOf(p);
          if (idx >= 0 && (mask & (1 << idx))) flips++;
        });
        m.set(k, (flips % 2) ? c.neg() : c);
      });
      return Surd._make(m);
    }

    div(o) { return this.mul(Surd.of(o).inv()); }
    abs() { return this.sign() < 0 ? this.neg() : this; }

    /* ---------- 判号与比较 ---------- */

    sign() {
      if (this.t.size === 0) return 0;
      if (this.isRational()) return this.a.sign();
      var rs = this.radicals();
      if (rs.length === 1) {
        /* a + b√d：与 0 比较，在 a、b 异号时等价于比较 a² 与 b²d */
        var a = this.a, b = rs[0].c, d = rs[0].d;
        if (a.isZero()) return b.sign();
        var sa = a.sign(), sb = b.sign();
        if (sa === sb) return sa;
        var c = a.mul(a).cmp(b.mul(b).mul(new Frac(d)));
        return c === 0 ? 0 : (c > 0 ? sa : sb);
      }
      return this._signByInterval();
    }

    /*
     * 多项根式和的自适应判号。
     * 用整数开方给出 √d 的严格误差上界，累加后若 |近似值| 超过误差界，
     * 符号就确定了；否则把十进制位数加倍重算。非零代数数有正的下界，
     * 所以这个过程必定终止（这里再设一个上限兜底）。
     */
    _signByInterval() {
      var rs = this.radicals();
      var rational = this.a;
      var P = 25;
      for (var round = 0; round < 14; round++) {
        var scale = bigPow10(P);
        var D = 1n;
        D = D / bigGcd(D, rational.d) * rational.d;
        rs.forEach(function (r) { D = D / bigGcd(D, r.c.d) * r.c.d; });
        var num = rational.n * (D / rational.d) * scale;
        var err = 0n;
        rs.forEach(function (r) {
          var m = D / r.c.d;
          num += r.c.n * m * bigSqrt(r.d * scale * scale);
          err += bigAbs(r.c.n * m);
        });
        if (num > err) return 1;
        if (num < -err) return -1;
        P = P * 2;
      }
      throw new Error('无法精确判定 ' + plainExact(this) + ' 的正负（精度上限已到）');
    }

    cmp(o) { return this.sub(o).sign(); }
    eq(o) { return this.cmp(o) === 0; }

    toNumber() {
      var v = this.a.toNumber();
      this.radicals().forEach(function (r) { v += r.c.toNumber() * Math.sqrt(Number(r.d)); });
      return v;
    }
    toString() { return plainExact(this); }

    /* ---------- 开方 ---------- */

    /* √(n/d) = √(n·d)/d ，再提出平方因子 */
    static sqrtOfFrac(f) {
      f = Frac.of(f);
      if (f.sign() < 0) throw new Error('实数范围内负数不能开平方');
      if (f.isZero()) return Surd.zero();
      var sp = squarefreeSplit(f.n * f.d);
      return new Surd(new Frac(0n), new Frac(sp.k, f.d), sp.s);
    }

    /* 有理数开方；开不尽就返回 null */
    static isqrtOfRational(f) {
      f = Frac.of(f);
      if (f.sign() < 0) return null;
      var s = Surd.sqrtOfFrac(f);
      return s.isRational() ? s.a : null;
    }

    /*
     * √x。有理数直接化简；a + b√d 用经典的「去嵌套根号」公式
     *   √(a + b√d) = √((a+r)/2) + sgn(b)·√((a−r)/2)，其中 r = √(a² − b²d)
     * 只要 r 是有理数、且 (a±r)/2 不是负数，结果就是有限个根式；
     * 否则抛错，由调用方决定怎么兜底。
     */
    static sqrtOf(x) {
      x = Surd.of(x);
      if (x.isRational()) return Surd.sqrtOfFrac(x.a);
      var rs = x.radicals();
      var name = plainExact(x);
      if (rs.length !== 1) throw new Error('√(' + name + ') 不能写成有限根式');
      var a = x.a, b = rs[0].c, d = rs[0].d;
      var disc = a.mul(a).sub(b.mul(b).mul(new Frac(d)));
      if (disc.sign() < 0) throw new Error('√(' + name + ') 不能写成有限根式');
      var r = Surd.sqrtOfFrac(disc);
      if (!r.isRational()) throw new Error('√(' + name + ') 不能写成有限根式');
      var half = r.a.div(new Frac(2n));
      var p = Surd.sqrtOfFrac(a.div(new Frac(2n)).add(half));
      var q = Surd.sqrtOfFrac(a.div(new Frac(2n)).sub(half));
      return b.sign() < 0 ? p.sub(q) : p.add(q);
    }
  }

  /* ==========================================================
   * 3. 精确值的两种排版：TeX（→ 分数/根号）与纯文本
   * ========================================================== */
  function toSurd(x) {
    if (x instanceof Surd) return x;
    return Surd.of(x);
  }

  /*
   * 把一个数收敛到「最窄的类型」：
   *   有理数 → Frac（v1 的老代码路径原样保留，行为完全不变）
   *   带根号 → Surd
   * 这样只有真正输入了 √ 的地方才会走进根式运算。
   */
  function numOf(x) {
    if (x instanceof Surd) return x.isRational() ? x.a : x;
    if (x instanceof Frac) return x;
    return Frac.of(x);
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

  /* 多根式求和式的排版：把每一项按「+ / −」串起来 */
  function joinTerms(s, fracSigned, radicalMag) {
    var out = '';
    if (!s.a.isZero()) out = fracSigned(s.a);
    s.radicals().forEach(function (r) {
      var neg = r.c.sign() < 0;
      var part = radicalMag(neg ? r.c.neg() : r.c, r.d);
      if (out === '') out = (neg ? '-' : '') + part;
      else out += (neg ? ' - ' : ' + ') + part;
    });
    return out;
  }

  /* 作为系数使用时要不要加括号：1 + √2 要，√3 不用 */
  function needsParens(c) {
    c = toSurd(c);
    if (c.termCount() > 1) return true;
    return !c.isRational() && !c.a.isZero();
  }

  function texExact(x) {
    var s = toSurd(x);
    if (s.isRational()) return texFracSigned(s.a);
    var rs = s.radicals();
    if (rs.length === 1) {
      /* 单根式沿用 v1 的排版：a < 0 且 b > 0 时把根号项写在前面 */
      var radPart = texRadicalMag(rs[0].c, rs[0].d);
      var bs = rs[0].c.sign();
      if (s.a.isZero()) return (bs < 0 ? '-' : '') + radPart;
      if (bs < 0) return texFracSigned(s.a) + ' - ' + radPart;
      if (s.a.sign() > 0) return texFracSigned(s.a) + ' + ' + radPart;
      return radPart + ' - ' + texFracMag(s.a);
    }
    return joinTerms(s, texFracSigned, texRadicalMag);
  }
  function texExactMag(x) {
    var s = toSurd(x);
    return s.sign() < 0 ? texExact(s.neg()) : texExact(s);
  }
  function texExactParen(x) {
    var s = toSurd(x);
    if (s.isRational() && s.a.sign() >= 0) return texExact(s);
    if (s.termCount() === 1 && s.a.isZero() && s.sign() > 0) return texExact(s);   /* 单纯一个正根号不用加括号 */
    return '(' + texExact(s) + ')';
  }

  function plainExact(x) {
    var s = toSurd(x);
    if (s.isRational()) return plainFracSigned(s.a);
    var rs = s.radicals();
    if (rs.length === 1) {
      var radPart = plainRadicalMag(rs[0].c, rs[0].d);
      var bs = rs[0].c.sign();
      if (s.a.isZero()) return (bs < 0 ? '-' : '') + radPart;
      if (bs < 0) return plainFracSigned(s.a) + ' - ' + radPart;
      if (s.a.sign() > 0) return plainFracSigned(s.a) + ' + ' + radPart;
      return radPart + ' - ' + plainFracMag(s.a);
    }
    return joinTerms(s, plainFracSigned, plainRadicalMag);
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
      if (!(mag.isOne() && p > 0)) coefPart = texExact(mag);
      if (coefPart && varPart && needsParens(mag)) coefPart = '(' + coefPart + ')';
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
      if (!(mag.isOne() && p > 0)) coefPart = plainExact(mag);
      if (coefPart && varPart && needsParens(mag)) coefPart = '(' + coefPart + ')';
      var body = coefPart + varPart || '1';
      out += idx === 0 ? (negative ? '-' : '') + body : (negative ? ' - ' : ' + ') + body;
    });
    return out;
  }

  /* 顶点式 y = a(x-h)² + k */
  function texVertexForm(a, h, k, v) {
    v = v || 'x';
    var an = toSurd(a), neg = an.sign() < 0, amag = neg ? an.neg() : an;
    var isOne = amag.isOne();
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
    var isOne = amag.isOne();
    var head = '';
    if (!isOne) {
      head = texExact(amag);
      if (!amag.isRational()) head = '(' + head + ')';
    }
    function factor(r) {
      var s = toSurd(r);
      var body = s.sign() < 0 ? texExact(s.neg()) : texExact(s);
      var sign = s.sign() < 0 ? ' + ' : ' - ';
      /* 根本身带加减号时必须再括一层，否则 "x - 2 + \sqrt{3}" 会被读成 "(x-2)+√3" */
      if (s.termCount() > 1) body = '(' + body + ')';
      return '(' + v + sign + body + ')';
    }
    return (neg ? '-' : '') + head + factor(r1) + factor(r2);
  }

  function plainVertexForm(a, h, k, v) {
    v = v || 'x';
    var an = toSurd(a), neg = an.sign() < 0, amag = neg ? an.neg() : an;
    var isOne = amag.isOne();
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
    var isOne = amag.isOne();
    var head = '';
    if (!isOne) { head = plainExact(amag); if (!amag.isRational()) head = '(' + head + ')'; }
    function factor(r) {
      var s = toSurd(r);
      var body = s.sign() < 0 ? plainExact(s.neg()) : plainExact(s);
      var sign = s.sign() < 0 ? ' + ' : ' - ';
      /* 根本身带加减号时必须再括一层，否则 "x - 2 + √3" 会被读成 "(x-2)+√3" */
      if (s.termCount() > 1) body = '(' + body + ')';
      return '(' + v + sign + body + ')';
    }
    return (neg ? '-' : '') + head + factor(r1) + factor(r2);
  }

  /* 最简根式（不带过程）：√280 → 2\sqrt{70}；完全平方 → 整数 */
  function texSqrtSimplest(f) {
    f = toSurd(f);
    if (f.sign() < 0) return '\\sqrt{' + texExact(f) + '}';
    if (f.isZero()) return '0';
    try { return texExact(Surd.sqrtOf(f)); }
    catch (e) { return '\\sqrt{' + texExact(f) + '}'; }
  }

  /* 最简根式（带化简过程）：√280 → "\sqrt{280} = 2\sqrt{70}"；已最简时只返回根式本身 */
  function texSqrtChain(f) {
    f = toSurd(f);
    if (f.sign() < 0) return '\\sqrt{' + texExact(f) + '}';
    if (f.isZero()) return '0';
    var raw = '\\sqrt{' + texExact(f) + '}';
    var simp;
    try { simp = texExact(Surd.sqrtOf(f)); }
    catch (e) { return raw; }
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
      a = numOf(a); b = numOf(b); c = numOf(c);
      if (a.sign() === 0) throw new Error('二次项系数 a 不能为 0（否则不是二次函数）');
      return { a: a, b: b, c: c };
    },
    fromGeneral: function (a, b, c) { return Quad.make(a, b, c); },

    /* y = a(x-h)² + k  →  y = ax² + bx + c */
    fromVertex: function (a, h, k) {
      a = numOf(a); h = numOf(h); k = numOf(k);
      var b = a.mul(h).mul(new Frac(-2n));
      var c = a.mul(h).mul(h).add(k);
      return Quad.make(a, b, c);
    },

    /* y = a(x-x₁)(x-x₂)  →  y = ax² + bx + c */
    fromFactored: function (a, r1, r2) {
      a = numOf(a); r1 = numOf(r1); r2 = numOf(r2);
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
        return { x: numOf(p.x), y: numOf(p.y) };
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
      x = numOf(x);
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
        return { kind: 'double', delta: D, list: [Surd.of(base)], base: base };
      }
      if (D.sign() < 0) {
        /* 复根只是「仅供参考」的一行，不能让它连累主结论。
           Δ = -4√2 这种无理数的绝对值开平方是 √(4√2)，那是无法写成有限根式的双重根式，
           以前这里会直接抛出异常，于是「Δ < 0，没有实数零点」这个本来很确定的结论反而报不出来。
           现在改成：虚部算得出来就给精确值，算不出来就留空，由报告换一种说法。 */
        var mag = null;
        try { mag = Surd.sqrtOf(D.neg()).div(Surd.of(twoA)); } catch (e) { mag = null; }
        return { kind: 'none', delta: D, list: [], real: base, imag: mag };
      }
      var root = Surd.sqrtOf(D);
      var den = Surd.of(twoA);
      var b0 = Surd.of(base);
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
    m = hasLeft ? numOf(m) : null;
    n = hasRight ? numOf(n) : null;
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
    parseExact: parseExact,
    toSurd: toSurd,
    numOf: numOf,
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
