/*!
 * quadratic-exact-lab · report.js  (v1.0.0)
 * ------------------------------------------------------------------
 * 把「已知条件 + 定义域」整理成一份完整的 Markdown 解析报告。
 * 纯函数、无副作用；浏览器与 Node.js 通用，因此可以直接单元测试。
 * ------------------------------------------------------------------
 */
(function (global, factory) {
  'use strict';
  var engine = (typeof require === 'function' && typeof module === 'object' && module.exports)
    ? require('./engine.js')
    : (global && global.QuadEngine);
  var api = factory(engine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.QuadReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var Frac = E.Frac, Quad = E.Quad;
  var tex = E.tex, approx = E.approx;

  var FORM_NAME = { general: '一般式', vertex: '顶点式', factored: '交点式', points: '三点' };
  var TWO = new Frac(2n), FOUR = new Frac(4n);

  /* ================= 工具 ================= */

  function parseNum(text, label) {
    var t = (text === null || text === undefined) ? '' : String(text).trim();
    if (t === '') throw new Error('「' + label + '」不能为空');
    try { return E.parseRational(t); }
    catch (err) {
      throw new Error('「' + label + '」无法识别：' + t + '（支持整数、分数如 3/4、小数如 0.75、负数）');
    }
  }

  /* 一般式文本：y = ax² + bx + c */
  function generalTex(q) {
    var parts = [];
    if (!q.a.isZero()) parts.push({ c: q.a, p: 2 });
    if (!q.b.isZero()) parts.push({ c: q.b, p: 1 });
    if (!q.c.isZero()) parts.push({ c: q.c, p: 0 });
    return 'y = ' + tex.poly(parts, 'x');
  }

  /* 内部多项式（不带 y =） */
  function polyTex(terms) { return tex.poly(terms, 'x'); }

  function intervalTex(m, n, hasLeft, hasRight, leftOpen, rightOpen) {
    var lb = (!hasLeft || leftOpen) ? '(' : '[';
    var rb = (!hasRight || rightOpen) ? ')' : ']';
    var lm = hasLeft ? tex.exact(m) : '-\\infty';
    var rm = hasRight ? tex.exact(n) : '+\\infty';
    return lb + lm + ',\\ ' + rm + rb;
  }

  function pointsText(ats) {
    return ats.map(function (x) { return '$x = ' + tex.exact(x) + '$'; }).join(' 或 ');
  }

  /* 把 (x - p) 写成符号安全的形式 */
  function shiftTex(p) {
    var s = Frac.of(p);
    if (s.isZero()) return 'x';
    return s.sign() < 0 ? 'x + ' + tex.exact(s.neg()) : 'x - ' + tex.exact(s);
  }

  /* a(x - h)² + k */
  function vertexFormTex(a, h, k) { return tex.vertexForm(a, h, k, 'x'); }

  /* 形如 a(...) 的系数前缀：1 → ''，-1 → '-'，其余按需加括号 */
  function coefPrefix(a) {
    var c = Frac.of(a);
    if (c.isOne()) return '';
    if (c.n === -1n && c.d === 1n) return '-';
    return tex.exact(c);
  }

  function row(a, b) { return '| ' + a + ' | ' + b + ' |'; }

  function rangeTex(rg) {
    var lb = rg.loKind === 'finite' ? (rg.loOpen ? '(' : '[') : '(';
    var rb = rg.hiKind === 'finite' ? (rg.hiOpen ? ')' : ']') : ')';
    var lo = rg.loKind === 'finite' ? tex.exact(rg.lo) : '-\\infty';
    var hi = rg.hiKind === 'finite' ? tex.exact(rg.hi) : '+\\infty';
    return lb + lo + ',\\ ' + hi + rb;
  }

  /* ================= 主流程 ================= */

  function build(input) {
    try { return buildInner(input || {}); }
    catch (err) { return { ok: false, error: err.message }; }
  }

  function buildInner(input) {
    var form = input.form || 'general';
    if (!FORM_NAME[form]) throw new Error('未知的输入形式：' + form);

    /* ---------- 1. 解析输入 ---------- */
    var q, given, known, givenLine;
    if (form === 'general') {
      var ga = parseNum(input.a, 'a'), gb = parseNum(input.b, 'b'), gc = parseNum(input.c, 'c');
      q = Quad.fromGeneral(ga, gb, gc);
      given = { a: ga, b: gb, c: gc };
      known = 'a = ' + tex.exact(ga) + ',\\quad b = ' + tex.exact(gb) + ',\\quad c = ' + tex.exact(gc);
      givenLine = '已知二次函数的一般式 $y = ax^{2} + bx + c$，其中 $' + known + '$。';
    } else if (form === 'vertex') {
      var va = parseNum(input.a, 'a'), vh = parseNum(input.h, 'h'), vk = parseNum(input.k, 'k');
      q = Quad.fromVertex(va, vh, vk);
      given = { a: va, h: vh, k: vk };
      known = 'a = ' + tex.exact(va) + ',\\quad h = ' + tex.exact(vh) + ',\\quad k = ' + tex.exact(vk);
      givenLine = '已知二次函数的顶点式 $y = a(x - h)^{2} + k$，其中 $' + known + '$。';
    } else if (form === 'points') {
      var raw = [input.p1 || {}, input.p2 || {}, input.p3 || {}];
      var labels = [['x_1', 'y_1'], ['x_2', 'y_2'], ['x_3', 'y_3']];
      var pts = raw.map(function (p, i) {
        return {
          x: parseNum(p.x, '第 ' + (i + 1) + ' 个点的横坐标'),
          y: parseNum(p.y, '第 ' + (i + 1) + ' 个点的纵坐标')
        };
      });
      q = Quad.fromPoints(pts[0], pts[1], pts[2]);
      given = { pts: pts };
      var ptTex = pts.map(function (p, i) {
        return '\\left(' + tex.exact(p.x) + ',\\ ' + tex.exact(p.y) + '\\right)';
      });
      known = ptTex.map(function (t, i) {
        return labels[i][0] + ' = ' + tex.exact(pts[i].x) + ',\\ ' +
               labels[i][1] + ' = ' + tex.exact(pts[i].y);
      }).join(',\\quad ');
      givenLine = '已知图像经过三个点 $' + ptTex[0] + '$、$' + ptTex[1] + '$、$' + ptTex[2] +
        '$（$' + known + '$），求这个二次函数。';
    } else {
      var fa = parseNum(input.a, 'a'), fr1 = parseNum(input.r1, 'x_1'), fr2 = parseNum(input.r2, 'x_2');
      q = Quad.fromFactored(fa, fr1, fr2);
      given = { a: fa, r1: fr1, r2: fr2 };
      known = 'a = ' + tex.exact(fa) + ',\\quad x_1 = ' + tex.exact(fr1) + ',\\quad x_2 = ' + tex.exact(fr2);
      givenLine = '已知二次函数的交点式 $y = a(x - x_1)(x - x_2)$，其中 $' + known + '$。';
    }

    /* ---------- 2. 定义域 ---------- */
    var dom = input.domain || { mode: 'all' };
    var domMode = dom.mode === 'interval' ? 'interval' : 'all';
    var hasLeft = false, hasRight = false, m = null, n = null;
    var leftOpen = true, rightOpen = true;
    if (domMode === 'interval') {
      var L = dom.left || {}, Rr = dom.right || {};
      leftOpen = (L.open === false) ? false : true;
      rightOpen = (Rr.open === false) ? false : true;
      var lv = (L.value === null || L.value === undefined) ? '' : String(L.value).trim();
      var rv = (Rr.value === null || Rr.value === undefined) ? '' : String(Rr.value).trim();
      if (lv !== '') { m = parseNum(lv, '定义域左端点'); hasLeft = true; }
      if (rv !== '') { n = parseNum(rv, '定义域右端点'); hasRight = true; }
      if (!hasLeft && !hasRight) throw new Error('自定义定义域至少要有一个有限端点；若要研究全体实数，请选择「全体实数」');
      if (hasLeft && hasRight && m.cmp(n) > 0) throw new Error('定义域左端点不能大于右端点');
      if (hasLeft && hasRight && m.eq(n) && (leftOpen || rightOpen)) throw new Error('左右端点相同且区间是开的，定义域是空集');
    }
    var domTex = domMode === 'all' ? '\\mathbb{R}' : intervalTex(m, n, hasLeft, hasRight, leftOpen, rightOpen);
    var domLabel = domMode === 'all' ? '全体实数' : '自定义区间';

    /* ---------- 3. 各种量 ---------- */
    var v = Quad.vertex(q);
    var h = v.h, k = v.k;
    var D = Quad.discriminant(q);
    var R = Quad.roots(q);
    var V = Quad.vieta(q);
    var an = E.analyzeDomain(q, m, n, leftOpen, rightOpen);
    var up = an.up;

    var MD = [];
    var P = function (s) { MD.push(s); };
    var md = function (s) { MD.push(s); MD.push(''); };
    /* 表格必须连续书写，行与行之间绝不能有空行 */
    var T = function (header, rows) {
      MD.push('| ' + header.join(' | ') + ' |');
      MD.push('| ' + header.map(function () { return '---'; }).join(' | ') + ' |');
      rows.forEach(function (r) { MD.push('| ' + r.join(' | ') + ' |'); });
      MD.push('');
    };

    /* ======== 标题 ======== */
    md('# 二次函数精确解析报告');
    md('> 本报告中的数值**全部为精确值**：凡不是整数的结果，一律用**分数**或**根号**表示；' +
       '圆括号里的近似小数仅供直观参考。');

    /* ======== 一、已知条件 ======== */
    md('## 一、已知条件');
    T(['项目', '内容'], [
      ['输入形式', FORM_NAME[form]],
      ['已知参数', '$' + known + '$'],
      ['一般式系数', '$a = ' + tex.exact(q.a) + ',\\quad b = ' + tex.exact(q.b) + ',\\quad c = ' + tex.exact(q.c) + '$'],
      ['定义域', '$' + domTex + '$（' + domLabel + '）']
    ]);
    md(givenLine);

    /* ======== 二、形式互化 ======== */
    md('## 二、各种形式的互化');
    md('> **一眼看清三种形式（同一个函数的等价写法）**');
    md('> $$' + generalTex(q) + ' \\quad\\Longleftrightarrow\\quad y = ' + vertexFormTex(q.a, h, k) +
      ' \\quad\\Longleftrightarrow\\quad ' +
      (R.kind === 'none' ? '\\text{无交点式}' : 'y = ' + tex.factoredForm(q.a, R.list[0], R.kind === 'double' ? R.list[0] : R.list[1], 'x')) + '$$');
    md('同一个二次函数可以写成下面几种等价形式，它们之间可以互相转化。');

    /* --- 2.1 三种形式并列 --- */
    md('### 2.1 三种形式对照');
    var aPre = coefPrefix(q.a);
    var generalBody = generalTex(q).replace('y = ', '');
    var vertexBody = vertexFormTex(q.a, h, k);
    var factoredBody = R.kind === 'none' ? null : tex.factoredForm(q.a, R.list[0], R.kind === 'double' ? R.list[0] : R.list[1], 'x');
    var formRows = [
      ['一般式', '$y = ' + generalBody + '$'],
      ['顶点式', '$y = ' + vertexBody + '$']
    ];
    if (R.kind === 'none') {
      formRows.push(['交点式', '不存在（$\\Delta < 0$，图像与 $x$ 轴无交点，无法分解为 $a(x-x_1)(x-x_2)$）']);
    } else if (R.kind === 'double') {
      formRows.push(['交点式', '$y = ' + factoredBody + '$（两根重合，即完全平方式）']);
    } else {
      formRows.push(['交点式', '$y = ' + factoredBody + '$']);
    }
    var stdPoly = polyTex([{ c: new Frac(1n), p: 2 }, { c: q.b.div(q.a), p: 1 }, { c: q.c.div(q.a), p: 0 }]);
    formRows.push(['标准形（提取 $a$）', '$y = ' +
      (aPre === '' ? stdPoly : aPre + '\\left(' + stdPoly + '\\right)') + '$']);
    T(['形式', '表达式'], formRows);

    /* --- 2.2 配方法 --- */
    md('### 2.2 一般式 $\\Longleftrightarrow$ 顶点式（配方法）');
    if (q.b.isZero()) {
      md('因为一次项系数 $b = 0$，一般式 $y = ' + generalBody + '$ **本身就是顶点式**（顶点落在 $y$ 轴上），无需配方。');
    } else {
      md('把二次项系数 $a$ 提出来，再在括号内配成完全平方：');
      md('$$' + generalBody + ' \\;=\\; ' + aPre + '\\left(' +
        polyTex([{ c: new Frac(1n), p: 2 }, { c: q.b.div(q.a), p: 1 }]) + '\\right)' +
        (q.c.isZero() ? '' : (q.c.sign() < 0 ? ' - ' + tex.exact(q.c.neg()) : ' + ' + tex.exact(q.c))) +
        ' \\;=\\; ' + vertexBody + '$$');
      md('- 一次项系数一半的平方：$\\left(\\dfrac{' + tex.exact(q.b.div(q.a)) + '}{2}\\right)^{2} = \\left(' +
        tex.exact(q.b.div(q.a.mul(TWO))) + '\\right)^{2} = ' +
        tex.exact(q.b.div(q.a.mul(TWO)).mul(q.b.div(q.a.mul(TWO)))) + '$');
    }
    md('- 顶点横坐标 $h = -\\dfrac{b}{2a} = ' + tex.exact(h) + '$，纵坐标 $k = ' + tex.exact(k) + '$。');
    md('- 反过来（顶点式 $\\to$ 一般式）就是展开 $a(x-h)^{2}+k$，两者是同一个式子。');

    /* --- 2.3 交点式 --- */
    md('### 2.3 一般式 $\\Longleftrightarrow$ 交点式（因式分解）');
    if (R.kind === 'none') {
      md('- 因为 $\\Delta = ' + tex.exact(D) + ' < 0$，**没有实数零点**，所以这个函数**不存在交点式**。');
    } else if (R.kind === 'double') {
      md('- 两根相等 $x_1 = x_2 = ' + tex.exact(R.list[0]) + '$，交点式退化为完全平方式：');
      md('$$y = ' + factoredBody + '$$');
    } else {
      md('- 先用求根公式求出两个零点 $x_1 = ' + tex.exact(R.list[0]) + '$、$x_2 = ' + tex.exact(R.list[1]) + '$，再写成：');
      md('$$y = ' + factoredBody + '$$');
    }

    /* --- 2.4 a 的作用 --- */
    md('### 2.4 三种形式的共同点：$a$ 始终不变');
    md('$a = ' + tex.exact(q.a) + '$ 在三种形式中是同一个数，它决定**开口方向**（$' + (up ? 'a > 0$ 向上' : 'a < 0$ 向下') +
      '）和**开口大小**（$|a|$ 越大开口越窄）。');
    if (form === 'points') {
      md('### 2.5 三点确定函数的求解过程');
      md('把三个点分别代入 $y = ax^{2} + bx + c$，得到关于 $a$、$b$、$c$ 的三元一次方程组：');
      md('$$\\begin{cases}' + given.pts.map(function (p) {
        return 'a\\left(' + tex.exact(p.x) + '\\right)^{2} + b\\left(' + tex.exact(p.x) + '\\right) + c = ' + tex.exact(p.y);
      }).join('\\\\[4pt]') + '\\end{cases}$$');
      var detA = Quad.det3(given.pts.map(function (p) { return p.y; }),
        given.pts.map(function (p) { return p.x; }),
        [new Frac(1n), new Frac(1n), new Frac(1n)]);
      var detB = Quad.det3(given.pts.map(function (p) { return p.x.mul(p.x); }),
        given.pts.map(function (p) { return p.y; }),
        [new Frac(1n), new Frac(1n), new Frac(1n)]);
      var detC = Quad.det3(given.pts.map(function (p) { return p.x.mul(p.x); }),
        given.pts.map(function (p) { return p.x; }),
        given.pts.map(function (p) { return p.y; }));
      var detD = Quad.det3(given.pts.map(function (p) { return p.x.mul(p.x); }),
        given.pts.map(function (p) { return p.x; }),
        [new Frac(1n), new Frac(1n), new Frac(1n)]);
      md('用**克莱姆法则**直接解出（系数行列式 $D = ' + tex.exact(detD) + ' \\ne 0$）：');
      md('$$a = \\dfrac{D_a}{D} = ' + tex.exact(q.a) + ',\\qquad b = \\dfrac{D_b}{D} = ' + tex.exact(q.b) +
        ',\\qquad c = \\dfrac{D_c}{D} = ' + tex.exact(q.c) + '$$');
      md('其中 $D_a = ' + tex.exact(detA) + '$，$D_b = ' + tex.exact(detB) + '$，$D_c = ' + tex.exact(detC) + '$。');
    }

    /* ======== 三、顶点与对称轴 ======== */
    md('## 三、顶点与对称轴');
    md('- **顶点坐标**：$\\left(' + tex.exact(h) + ',\\ ' + tex.exact(k) + '\\right)$' +
       '（近似：$\\left(' + approx(h) + ',\\ ' + approx(k) + '\\right)$）');
    md('- **对称轴**：直线 $x = ' + tex.exact(h) + '$');
    md('- **开口方向**：$a = ' + tex.exact(q.a) + ' ' + (up ? '>' : '<') + ' 0$，图像开口向' + (up ? '上' : '下') + '。');
    md('- **顶点是最值点**：' + (up ? '最小值' : '最大值') + ' $y = ' + tex.exact(k) + '$（在 $x = ' + tex.exact(h) + '$ 处取得）。');
    md('**配方推导**');
    md('$$y = ' + generalTex(q).replace('y = ', '') + ' = ' +
      (q.a.isOne() ? '' : tex.exactParen(q.a)) + '\\left(' + shiftTex(h) + '\\right)^{2} ' +
      (k.isZero() ? '' : (k.sign() < 0 ? '- ' : '+ ') + tex.exact(k.abs())) + '$$');
    md('因此顶点为 $\\left(' + tex.exact(h) + ',\\ ' + tex.exact(k) + '\\right)$，对称轴为 $x = ' + tex.exact(h) + '$。' +
       '图像关于这条直线**左右对称**：点 $\\left(' + tex.exact(h.sub(new Frac(1n))) + ',\\ ' + tex.exact(Quad.evalAt(q, h.sub(new Frac(1n)))) + '\\right)$ 与点 $\\left(' + tex.exact(h.add(new Frac(1n))) + ',\\ ' + tex.exact(Quad.evalAt(q, h.add(new Frac(1n)))) + '\\right)$ 就是一对对称点。');

    /* ======== 四、判别式与零点 ======== */
    md('## 四、判别式与零点');
    var fourAC = q.a.mul(q.c).mul(FOUR);
    md('- 判别式：$\\Delta = b^{2} - 4ac = ' + tex.exactParen(q.b) + '^{2} - 4 \\times ' + tex.exactParen(q.a) +
       ' \\times ' + tex.exactParen(q.c) + ' = ' + tex.exact(q.b.mul(q.b)) +
       (fourAC.sign() < 0 ? ' + ' + tex.exact(fourAC.neg()) : ' - ' + tex.exact(fourAC)) +
       ' = ' + tex.exact(D) + '$');
    if (D.sign() > 0) {
      md('- 根号化简（化为最简根式）：$' + tex.sqrtChain(D) + '$');
    }
    if (R.kind === 'two') {
      md('- $\\Delta = ' + tex.exact(D) + ' > 0$：图像与 $x$ 轴有**两个不同交点**，方程有两个不相等的实根。');
      md('- 求根公式：$x = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a} = \\dfrac{' + tex.exact(q.b.neg()) +
         ' \\pm ' + tex.sqrtSimplest(D) + '}{' + tex.exact(q.a.mul(TWO)) + '}$');
      md('- **零点（精确值）**：$x_1 = ' + tex.exact(R.list[0]) + '$，$x_2 = ' + tex.exact(R.list[1]) + '$' +
         '（近似：$' + approx(R.list[0]) + '$、$' + approx(R.list[1]) + '$）');
      md('- 交点式：$' + tex.factoredForm(q.a, R.list[0], R.list[1], 'x') + '$');
    } else if (R.kind === 'double') {
      md('- $\\Delta = 0$：图像与 $x$ 轴**相切**，方程有两个相等的实根（二重根）。');
      md('- **零点（精确值）**：$x_1 = x_2 = ' + tex.exact(R.list[0]) + '$，切点为 $\\left(' + tex.exact(R.list[0]) + ',\\ 0\\right)$。');
      md('- 交点式（完全平方式）：$' + tex.factoredForm(q.a, R.list[0], R.list[0], 'x') + '$');
    } else {
      md('- $\\Delta = ' + tex.exact(D) + ' < 0$：图像与 $x$ 轴**没有交点**，方程在实数范围内无解。');
      md('- 若允许复数，一对共轭复根为 $x = ' + tex.exact(R.real) + ' \\pm ' + tex.exact(R.imag) + '\\,i$（仅供参考）。');
      md('- 结论：该函数**没有实数零点**，所以不存在交点式。');
    }
    md('**根与系数的关系（韦达定理）**');
    md('- $x_1 + x_2 = -\\dfrac{b}{a} = ' + tex.exact(V.sum) + '$');
    md('- $x_1 x_2 = \\dfrac{c}{a} = ' + tex.exact(V.product) + '$');

    /* ======== 五、定义域与最值 ======== */
    md('## 五、定义域与最值');
    md('**定义域**：$' + domTex + '$');
    md('**最值结论**');
    md('- ' + extremeLine(an.min, 'min', '小'));
    md('- ' + extremeLine(an.max, 'max', '大'));
    md('**分类讨论**');
    md(branchExplain(an, q, h, k, hasLeft, hasRight, m, n, leftOpen, rightOpen, domTex));
    md('**值域**：$' + rangeTex(an.range) + '$');
    if (an.min.exists && !an.min.attained) {
      md('> 注意：值域左端的 $' + tex.exact(an.min.value) + '$ 在定义域内**取不到**，所以值域左端用圆括号。');
    }
    if (an.max.exists && !an.max.attained) {
      md('> 注意：值域右端的 $' + tex.exact(an.max.value) + '$ 在定义域内**取不到**，所以值域右端用圆括号。');
    }

    /* ======== 六、单调性 ======== */
    md('## 六、单调性');
    md('- 对称轴 $x = ' + tex.exact(h) + '$ 是单调性的分界点。');
    if (up) {
      md('- 在 $\\left(-\\infty,\\ ' + tex.exact(h) + '\\right]$ 上**单调递减**，在 $\\left[' + tex.exact(h) + ',\\ +\\infty\\right)$ 上**单调递增**。');
    } else {
      md('- 在 $\\left(-\\infty,\\ ' + tex.exact(h) + '\\right]$ 上**单调递增**，在 $\\left[' + tex.exact(h) + ',\\ +\\infty\\right)$ 上**单调递减**。');
    }
    if (domMode === 'interval') md('- 在给定定义域 $' + domTex + '$ 上：' + monotoneOnDomain(an, up));

    /* ======== 七、图像特征 ======== */
    md('## 七、图像特征');
    var featRows = [
      ['开口方向', '向' + (up ? '上' : '下') + '（$a = ' + tex.exact(q.a) + ' ' + (up ? '>' : '<') + ' 0$）'],
      ['顶点', '$\\left(' + tex.exact(h) + ',\\ ' + tex.exact(k) + '\\right)$'],
      ['对称轴', '$x = ' + tex.exact(h) + '$'],
      ['与 $y$ 轴交点', q.c.isZero() ? '$(0,\\ 0)$（图像过原点）' : '$\\left(0,\\ ' + tex.exact(q.c) + '\\right)$']
    ];
    featRows.push(['与 $x$ 轴交点', (function () {
      if (R.kind === 'two') return '$\\left(' + tex.exact(R.list[0]) + ',\\ 0\\right)$、$\\left(' + tex.exact(R.list[1]) + ',\\ 0\\right)$';
      if (R.kind === 'double') return '$\\left(' + tex.exact(R.list[0]) + ',\\ 0\\right)$（相切，二重零点）';
      return '无交点（$\\Delta < 0$）';
    })()]);
    featRows.push(['无限制最值', (up ? '最小值' : '最大值') + ' $' + tex.exact(k) + '$（$x = ' + tex.exact(h) + '$）']);
    featRows.push(['对称点举例', '$\\left(' + tex.exact(h.sub(new Frac(1n))) + ',\\ ' + tex.exact(Quad.evalAt(q, h.sub(new Frac(1n)))) + '\\right)$ 与 ' +
      '$\\left(' + tex.exact(h.add(new Frac(1n))) + ',\\ ' + tex.exact(Quad.evalAt(q, h.add(new Frac(1n)))) + '\\right)$']);
    T(['特征', '结论'], featRows);

    /* ======== 八、精确值对照 ======== */
    md('## 八、精确值与近似值对照');
    var valRows = [
      ['$a$', '$' + tex.exact(q.a) + '$', approx(q.a)],
      ['$b$', '$' + tex.exact(q.b) + '$', approx(q.b)],
      ['$c$', '$' + tex.exact(q.c) + '$', approx(q.c)],
      ['$h$（顶点横坐标）', '$' + tex.exact(h) + '$', approx(h)],
      ['$k$（顶点纵坐标）', '$' + tex.exact(k) + '$', approx(k)],
      ['$\\Delta$（判别式）', '$' + tex.exact(D) + '$', approx(D)]
    ];
    if (R.kind === 'two') {
      valRows.push(['$x_1$', '$' + tex.exact(R.list[0]) + '$', approx(R.list[0])]);
      valRows.push(['$x_2$', '$' + tex.exact(R.list[1]) + '$', approx(R.list[1])]);
    } else if (R.kind === 'double') {
      valRows.push(['$x_{1,2}$（二重根）', '$' + tex.exact(R.list[0]) + '$', approx(R.list[0])]);
    } else {
      valRows.push(['实数零点', '不存在', '—']);
    }
    if (an.min.exists) valRows.push(['最小值 $y_{\\min}$', '$' + tex.exact(an.min.value) + '$', approx(an.min.value)]);
    if (an.max.exists) valRows.push(['最大值 $y_{\\max}$', '$' + tex.exact(an.max.value) + '$', approx(an.max.value)]);
    T(['量', '精确值', '近似值'], valRows);

    /* ======== 九、求解步骤 ======== */
    md('## 九、求解步骤');
    steps(form, q, given, h, k, D, R, an, domMode, domTex, m, n, hasLeft, hasRight, leftOpen, rightOpen)
      .forEach(function (s, i) { md((i + 1) + '. ' + s); });

    /* ======== 十、检验 ======== */
    md('## 十、结果检验');
    var fh = Quad.evalAt(q, h);
    md('- 顶点纵坐标：$f\\left(' + tex.exact(h) + '\\right) = ' + tex.exact(fh) + '$，与 $k = ' + tex.exact(k) + '$ ' + (fh.eq(k) ? '**一致** ✓' : '**不一致** ✗'));
    md('- 判别式：$b^{2} - 4ac = ' + tex.exact(q.b.mul(q.b)) +
      (q.a.mul(q.c).mul(FOUR).sign() < 0 ? ' + ' + tex.exact(q.a.mul(q.c).mul(FOUR).neg()) : ' - ' + tex.exact(q.a.mul(q.c).mul(FOUR))) +
      ' = ' + tex.exact(D) + '$ ✓');
    if (R.kind === 'two') {
      md('- 零点代回原式：$f\\left(x_1\\right) = ' + tex.exact(Quad.evalAtSurd(q, R.list[0])) + '$，$f\\left(x_2\\right) = ' +
        tex.exact(Quad.evalAtSurd(q, R.list[1])) + '$，均为 $0$ ✓');
    } else if (R.kind === 'double') {
      md('- 零点代回原式：$f\\left(x_{1,2}\\right) = ' + tex.exact(Quad.evalAtSurd(q, R.list[0])) + ' = 0$ ✓');
    } else {
      md('- 零点：$\\Delta < 0$，无实根，无需代入检验。');
    }
    md('- 对称轴：$x = -\\dfrac{b}{2a} = ' + tex.exact(h) + '$ ✓');
    md('---');
    md('*报告由 quadratic-exact-lab 自动生成 · 全部计算基于有理数与二次根式的精确运算，不含浮点误差。*');

    /* ---------- 供绘图使用的数据 ---------- */
    var data = {
      form: form,
      a: q.a.toNumber(), b: q.b.toNumber(), c: q.c.toNumber(),
      h: h.toNumber(), k: k.toNumber(), D: D.toNumber(),
      roots: R.list.map(function (r) { return r.toNumber(); }),
      rootKind: R.kind,
      up: up,
      domain: {
        mode: domMode, hasLeft: hasLeft, hasRight: hasRight,
        m: hasLeft ? m.toNumber() : null, n: hasRight ? n.toNumber() : null,
        leftOpen: leftOpen, rightOpen: rightOpen
      },
      extrema: {
        min: an.min.exists ? { value: an.min.value.toNumber(), at: an.min.at.toNumber(), attained: an.min.attained, where: an.min.where } : null,
        max: an.max.exists ? { value: an.max.value.toNumber(), at: an.max.at.toNumber(), attained: an.max.attained, where: an.max.where } : null
      },
      exact: {
        a: tex.exact(q.a), b: tex.exact(q.b), c: tex.exact(q.c),
        h: tex.exact(h), k: tex.exact(k), D: tex.exact(D)
      }
    };

    /* 三点输入时，把已知点交给绘图模块标注 */
    var givenPoints = null;
    if (form === 'points') {
      givenPoints = given.pts.map(function (p) { return { x: p.x.toNumber(), y: p.y.toNumber() }; });
    }
    return { ok: true, markdown: MD.join('\n'), data: data, givenPoints: givenPoints };
  }

  /* ================= 分节文本 ================= */

  function extremeLine(ex, tag, sideName) {
    if (!ex.exists) {
      return '**无最' + sideName + '值**：定义域向' + sideName + '侧无界，函数值可以无限' +
        (sideName === '小' ? '减小' : '增大') + '，不存在最' + sideName + '值。';
    }
    var sym = tag === 'min' ? 'y_{\\min}' : 'y_{\\max}';
    if (ex.attained) {
      return '**最' + sideName + '值** $' + sym + ' = ' + tex.exact(ex.value) + '$，当 ' + pointsText(ex.ats) + ' 时取得。';
    }
    return '**最' + sideName + '值不存在**：$' + sym + '$ 的下确界为 $' + tex.exact(ex.value) +
      '$，但该点位于**开区间端点**，函数只能无限逼近而取不到。';
  }

  function branchExplain(an, q, h, k, hasLeft, hasRight, m, n, leftOpen, rightOpen, domTex) {
    var up = an.up, out = [];
    if (an.branch === 'vertex-inside') {
      out.push('- 对称轴 $x = ' + tex.exact(h) + '$ **落在定义域 $' + domTex + '$ 内**，' +
        '因此顶点处取得' + (up ? '最小' : '最大') + '值 $' + tex.exact(k) + '$。');
      if (hasLeft && hasRight) {
        out.push('- 定义域两端都有界，另一端的最值只需比较 $f\\left(' + tex.exact(m) + '\\right)$ 与 ' +
          '$f\\left(' + tex.exact(n) + '\\right)$：较大者给出最大值，较小者给出最小值。');
      } else {
        out.push('- 定义域有一侧延伸到无穷，函数在该侧可以无限' + (up ? '增大' : '减小') + '，' +
          '所以**不存在最' + (up ? '大' : '小') + '值**。');
      }
    } else if (an.branch === 'right-of-axis') {
      out.push('- 对称轴 $x = ' + tex.exact(h) + '$ 位于定义域**左侧之外**，定义域整体落在对称轴右侧，' +
        '函数在 $' + domTex + '$ 上**单调' + (up ? '递增' : '递减') + '**。');
      out.push('- 于是左端点 ' + pointsText([m]) + ' 处取得最' + (up ? '小' : '大') + '值 $' +
        tex.exact(an.min.exists ? an.min.value : an.max.value) + '$' +
        (leftOpen ? '；但该端点是**开**的，严格说这个值取不到，只能作为下（上）确界。' : '。'));
      out.push('- 右端' + (hasRight ? '有界，最大值（最小值）在右端点取得。' : '无界，因此**没有最' + (up ? '大' : '小') + '值**。'));
    } else {
      out.push('- 对称轴 $x = ' + tex.exact(h) + '$ 位于定义域**右侧之外**，定义域整体落在对称轴左侧，' +
        '函数在 $' + domTex + '$ 上**单调' + (up ? '递减' : '递增') + '**。');
      out.push('- 于是右端点 ' + pointsText([n]) + ' 处取得最' + (up ? '小' : '大') + '值 $' +
        tex.exact(an.min.exists ? an.min.value : an.max.value) + '$' +
        (rightOpen ? '；但该端点是**开**的，严格说这个值取不到，只能作为下（上）确界。' : '。'));
      out.push('- 左端' + (hasLeft ? '有界，最大值（最小值）在左端点取得。' : '无界，因此**没有最' + (up ? '大' : '小') + '值**。'));
    }
    return out.join('\n');
  }

  function monotoneOnDomain(an, up) {
    if (an.branch === 'vertex-inside') {
      return '顶点在区间内部，函数先' + (up ? '减' : '增') + '后' + (up ? '增' : '减') +
        '，所以最值出现在顶点或区间端点处。';
    }
    if (an.branch === 'right-of-axis') return '整个定义域落在对称轴右侧，函数在定义域上**单调' + (up ? '递增' : '递减') + '**。';
    return '整个定义域落在对称轴左侧，函数在定义域上**单调' + (up ? '递减' : '递增') + '**。';
  }

  /* ================= 步骤详解 ================= */

  function steps(form, q, given, h, k, D, R, an, domMode, domTex, m, n, hasLeft, hasRight, leftOpen, rightOpen) {
    var s = [];

    if (form === 'points') {
      s.push('**设一般式并列方程组**：设 $y = ax^{2} + bx + c$，把三个点分别代入，得到三元一次方程组。');
      s.push('**用克莱姆法则求解**：系数行列式 $D = ' + tex.exact(Quad.det3(
        given.pts.map(function (p) { return p.x.mul(p.x); }),
        given.pts.map(function (p) { return p.x; }),
        [new Frac(1n), new Frac(1n), new Frac(1n)])) +
        ' \\ne 0$，由 $a = D_a/D$、$b = D_b/D$、$c = D_c/D$ 解出 $a = ' + tex.exact(q.a) +
        '$，$b = ' + tex.exact(q.b) + '$，$c = ' + tex.exact(q.c) + '$。');
      s.push('**写出函数式**：$' + generalTex(q) + '$。');
    } else if (form === 'vertex') {
      s.push('**展开顶点式**：由平方公式 $(x - h)^{2} = x^{2} - 2hx + h^{2}$，' +
        '$(x ' + (given.h.isZero() ? '' : (given.h.sign() < 0 ? '+ ' : '- ') + tex.exact(given.h.abs())) + ')^{2} = ' +
        polyTex([{ c: new Frac(1n), p: 2 }, { c: given.h.mul(new Frac(-2n)), p: 1 }, { c: given.h.mul(given.h), p: 0 }]) + '$，' +
        '再乘以 $a = ' + tex.exact(q.a) + '$ 并加上 $k = ' + tex.exact(given.k) + '$，得 $' + generalTex(q) + '$。');
    } else if (form === 'factored') {
      var S = given.r1.add(given.r2), P = given.r1.mul(given.r2);
      s.push('**展开交点式**：$(x - x_1)(x - x_2) = x^{2} - (x_1 + x_2)x + x_1x_2$，其中 ' +
        '$x_1 + x_2 = ' + tex.exact(given.r1) + ' + ' + tex.exactParen(given.r2) + ' = ' + tex.exact(S) + '$，' +
        '$x_1x_2 = ' + tex.exact(given.r1) + ' \\times ' + tex.exactParen(given.r2) + ' = ' + tex.exact(P) + '$，' +
        '故 $y = ' + tex.exactParen(q.a) + '\\left(' + polyTex([{ c: new Frac(1n), p: 2 }, { c: S.neg(), p: 1 }, { c: P, p: 0 }]) + '\\right) = ' + generalTex(q) + '$。');
    } else {
      s.push('**提取二次项系数**：$y = ' + tex.exactParen(q.a) + '\\left(' +
        polyTex([{ c: new Frac(1n), p: 2 }, { c: q.b.div(q.a), p: 1 }]) + '\\right) ' +
        (q.c.isZero() ? '' : (q.c.sign() < 0 ? '- ' + tex.exact(q.c.neg()) : '+ ' + tex.exact(q.c))) + '$。');
    }

    s.push('**配方法求顶点**：$y = ' + (q.a.isOne() ? '' : tex.exactParen(q.a)) + '\\left(' + shiftTex(h) + '\\right)^{2} ' +
      (k.isZero() ? '' : (k.sign() < 0 ? '- ' : '+ ') + tex.exact(k.abs())) + '$，' +
      '所以顶点为 $\\left(' + tex.exact(h) + ',\\ ' + tex.exact(k) + '\\right)$，对称轴为 $x = ' + tex.exact(h) + '$。');

    s.push('**计算判别式**：$\\Delta = b^{2} - 4ac = ' + tex.exact(D) + '$，' +
      (D.sign() > 0 ? '大于 $0$，方程有两个不相等的实根。'
        : (D.isZero() ? '等于 $0$，方程有两个相等的实根（二重根）。' : '小于 $0$，方程没有实根。')));

    if (R.kind === 'two' || R.kind === 'double') {
      s.push('**把 $\\sqrt{\\Delta}$ 化为最简根式**：$' + tex.sqrtChain(D) + '$。');
      s.push('**代入求根公式**：$x = \\dfrac{-b \\pm \\sqrt{\\Delta}}{2a} = \\dfrac{' + tex.exact(q.b.neg()) +
        ' \\pm ' + tex.sqrtSimplest(D) + '}{' + tex.exact(q.a.mul(TWO)) + '}$，得 ' +
        R.list.map(function (r) { return '$x = ' + tex.exact(r) + '$'; }).join('，') + '。');
      if (R.kind === 'double') {
        s.push('**写出交点式**：两根重合，交点式退化为完全平方式 $' + tex.factoredForm(q.a, R.list[0], R.list[0], 'x') + '$。');
      } else {
        s.push('**写出交点式**：$' + tex.factoredForm(q.a, R.list[0], R.list[1], 'x') + '$。');
      }
    } else {
      s.push('**判断零点**：因 $\\Delta = ' + tex.exact(D) + ' < 0$，方程 $' +
        generalTex(q).replace('y = ', '') + ' = 0$ 没有实数解，图像与 $x$ 轴不相交。');
    }

    if (domMode === 'all') {
      s.push('**确定值域**：定义域为 $\\mathbb{R}$，顶点处取得' + (an.up ? '最小' : '最大') + '值 $' + tex.exact(k) + '$，' +
        '故值域为 $' + rangeTex(an.range) + '$。');
    } else {
      s.push('**比较对称轴与定义域的位置**：对称轴 $x = ' + tex.exact(h) + '$ ' +
        (an.domain.vertexInside ? '**落在**' : '**不落在**') + '定义域 $' + domTex + '$ 内。');
      var detail;
      if (an.branch === 'vertex-inside') {
        detail = '顶点值 $' + tex.exact(k) + '$ 是最值候选之一；另一端的最值由两个端点函数值比较得到：' +
          (hasLeft ? '$f\\left(' + tex.exact(m) + '\\right) = ' + tex.exact(Quad.evalAt(q, m)) + '$' : '左端无界') +
          (hasLeft && hasRight ? '，' : '') +
          (hasRight ? '$f\\left(' + tex.exact(n) + '\\right) = ' + tex.exact(Quad.evalAt(q, n)) + '$' : '右端无界') + '。';
      } else {
        detail = '定义域整体位于对称轴的一侧，函数在定义域上单调，最值都在端点处取得。';
      }
      s.push('**分类讨论求最值**：' + detail);
      var parts = [];
      if (an.min.exists) parts.push('最小值 $' + tex.exact(an.min.value) + '$' + (an.min.attained ? '' : '（取不到，只是下确界）'));
      if (an.max.exists) parts.push('最大值 $' + tex.exact(an.max.value) + '$' + (an.max.attained ? '' : '（取不到，只是上确界）'));
      s.push('**写出结论**：' + (parts.length ? parts.join('，') : '没有最值') + '，值域为 $' + rangeTex(an.range) + '$。');
    }
    return s;
  }

  return { build: build, version: '1.0.0' };
});
