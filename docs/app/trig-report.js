/*!
 * quadratic-exact-lab · trig-report.js  (v1.4.2)
 * ------------------------------------------------------------------
 * 把「角度 / 函数值 + 一条边」整理成一份完整的 Markdown 解析报告。
 * 纯函数、无副作用；浏览器与 Node.js 通用，因此可以直接单元测试。
 * ------------------------------------------------------------------
 */
(function (global, factory) {
  'use strict';
  var isNode = (typeof require === 'function' && typeof module === 'object' && module.exports);
  var engine = isNode ? require('./engine.js') : (global && global.QuadEngine);
  var trig = isNode ? require('./trig.js') : (global && global.Trig);
  var api = factory(engine, trig);
  if (isNode) module.exports = api;
  if (global) global.TrigReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E, T) {
  'use strict';

  var Frac = E.Frac, Surd = E.Surd;
  var tex = E.tex;

  var FN_TEX = { sin: '\\sin', cos: '\\cos', tan: '\\tan' };
  var FN_NAME = { sin: '正弦', cos: '余弦', tan: '正切' };
  var SIDE_NAME = { opposite: '对边', adjacent: '邻边', hypotenuse: '斜边' };
  var SIDE_LETTER = { opposite: 'o', adjacent: 'a', hypotenuse: 'h' };
  var SIDE_EDGE = { opposite: 'BC', adjacent: 'AC', hypotenuse: 'AB' };
  var ALL_SIDES = ['opposite', 'adjacent', 'hypotenuse'];

  /* 精度默认 4 位，与网页版一致 */
  var DIGITS = 4;

  /* ================= 工具 ================= */

  function clampDigits(d) {
    var n = Number(d);
    if (!isFinite(n)) return 4;
    n = Math.round(n);
    if (n < 0) n = 0;
    if (n > 10) n = 10;
    return n;
  }

  function str(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

  function parseNum(text, label) {
    var t = str(text);
    if (t === '') throw new Error('「' + label + '」不能为空');
    try { return E.numOf(E.parseExact(t)); }
    catch (e) {
      throw new Error('「' + label + '」无法识别：' + t +
        '（支持整数、分数如 3/4、小数如 0.75、负数，以及根号如 √3/2）');
    }
  }

  /* 角度必须是普通的数：√2 度这种没法查特殊角表，直接讲清楚 */
  function parseAngle(text, label) {
    var v = parseNum(text, label);
    if (v instanceof Surd && !v.isRational()) {
      throw new Error('「' + label + '」要是普通的数，根号只能用在函数值上（例如 sin θ = √3/2）');
    }
    return v;
  }

  /* 普通数字按当前精度排版（去掉末尾多余的 0） */
  function fmt(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    var s = v.toFixed(DIGITS);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  function fmtMore(v, extra) {
    if (typeof v !== 'number' || !isFinite(v)) return fmt(v);
    var s = v.toFixed(DIGITS + (extra === undefined ? 2 : extra));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  /* 行内公式：m('\\frac{1}{2}') → '$\frac{1}{2}$' */
  function m(s) { return '$' + s + '$'; }

  function degTex(f) { return tex.exact(Frac.of(f)) + '^{\\circ}'; }

  /* 近似角度的排版：普通数字 → "36.8699^{\\circ}" */
  function degNumTex(v) { return fmtMore(v, 0) + '^{\\circ}'; }
  function degNumM(v) { return m(degNumTex(v)); }
  function degM(f) { return m(degTex(f)); }

  /* Frac / Surd / number 统一转成 number */
  function numOf(x) {
    if (x === null || x === undefined) return NaN;
    if (x instanceof Frac) return x.toNumber();
    if (typeof x.toNumber === 'function') return x.toNumber();
    return Number(x);
  }

  /* Markdown 表格行：任意列数 */
  function row() {
    return '| ' + Array.prototype.slice.call(arguments).join(' | ') + ' |';
  }

  function surdOf(text) {
    return E.toSurd(E.numOf(E.parseExact(text)));
  }

  /* ================= 主流程 ================= */

  function build(input) {
    try { return buildInner(input || {}); }
    catch (err) {
      return { ok: false, error: (err && err.message) ? err.message : String(err) };
    }
  }

  function buildInner(input) {
    DIGITS = clampDigits(input.digits);

    var fn = (input.fn === 'cos' || input.fn === 'tan') ? input.fn : 'sin';
    var mode = (input.valueSource === 'user') ? 'user' : 'auto';
    var sideKind = (input.sideKind === 'adjacent' || input.sideKind === 'hypotenuse') ? input.sideKind : 'opposite';

    var angleText = str(input.angle);
    var valueText = str(input.value);
    var sideText = str(input.side);

    var MD = [];
    var P = function (s) { MD.push(s); };
    var md = function (s) { MD.push(s); MD.push(''); };

    /* ---------- 1. 角度与三个函数值 ---------- */

    var angleFrac = null;
    if (mode === 'auto') {
      if (angleText === '') throw new Error('请填写角度（单位：度），例如 30、37.5 或 45/2');
      angleFrac = parseAngle(angleText, '角度');
    } else if (angleText !== '') {
      angleFrac = parseAngle(angleText, '角度（可留空）');
    }

    var special = null, halfSpecial = false;
    var ratios = null;
    var numSin = null, numCos = null, numTan = null;
    var exactFlag = false, source = 'numeric';
    var userValueFrac = null;

    if (mode === 'auto') {
      special = T.specialOf(angleFrac);
      if (special) {
        ratios = { sin: special.sin, cos: special.cos, tan: special.tan };
        exactFlag = true; source = 'special';
        numSin = special.sin.toNumber();
        numCos = special.cos.toNumber();
        numTan = special.tan ? special.tan.toNumber() : null;
      } else {
        halfSpecial = T.isHalfSpecial(angleFrac);
        var nm = T.numeric(angleFrac);
        numSin = nm.sin; numCos = nm.cos; numTan = nm.tan;
        source = 'numeric';
      }
    } else {
      if (valueText === '') throw new Error('请填写你已知的 ' + FN_NAME[fn] + ' 值，例如 0.6、3/5 或 0.7071');
      userValueFrac = parseNum(valueText, FN_NAME[fn] + ' 值');
      var dv = T.deriveFromValue(fn, userValueFrac);
      if (dv) {
        ratios = { sin: dv.sin, cos: dv.cos, tan: dv.tan };
        exactFlag = true; source = 'user-exact';
        numSin = dv.sin.toNumber(); numCos = dv.cos.toNumber();
        numTan = dv.tan ? dv.tan.toNumber() : null;
      } else {
        var nv = T.numericFromValue(fn, userValueFrac);
        numSin = nv.sin; numCos = nv.cos; numTan = nv.tan;
        source = 'user-numeric';
      }
    }

    /* ---------- 2. 角度（用于画图与三角形） ---------- */

    var thetaNum = (mode === 'auto') ? angleFrac.toNumber() : (Math.atan2(numSin, numCos) * 180 / Math.PI);
    var normNum = ((thetaNum % 360) + 360) % 360;
    var thetaEff = normNum;
    var acute = (thetaEff > 0 && thetaEff < 90);

    var angleCheck = null;
    if (mode === 'user' && angleFrac) {
      var givenNorm = T.normDeg(angleFrac).toNumber();
      var diff = givenNorm - normNum;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      angleCheck = {
        given: givenNorm,
        derived: normNum,
        diff: diff,
        consistent: Number(givenNorm.toFixed(DIGITS)) === Number(normNum.toFixed(DIGITS))
      };
    }

    /* ---------- 3. 直角三角形 ---------- */

    var tri = null, triError = null, triExact = false;
    var sideGivenTex = '';
    if (sideText !== '') {
      sideGivenTex = sideText;
      try { sideGivenTex = tex.exact(surdOf(sideText)); }
      catch (e) { sideGivenTex = sideText; }
    }

    if (sideText === '') {
      triError = '还没有填写已知边。在左栏「已知边」里选好是**对边 / 邻边 / 斜边**并填上长度，' +
        '程序就会自动画出按比例缩放的直角三角形，并给出另外两条边、面积与周长。';
    } else if (!acute) {
      triError = '直角三角形要求 ' + m('0^{\\circ} < \\theta < 90^{\\circ}') +
        '，当前 ' + m('\\theta = ' + degNumTex(thetaEff)) + '，所以这一节跳过（上面的三角函数值仍然有效）。';
    } else if (numTan === null) {
      triError = m('\\tan\\theta') + ' 不存在，无法求解直角三角形。';
    } else {
      var sideFrac = parseNum(sideText, SIDE_NAME[sideKind]);
      if (sideFrac.sign() <= 0) throw new Error('「' + SIDE_NAME[sideKind] + '」必须是正数');

      if (exactFlag) {
        try {
          tri = T.solveRightTriangle({
            sin: ratios.sin, cos: ratios.cos, tan: ratios.tan,
            sideKind: sideKind, side: surdOf(sideText), exact: true
          });
          triExact = true;
        } catch (e) { tri = null; triExact = false; }
      }
      if (!tri) {
        tri = T.solveRightTriangle({
          sin: numSin, cos: numCos, tan: numTan,
          sideKind: sideKind, side: sideFrac.toNumber(), exact: false
        });
        triExact = false;
      }
    }

    /* ---------- 4. 数据（供画布使用） ---------- */

    function val(surd, numeric, missing) {
      return {
        exact: exactFlag && !!surd,
        missing: !!missing,
        tex: surd ? tex.exact(surd) : null,
        plain: surd ? T.plainNice(surd) : fmt(numeric),
        num: (typeof numeric === 'number') ? numeric : numOf(numeric)
      };
    }

    var data = {
      digits: DIGITS,
      fn: fn,
      valueSource: mode,
      source: source,
      exact: exactFlag,
      special: special ? { degText: special.degText, degNum: special.deg.toNumber() } : null,
      halfSpecial: halfSpecial,
      angleNum: thetaNum,
      angleNorm: normNum,
      angleTex: (mode === 'auto') ? degTex(angleFrac) : degNumTex(thetaEff),
      ratio: {
        sin: val(ratios && ratios.sin, numSin, false),
        cos: val(ratios && ratios.cos, numCos, false),
        tan: val(ratios && ratios.tan, numTan, numTan === null)
      },
      tri: null,
      triError: triError,
      angleCheck: angleCheck,
      sideKind: sideKind
    };

    if (tri) {
      function tval(v, numv) {
        return {
          exact: triExact,
          tex: triExact ? tex.exact(v) : null,
          plain: triExact ? T.plainNice(v) : fmt(numv),
          num: numv
        };
      }
      data.tri = {
        exact: triExact,
        sideKind: sideKind,
        o: tval(tri.o, numOf(tri.o)),
        a: tval(tri.a, numOf(tri.a)),
        h: tval(tri.h, numOf(tri.h)),
        area: tval(tri.area, numOf(tri.area)),
        perimeter: tval(tri.perimeter, numOf(tri.perimeter)),
        thetaNum: thetaEff,
        otherNum: 90 - thetaEff
      };
    }

    /* ==========================================================
     * 报告正文
     * ========================================================== */

    md('# 三角函数与直角三角形解析报告');
    md('> 角度单位为**度**（' + m('^{\\circ}') + '）。能精确表示的结果一律写成**分数**或**最简根式**；' +
       '无法精确表示的按设定精度给出**近似值**并明确标注。' +
       '报告中出现的根式都已化为最简根式（根号内不含平方因子）。');

    /* ---- 一、已知条件 ---- */
    md('## 一、已知条件');
    var givenRows = [];
    givenRows.push(row('已知函数', m(FN_TEX[fn] + '\\theta') + '（' + FN_NAME[fn] + '）'));
    if (mode === 'auto') {
      givenRows.push(row('角度', m('\\theta = ' + degTex(angleFrac))));
      if (special && !special.raw.eq(special.deg)) {
        givenRows.push(row('终边相同的角',
          degM(angleFrac) + ' 与 ' + degM(special.deg) + ' 终边相同，三角函数值完全相同'));
      }
    } else {
      givenRows.push(row('已知的' + FN_NAME[fn] + '值', m(FN_TEX[fn] + '\\theta = ' + tex.exact(userValueFrac))));
      givenRows.push(row('角度', angleFrac
        ? degM(T.normDeg(angleFrac)) + '（仅用于对照）'
        : '由函数值反推：' + m('\\theta \\approx ' + fmt(normNum) + '^{\\circ}')));
    }
    if (sideText !== '') {
      givenRows.push(row('已知边', SIDE_NAME[sideKind] + ' ' + m(SIDE_LETTER[sideKind] + ' = ' + sideGivenTex)));
    }
    givenRows.push(row('小数精度', '小数点后 ' + m(String(DIGITS)) + ' 位'));
    givenRows.push(row('函数值来源', mode === 'auto'
      ? (special ? '由角度精确计算（特殊角）' : '由角度计算（非特殊角，按精度取近似）')
      : (exactFlag ? '由你输入的函数值精确反推' : '由你输入的函数值反推（按精度取近似）')));
    P('| 项目 | 内容 |');
    P('| --- | --- |');
    P(givenRows.join('\n'));
    P('');

    /* ---- 二、三角函数值 ---- */
    md('## 二、三角函数值');
    if (mode === 'auto') {
      if (special) {
        md('**特殊角判定**：' + degM(special.deg) + ' 是**特殊角**。特殊角指 ' +
           m('30^{\\circ}') + ' 与 ' + m('45^{\\circ}') + ' 的整数倍（' +
           m('0^{\\circ}') + '、' + m('30^{\\circ}') + '、' + m('45^{\\circ}') + '、' +
           m('60^{\\circ}') + '、' + m('90^{\\circ}') + ' …），' +
           '它们的三角函数值可以写成精确的分数或最简根式，本工具直接给出精确结果。');
      } else if (halfSpecial) {
        md('**特殊角判定**：' + degM(T.normDeg(angleFrac)) + ' 不是本工具意义下的特殊角。' +
           '它是 ' + m('15^{\\circ}') + ' 的奇数倍，精确值需要 ' +
           m('(\\sqrt{6} \\pm \\sqrt{2})/4') + ' 这类**双重根式**，' +
           '超出本工具的单重根式 ' + m('a + b\\sqrt{d}') + ' 范围，因此这里给出按精度截取的近似值。' +
           '如果你手边有更精确的函数值，切到「我输入函数值」，程序会用它反推另外两个函数值。');
      } else {
        md('**特殊角判定**：' + degM(T.normDeg(angleFrac)) + ' 不是特殊角。' +
           '特殊角指 ' + m('30^{\\circ}') + ' 与 ' + m('45^{\\circ}') + ' 的整数倍；' +
           '其余角度的三角函数值一般是无理数，无法写成有限分数或单重根式，因此这里按精度给出近似值。' +
           '如果你已知某个函数值（例如从数表查到的 ' + m('0.6') + '），可以切到「我输入函数值」，' +
           '程序会用它反推另外两个函数值——像 ' + m('\\sin\\theta = 0.6') + ' 这种，' +
           '还能给出精确的 ' + m('\\cos\\theta = \\frac{4}{5}') + ' 与 ' + m('\\tan\\theta = \\frac{3}{4}') + '。');
      }
    } else if (exactFlag) {
      /* 输入本身可能就带根号（如 sin θ = √3/2），措辞要说准，别一律叫「有理数」 */
      var inIsSurd = (userValueFrac instanceof Surd) && !userValueFrac.isRational();
      md('**反推结果**：你输入的 ' + m(FN_TEX[fn] + '\\theta = ' + tex.exact(userValueFrac)) +
         (inIsSurd ? ' 是最简根式' : ' 是有理数') +
         '，由恒等式 ' + m('\\sin^{2}\\theta + \\cos^{2}\\theta = 1') +
         ' 反推出来的另外两个函数值**同样可以精确表示**，已经化成最简根式。');
    } else {
      md('**反推结果**：由你输入的 ' + m(FN_TEX[fn] + '\\theta = ' + tex.exact(userValueFrac)) +
         ' 反推出来的另外两个函数值无法写成简洁的分数或单重根式，因此按精度给出近似值。');
    }
    P('');
    P('| 函数 | 精确值 | 近似值（' + m(String(DIGITS)) + ' 位小数） |');
    P('| --- | --- | --- |');
    ['sin', 'cos', 'tan'].forEach(function (k) {
      var v = data.ratio[k];
      var ex = v.missing ? '不存在' : (v.exact ? m(v.tex) : '无法精确表示');
      var ap = v.missing ? '—' : m(fmt(v.num));
      P(row(m(FN_TEX[k] + '\\theta'), ex, ap));
    });
    P('');
    if (data.ratio.tan.missing) {
      md('说明：' + m('\\theta = 90^{\\circ}') + ' 时 ' + m('\\cos\\theta = 0') +
         '，正切的分母为零，因此 ' + m('\\tan\\theta') + ' **不存在**。');
    }

    /* 模式二：交叉检验 */
    if (angleCheck) {
      md('### 角度与函数值的对照');
      if (angleCheck.consistent) {
        md('- 你填写的角度 ' + m(fmt(angleCheck.given) + '^{\\circ}') + ' 与由函数值反推出的角度 ' +
           m(fmt(angleCheck.derived) + '^{\\circ}') + ' 在你设定的精度下**一致** ✓');
      } else {
        md('- 你填写的角度 ' + m(fmt(angleCheck.given) + '^{\\circ}') + ' 与由函数值反推出的角度 ' +
           m(fmt(angleCheck.derived) + '^{\\circ}') + ' **不一致**，相差 ' +
           m(fmtMore(Math.abs(angleCheck.diff), 2) + '^{\\circ}') + '。');
        md('- 直角三角形按**反推角度** ' + m(fmt(angleCheck.derived) + '^{\\circ}') + ' 求解；' +
           '如果你想以角度为准，把「函数值来源」切回「由角度计算」即可。');
      }
    }

    /* ---- 三、直角三角形 ---- */
    md('## 三、直角三角形求解');
    if (!tri) {
      md(triError || '无法求解直角三角形。');
    } else {
      md('**约定**：直角在顶点 ' + m('C') + '，角 ' + m('\\theta') + ' 在顶点 ' + m('A') + '；' +
         '对边 ' + m('o = BC') + '（角的对面），邻边 ' + m('a = AC') + '（贴着角的那条直角边），' +
         '斜边 ' + m('h = AB') + '（直角的对面）。');
      md('已知 **' + SIDE_NAME[sideKind] + ' ' + m(SIDE_LETTER[sideKind] + ' = ' + sideGivenTex) + '**。');
      P('');
      P('| 边 | 记号 | 精确值 | 近似值（' + m(String(DIGITS)) + ' 位小数） |');
      P('| --- | --- | --- | --- |');
      ALL_SIDES.forEach(function (k) {
        var key = SIDE_LETTER[k];
        var v = data.tri[key];
        P(row(SIDE_NAME[k] + ' ' + m(SIDE_EDGE[k]), m(key),
          v.exact ? m(v.tex) : m(v.plain),
          m(fmt(v.num))));
      });
      P('');
      P('| 角 | 值 |');
      P('| --- | --- |');
      P(row(m('\\angle A = \\theta'), m(fmt(data.tri.thetaNum) + '^{\\circ}')));
      P(row(m('\\angle B'), m(fmt(data.tri.otherNum) + '^{\\circ}')));
      P(row(m('\\angle C') + '（直角）', m('90^{\\circ}')));
      P('');
      md('三个内角之和：' + m(fmt(data.tri.thetaNum) + '^{\\circ} + ' + fmt(data.tri.otherNum) +
         '^{\\circ} + 90^{\\circ} = 180^{\\circ}') + ' ✓');
      if (triExact) {
        md('本次三条边**全部是精确值**（分数 / 最简根式），「精确值」列没有任何误差。');
      } else {
        md('本次结果含近似值：已知角不是特殊角（或你输入的函数值无法精确反推），' +
           '所以边长按你设定的精度取近似，误差不超过最后一位的半个单位。');
      }
    }

    /* ---- 四、面积与周长 ---- */
    md('## 四、面积与周长');
    if (!tri) {
      md('这一节需要先确定三角形的三条边，请在上面的「已知边」里填好长度。');
    } else {
      P('| 量 | 精确值 | 近似值（' + m(String(DIGITS)) + ' 位小数） |');
      P('| --- | --- | --- |');
      P(row('面积 ' + m('S'), data.tri.area.exact ? m(data.tri.area.tex) : m(data.tri.area.plain), m(fmt(data.tri.area.num))));
      P(row('周长 ' + m('P'), data.tri.perimeter.exact ? m(data.tri.perimeter.tex) : m(data.tri.perimeter.plain), m(fmt(data.tri.perimeter.num))));
      P('');
      md('面积公式：' + m('S = \\dfrac{1}{2} \\times o \\times a') +
         '；周长公式：' + m('P = o + a + h') + '。');
    }

    /* ---- 五、恒等式检验 ---- */
    md('## 五、恒等式检验');
    P('- ' + m('\\sin^{2}\\theta + \\cos^{2}\\theta = ' + fmt(numSin * numSin) + ' + ' +
      fmt(numCos * numCos) + ' = ' + fmt(numSin * numSin + numCos * numCos) + ' \\approx 1') + ' ✓');
    if (numTan === null) {
      P('- ' + m('\\tan\\theta') + ' 在 ' + m('\\theta = 90^{\\circ}') + ' 处**不存在**（余弦为 ' + m('0') + '，分母为零）。');
    } else {
      P('- ' + m('\\tan\\theta = \\dfrac{\\sin\\theta}{\\cos\\theta} = \\dfrac{' + fmt(numSin) + '}{' +
        fmt(numCos) + '} = ' + fmt(numTan)) + ' ✓');
    }
    if (exactFlag && data.ratio.sin.exact && data.ratio.cos.exact) {
      P('- 精确形式下同样成立：' + m('\\left(' + data.ratio.sin.tex + '\\right)^{2} + \\left(' +
        data.ratio.cos.tex + '\\right)^{2} = 1') + '。');
    }
    P('');

    /* ---- 六、求解步骤 ---- */
    md('## 六、求解步骤');
    var steps = [];
    if (mode === 'auto') {
      if (special) {
        var fnVal = ratios[fn];
        steps.push(degM(special.deg) + ' 是特殊角，' + (fnVal
          ? ('直接得到 ' + m(FN_TEX[fn] + '\\theta = ' + tex.exact(fnVal)) + '，另外两个函数值也一并精确写出。')
          : ('不过 ' + m('\\tan\\theta') + ' 在这一角度处**不存在**（余弦为零）。')));
      } else {
        steps.push(degM(T.normDeg(angleFrac)) + ' 不是特殊角，按 ' + m(String(DIGITS)) + ' 位小数取近似：' +
          m('\\sin\\theta \\approx ' + fmt(numSin)) + '，' +
          m('\\cos\\theta \\approx ' + fmt(numCos)) + '，' +
          m('\\tan\\theta \\approx ' + (numTan === null ? '\\text{不存在}' : fmt(numTan))) + '。');
      }
    } else {
      steps.push('已知 ' + m(FN_TEX[fn] + '\\theta = ' + tex.exact(userValueFrac)) + '，' +
        (exactFlag
          ? '由恒等式 ' + m('\\sin^{2}\\theta + \\cos^{2}\\theta = 1') + ' 精确反推得 ' +
            m('\\sin\\theta = ' + data.ratio.sin.tex) + '，' + m('\\cos\\theta = ' + data.ratio.cos.tex) +
            (data.ratio.tan.missing ? '。' : '，' + m('\\tan\\theta = ' + data.ratio.tan.tex) + '。')
          : '按精度反推得 ' + m('\\sin\\theta \\approx ' + fmt(numSin)) + '，' +
            m('\\cos\\theta \\approx ' + fmt(numCos)) + '。'));
      steps.push('反推角度：' + m('\\theta \\approx ' + fmt(normNum) + '^{\\circ}') + '。');
    }
    if (tri) {
      var O = fmt(data.tri.o.num), A = fmt(data.tri.a.num), H = fmt(data.tri.h.num);
      if (sideKind === 'hypotenuse') {
        steps.push('斜边已知 ' + m('h = ' + H) + '，由 ' + m('\\sin\\theta = \\dfrac{o}{h}') + ' 得 ' +
          m('o = h\\sin\\theta = ' + H + ' \\times ' + fmt(numSin) + ' = ' + O) + '。');
        steps.push('由 ' + m('\\cos\\theta = \\dfrac{a}{h}') + ' 得 ' +
          m('a = h\\cos\\theta = ' + H + ' \\times ' + fmt(numCos) + ' = ' + A) + '。');
      } else if (sideKind === 'opposite') {
        steps.push('对边已知 ' + m('o = ' + O) + '，由 ' + m('\\sin\\theta = \\dfrac{o}{h}') + ' 得 ' +
          m('h = \\dfrac{o}{\\sin\\theta} = \\dfrac{' + O + '}{' + fmt(numSin) + '} = ' + H) + '。');
        steps.push('由 ' + m('\\tan\\theta = \\dfrac{o}{a}') + ' 得 ' +
          m('a = \\dfrac{o}{\\tan\\theta} = \\dfrac{' + O + '}{' + fmt(numTan) + '} = ' + A) + '。');
      } else {
        steps.push('邻边已知 ' + m('a = ' + A) + '，由 ' + m('\\cos\\theta = \\dfrac{a}{h}') + ' 得 ' +
          m('h = \\dfrac{a}{\\cos\\theta} = \\dfrac{' + A + '}{' + fmt(numCos) + '} = ' + H) + '。');
        steps.push('由 ' + m('\\tan\\theta = \\dfrac{o}{a}') + ' 得 ' +
          m('o = a\\tan\\theta = ' + A + ' \\times ' + fmt(numTan) + ' = ' + O) + '。');
      }
      steps.push('面积 ' + m('S = \\dfrac{1}{2}oa = ' + fmt(data.tri.area.num)) + '；周长 ' +
        m('P = o + a + h = ' + fmt(data.tri.perimeter.num)) + '。');
      var oo = data.tri.o.num, aa = data.tri.a.num, hh = data.tri.h.num;
      steps.push('勾股定理检验：' + m('o^{2} + a^{2} = ' + fmt(oo * oo) + ' + ' + fmt(aa * aa) + ' = ' +
        fmt(oo * oo + aa * aa)) + '，' + m('h^{2} = ' + fmt(hh * hh)) + '，两者在精度范围内相等 ✓');
    }
    steps.forEach(function (s, i) { P((i + 1) + '. ' + s); });
    P('');

    /* ---- 七、图像与缩放 ---- */
    md('## 七、图像与缩放说明');
    P('- 右侧画布里的三角形**始终按真实形状**绘制：三条边的比例、直角标记、角 ' + m('\\theta') +
      ' 的弧线都严格按计算结果。');
    P('- 数值再大也不会撑破画布：程序会**等比缩放**整张图，让三角形始终占据画布约三分之二，' +
      '所以 ' + m('3') + '、' + m('300') + ' 还是 ' + m('3000000') + ' 画出来一样大，只有标注的数字不同。');
    P('- 单位圆画布显示角 ' + m('\\theta') + ' 的终边，以及 ' + m('\\cos\\theta') + '（水平投影）、' +
      m('\\sin\\theta') + '（竖直投影）、' + m('\\tan\\theta') + '（切线上截出的线段）的几何意义。');
    P('');

    /* ---- 八、精度说明 ---- */
    md('## 八、精度说明');
    P('- 精确值来自分数与最简二次根式的**符号运算**，不含任何浮点误差。');
    P('- 近似值按「四舍五入到小数点后 ' + m(String(DIGITS)) + ' 位」给出，只用于直观参考。');
    P('- 页面上的「小数精度」可以调成 ' + m('0') + ' ~ ' + m('10') + ' 位，报告里的近似值会同步变化。');
    if (!exactFlag) {
      P('- 想要精确值？如果已知某个函数值是**有理数**（例如 ' + m('\\sin\\theta = 0.6') + ' 或 ' +
        m('\\tan\\theta = 3/4') + '），切到「我输入函数值」填进去，程序会给出精确的另外两个函数值。');
    }
    P('');

    return {
      ok: true,
      markdown: MD.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n',
      data: data
    };
  }

  return { build: build, version: '1.4.2', clampDigits: clampDigits };
});