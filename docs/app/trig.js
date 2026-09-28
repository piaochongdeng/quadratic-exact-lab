/*!
 * quadratic-exact-lab · trig.js  (v1.4.2)
 * ------------------------------------------------------------------
 * 三角函数与直角三角形精确计算引擎
 * 纯原创实现，零第三方依赖，浏览器与 Node.js 通用。
 *
 *   · 特殊角（30° 与 45° 的整数倍）：sin / cos / tan 给出分数或最简根式
 *   · 非特殊角：按指定精度给出近似值，也可以由用户输入已知的函数值
 *   · 由已知函数值反推另外两个函数值：能精确就精确，不能就明说
 *   · 直角三角形：已知一个锐角与一条边，精确求出另外两条边、面积与周长
 *
 * 复用 engine.js 的 Frac（BigInt 有理数）与 Surd（最简二次根式 a + b√rad）。
 * ------------------------------------------------------------------
 */
(function (global, factory) {
  'use strict';
  var engine = (typeof require === 'function' && typeof module === 'object' && module.exports)
    ? require('./engine.js')
    : (global && global.QuadEngine);
  var api = factory(engine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.Trig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var Frac = E.Frac, Surd = E.Surd;
  var ZERO = new Frac(0n), ONE = new Frac(1n), TWO = new Frac(2n);

  /* ==========================================================
   * 0. 小工具
   * ========================================================== */

  /* 把任意数（Frac / Surd / number）包成根式数；纯有理数时就是 a + 0·√1 */
  function R(x) { return E.toSurd(x); }

  /*
   * 规格串：'a' 表示有理数 a；'a,b,rad' 表示 a + b√rad。
   * 表里所有根式都写成 a + b√rad 的「最简」形态，rad 内不含平方因子。
   */
  function spec(s) {
    if (s === null || s === undefined) return null;
    var p = String(s).split(',');
    if (p.length === 1) return R(E.parseRational(p[0]));
    return new Surd(E.parseRational(p[0]), E.parseRational(p[1]), BigInt(p[2]));
  }

  function bigAbs(x) { return x < 0n ? -x : x; }

  /* ==========================================================
   * 1. 特殊角表（30° 与 45° 的整数倍）
   * ========================================================== */

  /*
   * 只有「单重根式」a + b√rad 能表示的特殊角才进这张表，也就是 30° 与 45° 的整数倍。
   * 15° / 75° 一类的角，其正弦、余弦需要 (√6 ± √2)/4 这样的双重根式，
   * 超出本工具的单重根式范围，因此按「非特殊角」处理：
   * 给出按精度截取的近似值，同时允许你直接输入自己已知的函数值。
   */
  var TABLE = [
    { d: 0,   sin: '0',        cos: '1',        tan: '0' },
    { d: 30,  sin: '1/2',      cos: '0,1/2,3',  tan: '0,1/3,3' },
    { d: 45,  sin: '0,1/2,2',  cos: '0,1/2,2',  tan: '1' },
    { d: 60,  sin: '0,1/2,3',  cos: '1/2',      tan: '0,1,3' },
    { d: 90,  sin: '1',        cos: '0',        tan: null },
    { d: 120, sin: '0,1/2,3',  cos: '-1/2',     tan: '0,-1,3' },
    { d: 135, sin: '0,1/2,2',  cos: '0,-1/2,2', tan: '-1' },
    { d: 150, sin: '1/2',      cos: '0,-1/2,3', tan: '0,-1/3,3' },
    { d: 180, sin: '0',        cos: '-1',       tan: '0' },
    { d: 210, sin: '-1/2',     cos: '0,-1/2,3', tan: '0,1/3,3' },
    { d: 225, sin: '0,-1/2,2', cos: '0,-1/2,2', tan: '1' },
    { d: 240, sin: '0,-1/2,3', cos: '-1/2',     tan: '0,1,3' },
    { d: 270, sin: '-1',       cos: '0',        tan: null },
    { d: 300, sin: '0,-1/2,3', cos: '1/2',      tan: '0,-1,3' },
    { d: 315, sin: '0,-1/2,2', cos: '0,1/2,2',  tan: '-1' },
    { d: 330, sin: '-1/2',     cos: '0,1/2,3',  tan: '0,-1/3,3' }
  ];

  var TABLE_ROWS = TABLE.map(function (r) {
    return { f: new Frac(BigInt(r.d)), row: r };
  });

  /* 把角度归一化到 [0, 360) */
  function normDeg(x) {
    var f = Frac.of(x);
    var period = 360n * f.d;
    var m = f.n % period;
    if (m < 0n) m += period;
    return new Frac(m, f.d);
  }

  function degText(f) {
    f = Frac.of(f);
    return f.d === 1n ? String(f.n) : f.n + '/' + f.d;
  }

  /* 查表：返回精确的 sin / cos / tan，找不到返回 null */
  function specialOf(x) {
    var raw = Frac.of(x);
    var norm = normDeg(raw);
    for (var i = 0; i < TABLE_ROWS.length; i++) {
      if (norm.eq(TABLE_ROWS[i].f)) {
        var row = TABLE_ROWS[i].row;
        return {
          raw: raw,
          deg: norm,
          degText: degText(norm),
          sin: spec(row.sin),
          cos: spec(row.cos),
          tan: spec(row.tan),
          hasTan: row.tan !== null
        };
      }
    }
    return null;
  }

  function isSpecial(x) { return !!specialOf(x); }

  /* 15° 的奇数倍：精确值需要双重根式，单独标出来好向用户解释 */
  function isHalfSpecial(x) {
    var n = normDeg(x);
    return n.d === 1n && n.n % 15n === 0n && !isSpecial(n);
  }

  /* ==========================================================
   * 2. 近似计算
   * ========================================================== */

  function toRad(x) { return Frac.of(x).toNumber() * Math.PI / 180; }

  /* 由角度算近似值；tan 不存在时返回 null */
  function numeric(x) {
    var r = toRad(x);
    var s = Math.sin(r), c = Math.cos(r);
    if (Math.abs(s) < 1e-15) s = 0;
    if (Math.abs(c) < 1e-15) c = 0;
    return { sin: s, cos: c, tan: c === 0 ? null : s / c };
  }

  /* 由「已知的一个函数值」算近似值（取锐角主值：sin ≥ 0、cos ≥ 0） */
  function numericFromValue(fn, v) {
    var x = E.numOf(v).toNumber();
    if (fn === 'sin') {
      if (Math.abs(x) > 1) throw new Error('sin 的绝对值不能大于 1');
      var c = Math.sqrt(Math.max(0, 1 - x * x));
      return { sin: x, cos: c, tan: c === 0 ? null : x / c };
    }
    if (fn === 'cos') {
      if (Math.abs(x) > 1) throw new Error('cos 的绝对值不能大于 1');
      var s = Math.sqrt(Math.max(0, 1 - x * x));
      return { sin: s, cos: x, tan: x === 0 ? null : s / x };
    }
    var w = Math.sqrt(1 + x * x);
    return { sin: x / w, cos: 1 / w, tan: x };
  }

  /* ==========================================================
   * 3. 精确反推：由已知的一个函数值求出另外两个
   * ========================================================== */

  /* √ 内部的乘积超过这个上限就交给浮点，避免大整数开方拖慢界面 */
  var SAFE_LIMIT = 10000000n;

  function safeSqrtOfFrac(f) {
    f = E.numOf(f);
    /* 带根号的输入（如 sin θ = √3/2）算到这里可能是 1 − 3/4 = 1/4 这种有理数，
       那就照常精确开方；真要是无理数，交给浮点分支，不硬做。 */
    if (!(f instanceof Frac)) return null;
    if (f.sign() < 0) return null;
    if (f.isZero()) return Surd.zero();
    if (f.n * f.d > SAFE_LIMIT) return null;
    return Surd.sqrtOfFrac(f);
  }

  /* 结果是否「好看」：根号内不大、分子分母不夸张 */
  function isCleanSurd(s, lim) {
    if (s === null || s === undefined) return true;      /* tan 不存在时也允许 */
    s = E.toSurd(s);
    lim = lim || {};
    var maxRad = lim.maxRad === undefined ? 100000n : lim.maxRad;
    var maxNum = lim.maxNum === undefined ? 1000000n : lim.maxNum;
    if (s.rad > maxRad) return false;
    var nums = [s.a.n, s.a.d, s.b.n, s.b.d];
    for (var i = 0; i < nums.length; i++) {
      if (bigAbs(nums[i]) > maxNum) return false;
    }
    return true;
  }

  /*
   * 由已知的一个函数值精确反推 sin / cos / tan（锐角主值）。
   *   sin v → cos = √(1 - v²)，tan = v / cos
   *   cos v → sin = √(1 - v²)，tan = sin / v
   *   tan v → sin = v / √(1 + v²)，cos = 1 / √(1 + v²)
   * 能写成最简根式就返回精确值；写不出来或结果太丑则返回 null，由调用方改用浮点。
   */
  function deriveFromValue(fn, v) {
    v = E.numOf(v);
    if (fn === 'sin' || fn === 'cos') {
      if (v.abs().cmp(ONE) > 0) throw new Error((fn === 'sin' ? 'sin' : 'cos') + ' 的绝对值不能大于 1');
    }
    var out = null;
    try {
      if (fn === 'sin') {
        var cos = safeSqrtOfFrac(ONE.sub(v.mul(v)));
        if (!cos) return null;
        out = { sin: R(v), cos: cos, tan: cos.isZero() ? null : R(v).div(cos) };
      } else if (fn === 'cos') {
        var sin = safeSqrtOfFrac(ONE.sub(v.mul(v)));
        if (!sin) return null;
        out = { sin: sin, cos: R(v), tan: v.isZero() ? null : sin.div(R(v)) };
      } else {
        var w = safeSqrtOfFrac(ONE.add(v.mul(v)));
        if (!w) return null;
        out = { sin: R(v).div(w), cos: R(ONE).div(w), tan: R(v) };
      }
    } catch (e) {
      return null;
    }
    if (!out) return null;
    if (!isCleanSurd(out.sin) || !isCleanSurd(out.cos) || !isCleanSurd(out.tan)) return null;
    out.exact = true;
    return out;
  }

  /* ==========================================================
   * 4. 直角三角形求解
   * ========================================================== */

  /*
   * 直角在 C，角 θ 在 A：
   *   o = BC 对边，a = AC 邻边，h = AB 斜边
   *   sinθ = o/h，cosθ = a/h，tanθ = o/a
   * opts: { sin, cos, tan, sideKind, side, exact }
   *   exact = true 时 sin / cos / tan / side 都是 Surd，返回 Surd；
   *   exact = false 时都是普通数字，返回普通数字。
   */
  function solveRightTriangle(opts) {
    var kind = opts.sideKind, side = opts.side, exact = !!opts.exact;
    var res = { sideKind: kind, exact: exact, o: null, a: null, h: null };
    if (exact) {
      var s = opts.sin, c = opts.cos, t = opts.tan;
      if (kind === 'opposite') { res.o = side; res.h = side.div(s); res.a = side.div(t); }
      else if (kind === 'adjacent') { res.a = side; res.h = side.div(c); res.o = side.mul(t); }
      else { res.h = side; res.o = side.mul(s); res.a = side.mul(c); }
      res.perimeter = res.o.add(res.a).add(res.h);
      res.area = res.o.mul(res.a).div(TWO);
    } else {
      var S = opts.sin, C = opts.cos, T = opts.tan, x = side;
      if (kind === 'opposite') { res.o = x; res.h = x / S; res.a = x / T; }
      else if (kind === 'adjacent') { res.a = x; res.h = x / C; res.o = x * T; }
      else { res.h = x; res.o = x * S; res.a = x * C; }
      res.perimeter = res.o + res.a + res.h;
      res.area = res.o * res.a / 2;
    }
    return res;
  }

  /* ==========================================================
   * 5. 画布友好的纯文本排版：3√2/2、-√3/3、1/2
   * ========================================================== */

  function plainNice(x) {
    var s = E.toSurd(x);
    function fracMag(f) { return f.d === 1n ? String(f.n) : f.n + '/' + f.d; }
    function fracSigned(f) {
      if (f.n === 0n) return '0';
      return (f.n < 0n ? '-' : '') + fracMag(f.abs());
    }
    if (s.isRational()) return fracSigned(s.a);
    var b = s.b, rad = s.rad;
    var mag = b.abs();
    var root = (mag.n === 1n ? '' : String(mag.n)) + '√' + rad + (mag.d === 1n ? '' : '/' + mag.d);
    var neg = b.sign() < 0;
    if (s.a.isZero()) return (neg ? '-' : '') + root;
    if (neg) return fracSigned(s.a) + ' - ' + root;
    if (s.a.sign() > 0) return fracSigned(s.a) + ' + ' + root;
    return root + ' - ' + fracMag(s.a.abs());
  }

  /* ==========================================================
   * 6. 导出
   * ========================================================== */

  return {
    version: '1.4.2',
    TABLE: TABLE,
    normDeg: normDeg,
    degText: degText,
    specialOf: specialOf,
    isSpecial: isSpecial,
    isHalfSpecial: isHalfSpecial,
    numeric: numeric,
    numericFromValue: numericFromValue,
    deriveFromValue: deriveFromValue,
    solveRightTriangle: solveRightTriangle,
    safeSqrtOfFrac: safeSqrtOfFrac,
    isCleanSurd: isCleanSurd,
    plainNice: plainNice,
    toRad: toRad
  };
});