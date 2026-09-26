/*!
 * quadratic-exact-lab · trig-ui.js  (v1.3.0)
 * ------------------------------------------------------------------
 * 三角函数工作区的界面逻辑：
 *   · 输入：sin / cos / tan + 角度 或 用户自填的函数值 + 已知的一条边 + 小数精度
 *   · 输出：Markdown 报告 + 直角三角形画布 + 单位圆画布
 * 依赖 trig.js / trig-report.js / markdown.js / vendor/katex。
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  var Report = window.TrigReport;
  var T = window.Trig;
  var mdRenderer = window.Markdown.createRenderer(window.katex);

  var FN_TEX = { sin: '\\sin', cos: '\\cos', tan: '\\tan' };
  var FN_NAME = { sin: '正弦 sin', cos: '余弦 cos', tan: '正切 tan' };
  var SIDE_NAME = { opposite: '对边 o（BC）', adjacent: '邻边 a（AC）', hypotenuse: '斜边 h（AB）' };
  var SIDE_LETTER = { opposite: 'o', adjacent: 'a', hypotenuse: 'h' };
  var SIDE_EDGE = { opposite: 'BC', adjacent: 'AC', hypotenuse: 'AB' };

  var EXAMPLES = [
    { name: '① 30° 的对边 3 → 3-3√3-6 的直角三角形', state: { fn: 'sin', valueSource: 'auto', angle: '30', sideKind: 'opposite', side: '3', digits: 4 } },
    { name: '② 45° 的斜边 5 → 等腰直角三角形', state: { fn: 'cos', valueSource: 'auto', angle: '45', sideKind: 'hypotenuse', side: '5', digits: 4 } },
    { name: '③ 60° 的邻边 2 → 含 √3 的三边', state: { fn: 'tan', valueSource: 'auto', angle: '60', sideKind: 'adjacent', side: '2', digits: 4 } },
    { name: '④ 37° 的斜边 5 → 非特殊角，按精度取近似', state: { fn: 'sin', valueSource: 'auto', angle: '37', sideKind: 'hypotenuse', side: '5', digits: 4 } },
    { name: '⑤ 已知 sinθ = 0.6（即 3/5）→ 精确反推 4/5 与 3/4', state: { fn: 'sin', valueSource: 'user', angle: '', value: '0.6', sideKind: 'hypotenuse', side: '10', digits: 4 } },
    { name: '⑥ 已知 tanθ = 3/4 → 精确反推 3/5 与 4/5', state: { fn: 'tan', valueSource: 'user', angle: '', value: '3/4', sideKind: 'opposite', side: '6', digits: 4 } },
    { name: '⑦ 已知 cosθ = √2/2（填 0.7071067812）→ 按精度反推', state: { fn: 'cos', valueSource: 'user', angle: '', value: '0.7071067812', sideKind: 'adjacent', side: '1', digits: 6 } },
    { name: '⑧ 120° → 特殊角但超出直角三角形范围', state: { fn: 'cos', valueSource: 'auto', angle: '120', sideKind: 'opposite', side: '3', digits: 4 } },
    { name: '⑨ 超大数值 → 等比缩放到同样大小', state: { fn: 'sin', valueSource: 'auto', angle: '30', sideKind: 'hypotenuse', side: '3000000', digits: 4 } },
    { name: '⑩ 极小数 → 同样按比例画满画布', state: { fn: 'tan', valueSource: 'auto', angle: '45', sideKind: 'opposite', side: '0.0007', digits: 8 } }
  ];

  var state = {
    fn: 'sin',
    valueSource: 'auto',
    angle: '30',
    value: '',
    sideKind: 'opposite',
    side: '3',
    digits: 4,
    view: 'rendered',
    report: null
  };

  var el = {};
  var debounceTimer = null;
  var ready = false;

  /* ================= 小工具 ================= */

  function $(id) { return document.getElementById(id); }

  function katexInline(tex, target) {
    try { target.innerHTML = window.katex.renderToString(tex, { throwOnError: false, strict: false }); }
    catch (e) { target.textContent = tex; }
  }

  function toast(msg) {
    if (window.QuadLab && window.QuadLab.toast) { window.QuadLab.toast(msg); return; }
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(el.toast._t);
    el.toast._t = setTimeout(function () { el.toast.classList.remove('on'); }, 1900);
  }

  function fmt(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    var s = v.toFixed(state.digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  function short(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e6 || (a > 0 && a < 1e-4)) return v.toExponential(2).replace('e+', 'e');
    return fmt(v);
  }

  function colors() {
    var cs = getComputedStyle(document.documentElement);
    var g = function (n, d) { var v = cs.getPropertyValue(n); return (v && v.trim()) || d; };
    return {
      grid: g('--line', '#e3ded6'),
      gridStrong: g('--line-strong', '#d3ccc1'),
      ink: g('--ink', '#23272e'),
      inkSoft: g('--ink-soft', '#5c6572'),
      inkFaint: g('--ink-faint', '#8b939e'),
      accent: g('--accent', '#2b6cb0'),
      warm: g('--warm', '#b45309'),
      green: g('--green', '#15803d'),
      red: g('--red', '#b91c1c'),
      card: g('--card', '#ffffff')
    };
  }

  function fontFamily() { return getComputedStyle(document.body).fontFamily; }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 画布上的标签（带底色，避免压住线条看不清） */
  function label(ctx, text, x, y, C, opts) {
    opts = opts || {};
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.save();
    ctx.font = (opts.font || '12px ') + fontFamily();
    var w = ctx.measureText(text).width;
    var padX = 5;
    var bx = x - w / 2 - padX, by = y - 10;
    bx = Math.max(2, Math.min((opts.W || 1e9) - w - padX * 2 - 2, bx));
    by = Math.max(2, Math.min((opts.H || 1e9) - 22, by));
    ctx.fillStyle = dark ? 'rgba(27,32,39,0.88)' : 'rgba(255,255,255,0.88)';
    roundRect(ctx, bx, by, w + padX * 2, 20, 6);
    ctx.fill();
    ctx.strokeStyle = opts.border || C.grid;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = opts.color || C.inkSoft;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + padX, by + 10);
    ctx.restore();
  }

  /* 等比缩放的坐标变换：把世界坐标 (x, y) 映射到画布，并保证图形大小固定 */
  function makeFit(W, H, pad) {
    return function (worldW, worldH) {
      var sx = (W - pad * 2) / Math.max(worldW, 1e-12);
      var sy = (H - pad * 2) / Math.max(worldH, 1e-12);
      var s = Math.min(sx, sy);
      return {
        s: s,
        tx: (W - worldW * s) / 2,
        ty: (H - worldH * s) / 2,
        X: function (x) { return this.tx + x * s; },
        Y: function (y) { return this.ty + (worldH - y) * s; }
      };
    };
  }

  /* ================= 直角三角形画布 ================= */

  var TriPlot = {
    canvas: null, ctx: null, W: 0, H: 0, dpr: 1, data: null,

    init: function (canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      var self = this;
      window.addEventListener('resize', function () { self.resize(); });
      canvas.addEventListener('dblclick', function () { self.draw(); });
    },

    resize: function () {
      if (!this.canvas) return;
      var rect = this.canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      this.dpr = window.devicePixelRatio || 1;
      this.W = rect.width;
      this.H = rect.height;
      this.canvas.width = Math.round(rect.width * this.dpr);
      this.canvas.height = Math.round(rect.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.draw();
    },

    setData: function (data) { this.data = data; this.resize(); this.draw(); },

    draw: function () {
      var ctx = this.ctx;
      if (!ctx || !this.W) return;
      var C = colors(), W = this.W, H = this.H;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.card;
      ctx.fillRect(0, 0, W, H);

      var d = this.data;
      var tri = d && d.tri;

      if (!tri) {
        ctx.fillStyle = C.inkFaint;
        ctx.font = '13px ' + fontFamily();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var msg = (d && d.triError) ? String(d.triError).replace(/\$/g, '').replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '') : '等待输入';
        wrapText(ctx, msg, W / 2, H / 2, W - 40, 22);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        return;
      }

      /* 世界坐标：C 在原点（直角），A 在 x 轴 (a, 0)，B 在 y 轴 (0, o) */
      var a = tri.a.num, o = tri.o.num, h = tri.h.num;
      if (!(a > 0) || !(o > 0)) { return; }

      var pad = 56;
      var fit = makeFit(W, H, pad)(a, o);
      var P = function (x, y) { return { x: fit.X(x), y: fit.Y(y) }; };

      var A = P(0, 0), B = P(a, 0), Cc = P(0, o);

      /* --- 直角标记 --- */
      var sq = Math.min(14, Math.max(7, Math.min(a, o) * fit.s * 0.18));
      ctx.save();
      ctx.strokeStyle = C.inkFaint;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(Cc.x + sq, Cc.y);
      ctx.lineTo(Cc.x + sq, Cc.y - sq);
      ctx.lineTo(Cc.x, Cc.y - sq);
      ctx.stroke();
      ctx.restore();

      /* --- 三角形本体 --- */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(Cc.x, Cc.y); ctx.closePath();
      ctx.fillStyle = hexA(C.accent, 0.12);
      ctx.fill();
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();

      /* --- 角 θ 的弧线 --- */
      var thetaDeg = tri.thetaNum;
      if (thetaDeg > 0 && thetaDeg < 90) {
        var r = Math.max(20, Math.min(38, Math.min(a, o) * fit.s * 0.34));
        ctx.save();
        ctx.strokeStyle = C.warm;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        /* 世界坐标里 A→B 方向是 (1,0)，A→C 方向是 (0,1)，屏幕上 y 反向 */
        ctx.arc(A.x, A.y, r, -thetaDeg * Math.PI / 180, 0);
        ctx.stroke();
        ctx.restore();
        label(ctx, 'θ = ' + fmt(thetaDeg) + '°', A.x + r * Math.cos(-thetaDeg * Math.PI / 360) + 26,
          A.y - r * Math.sin(-thetaDeg * Math.PI / 360) * 0.5 - 12, C, { color: C.warm, border: hexA(C.warm, 0.4), W: W, H: H });
      }

      /* --- 顶点字母 --- */
      var vtx = [
        { p: A, t: 'A', dx: -16, dy: 14 },
        { p: B, t: 'B', dx: 14, dy: 14 },
        { p: Cc, t: 'C', dx: -16, dy: -12 }
      ];
      vtx.forEach(function (v) {
        ctx.beginPath();
        ctx.arc(v.p.x, v.p.y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = C.ink;
        ctx.fill();
        ctx.fillStyle = C.ink;
        ctx.font = 'bold 13px ' + fontFamily();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(v.t, v.p.x + v.dx, v.p.y + v.dy);
      });
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      /* --- 三边标注 --- */
      label(ctx, 'a = ' + sideText(tri.a), (A.x + B.x) / 2, Math.max(14, A.y + 14), C,
        { color: C.accent, border: hexA(C.accent, 0.45), W: W, H: H });
      label(ctx, 'o = ' + sideText(tri.o), Math.min(W - 70, Math.max(60, A.x - 12)), (A.y + Cc.y) / 2, C,
        { color: C.warm, border: hexA(C.warm, 0.45), W: W, H: H });
      label(ctx, 'h = ' + sideText(tri.h), (B.x + Cc.x) / 2 + 10, (B.y + Cc.y) / 2 - 6, C,
        { color: C.green, border: hexA(C.green, 0.45), W: W, H: H });

      /* --- 已知边高亮 --- */
      var known = tri.sideKind;
      var hi = { opposite: [Cc, B], adjacent: [A, Cc], hypotenuse: [A, B] }[known];
      if (hi) {
        ctx.save();
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 4.4;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(hi[0].x, hi[0].y); ctx.lineTo(hi[1].x, hi[1].y);
        ctx.stroke();
        ctx.restore();
      }

      /* --- 画布内的缩放说明 --- */
      ctx.fillStyle = C.inkFaint;
      ctx.font = '11.5px ' + fontFamily();
      ctx.fillText('等比缩放绘制（真实形状）· 已知' + SIDE_LETTER[known] + ' = ' + sideText(tri[known]) + ' · 精度 ' + state.digits + ' 位', 10, H - 8);
    }
  };

  function sideText(v) {
    if (!v) return '—';
    if (v.exact && v.tex) return v.tex.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2').replace(/\\sqrt\{([^{}]*)\}/g, '√$1');
    return short(v.num);
  }

  function hexA(hex, alpha) {
    var h = String(hex).trim();
    if (h.charAt(0) !== '#') return h;
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    var r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function wrapText(ctx, text, cx, cy, maxW, lineH) {
    var lines = String(text).split('\n');
    var out = [];
    lines.forEach(function (line) {
      var cur = '';
      for (var i = 0; i < line.length; i++) {
        if (ctx.measureText(cur + line[i]).width > maxW && cur) { out.push(cur); cur = line[i]; }
        else cur += line[i];
      }
      out.push(cur);
    });
    var y = cy - (out.length - 1) * lineH / 2;
    out.forEach(function (l) { ctx.fillText(l, cx, y); y += lineH; });
  }

  /* ================= 单位圆画布 ================= */

  var UnitPlot = {
    canvas: null, ctx: null, W: 0, H: 0, dpr: 1, data: null,

    init: function (canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      var self = this;
      window.addEventListener('resize', function () { self.resize(); });
      canvas.addEventListener('dblclick', function () { self.draw(); });
    },

    resize: function () {
      if (!this.canvas) return;
      var rect = this.canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      this.dpr = window.devicePixelRatio || 1;
      this.W = rect.width;
      this.H = rect.height;
      this.canvas.width = Math.round(rect.width * this.dpr);
      this.canvas.height = Math.round(rect.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.draw();
    },

    setData: function (data) { this.data = data; this.resize(); this.draw(); },

    draw: function () {
      var ctx = this.ctx;
      if (!ctx || !this.W) return;
      var C = colors(), W = this.W, H = this.H, d = this.data;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.card;
      ctx.fillRect(0, 0, W, H);

      if (!d) return;

      /* 世界坐标：[-1.55, 1.55]² ，保证单位圆与切线段都在画面里 */
      var RANGE = 1.62;
      var cx = W / 2, cy = H / 2;
      var s = Math.min(W / (RANGE * 2), H / (RANGE * 2));
      var X = function (x) { return cx + x * s; };
      var Y = function (y) { return cy - y * s; };

      /* --- 网格与坐标轴 --- */
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var g = -1; g <= 1; g++) {
        ctx.moveTo(Math.round(X(g)) + 0.5, 0); ctx.lineTo(Math.round(X(g)) + 0.5, H);
        ctx.moveTo(0, Math.round(Y(g)) + 0.5); ctx.lineTo(W, Math.round(Y(g)) + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = C.gridStrong;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(cy) + 0.5); ctx.lineTo(W, Math.round(cy) + 0.5);
      ctx.moveTo(Math.round(cx) + 0.5, 0); ctx.lineTo(Math.round(cx) + 0.5, H);
      ctx.stroke();

      /* --- 单位圆 --- */
      ctx.save();
      ctx.strokeStyle = C.gridStrong;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      var th = (d.angleNum || 0) * Math.PI / 180;
      var cosT = Math.cos(th), sinT = Math.sin(th);

      /* --- tan 切线：x = 1 --- */
      ctx.save();
      ctx.strokeStyle = hexA(C.green, 0.55);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(X(1), 0); ctx.lineTo(X(1), H);
      ctx.stroke();
      ctx.restore();

      /* --- cos 水平投影 --- */
      ctx.save();
      ctx.strokeStyle = hexA(C.accent, 0.85);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(X(cosT), cy);
      ctx.stroke();
      ctx.restore();

      /* --- sin 竖直投影 --- */
      ctx.save();
      ctx.strokeStyle = hexA(C.warm, 0.85);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(X(cosT), cy); ctx.lineTo(X(cosT), Y(sinT));
      ctx.stroke();
      ctx.restore();

      /* --- 终边 --- */
      ctx.save();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(X(cosT), Y(sinT));
      ctx.stroke();
      ctx.restore();

      /* --- tan 段：从 (1,0) 到 (1, tanθ) --- */
      if (d.ratio.tan && !d.ratio.tan.missing && isFinite(d.ratio.tan.num) && Math.abs(d.ratio.tan.num) < 1.55) {
        ctx.save();
        ctx.strokeStyle = C.green;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(X(1), cy); ctx.lineTo(X(1), Y(d.ratio.tan.num));
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(X(1), Y(d.ratio.tan.num), 3.4, 0, Math.PI * 2);
        ctx.fillStyle = C.green;
        ctx.fill();
      }

      /* --- 角弧线 --- */
      var arcR = Math.min(s * 0.34, 46);
      ctx.save();
      ctx.strokeStyle = hexA(C.warm, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      var span = d.angleNum;
      if (Math.abs(span) > 360) span = span % 360;
      if (span >= 0) ctx.arc(cx, cy, arcR, 0, -th, true);
      else ctx.arc(cx, cy, arcR, 0, -th, false);
      ctx.stroke();
      ctx.restore();

      /* --- 三个投影点 --- */
      function dot(px, py, color) {
        ctx.beginPath(); ctx.arc(px, py, 4.6, 0, Math.PI * 2);
        ctx.fillStyle = C.card; ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = color; ctx.stroke();
      }
      dot(X(cosT), Y(sinT), C.ink);
      dot(X(cosT), cy, C.accent);
      dot(X(1), Y(Math.abs(d.ratio.tan && d.ratio.tan.num) < 1.55 ? (d.ratio.tan ? d.ratio.tan.num : 0) : 0), C.green);

      /* --- 图例文字 --- */
      ctx.font = '11.5px ' + fontFamily();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      var legend = [
        ['cos θ = ' + short(cosT), C.accent],
        ['sin θ = ' + short(sinT), C.warm],
        ['tan θ = ' + (d.ratio.tan.missing ? '不存在' : short(d.ratio.tan.num)), C.green]
      ];
      var ly = 16;
      legend.forEach(function (it) {
        ctx.fillStyle = it[1];
        ctx.fillRect(10, ly - 8, 10, 3);
        ctx.fillStyle = C.inkSoft;
        ctx.fillText(it[0], 26, ly);
        ly += 17;
      });
      ctx.fillStyle = C.inkFaint;
      ctx.fillText('单位圆 · θ = ' + fmt(d.angleNorm) + '°', 10, H - 8);
    }
  };

  /* ================= 输入 → 报告 ================= */

  function collectInput() {
    return {
      fn: state.fn,
      valueSource: state.valueSource,
      angle: state.angle,
      value: state.value,
      sideKind: state.sideKind,
      side: state.side,
      digits: state.digits
    };
  }

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(update, 130);
  }

  function update(opts) {
    opts = opts || {};
    var input = collectInput();
    var res = Report.build(input);
    state.report = res;

    if (!res.ok) {
      el.errSlot.innerHTML = '<div class="err-box"><span class="ic">!</span><span></span></div>';
      el.errSlot.querySelector('span:last-child').textContent = res.error;
      TriPlot.setData(null);
      UnitPlot.setData(null);
      el.chips.innerHTML = '';
      return;
    }

    el.errSlot.innerHTML = '<div class="ok-box"><span>\u2713</span><span>' +
      (res.data.exact
        ? '计算完成：函数值为精确值（分数 / 最简根式），边长同样精确。'
        : '计算完成：本组数据无法精确表示，已按设定的 ' + res.data.digits + ' 位小数给出近似值。') +
      '</span></div>';

    el.rendered.innerHTML = mdRenderer.render(res.markdown);
    el.source.textContent = res.markdown;
    renderChips(res.data);
    TriPlot.setData(res.data);
    UnitPlot.setData(res.data);
    if (!opts.skipHash && ready) writeHash(input);
  }

  function renderChips(d) {
    var items = [
      { label: 'sin θ', value: d.ratio.sin.missing ? '—' : (d.ratio.sin.exact ? '$' + d.ratio.sin.tex + '$' : fmt(d.ratio.sin.num)) },
      { label: 'cos θ', value: d.ratio.cos.missing ? '—' : (d.ratio.cos.exact ? '$' + d.ratio.cos.tex + '$' : fmt(d.ratio.cos.num)) },
      { label: 'tan θ', value: d.ratio.tan.missing ? '不存在' : (d.ratio.tan.exact ? '$' + d.ratio.tan.tex + '$' : fmt(d.ratio.tan.num)) }
    ];
    if (d.tri) {
      items.push({ label: '对边 o', value: d.tri.o.exact ? '$' + d.tri.o.tex + '$' : fmt(d.tri.o.num) });
      items.push({ label: '邻边 a', value: d.tri.a.exact ? '$' + d.tri.a.tex + '$' : fmt(d.tri.a.num) });
      items.push({ label: '斜边 h', value: d.tri.h.exact ? '$' + d.tri.h.tex + '$' : fmt(d.tri.h.num) });
    }
    el.chips.innerHTML = '';
    items.forEach(function (it) {
      var box = document.createElement('div');
      box.className = 'chip';
      var l = document.createElement('div');
      l.className = 'chip-label';
      l.textContent = it.label;
      var v = document.createElement('div');
      v.className = 'chip-value';
      box.appendChild(l);
      box.appendChild(v);
      el.chips.appendChild(box);
      var s = String(it.value);
      if (s.charAt(0) === '$' && s.charAt(s.length - 1) === '$') katexInline(s.slice(1, -1), v);
      else v.textContent = s;
    });
  }

  /* ================= URL 状态 ================= */

  function inTrigMode() {
    return document.documentElement.getAttribute('data-mode') === 'trig';
  }

  function writeHash(input) {
    /* 只有三角函数工作区可见时才占用地址栏 hash，否则会覆盖二次函数的分享链接 */
    if (!inTrigMode()) return;
    try {
      var encoded = 'trig:' + encodeURIComponent(JSON.stringify(input));
      if (location.hash.slice(1) !== encoded) history.replaceState(null, '', '#' + encoded);
    } catch (e) { /* 忽略 */ }
  }

  function readHash() {
    if (!location.hash || location.hash.length < 6) return null;
    var raw = location.hash.slice(1);
    if (raw.slice(0, 5) !== 'trig:') return null;
    try { return JSON.parse(decodeURIComponent(raw.slice(5))); }
    catch (e) { return null; }
  }

  function applyState(st) {
    if (!st) return;
    if (st.fn === 'sin' || st.fn === 'cos' || st.fn === 'tan') state.fn = st.fn;
    if (st.valueSource === 'user' || st.valueSource === 'auto') state.valueSource = st.valueSource;
    if (st.sideKind === 'opposite' || st.sideKind === 'adjacent' || st.sideKind === 'hypotenuse') state.sideKind = st.sideKind;
    if (st.angle !== undefined) state.angle = String(st.angle);
    if (st.value !== undefined) state.value = String(st.value);
    if (st.side !== undefined) state.side = String(st.side);
    if (st.digits !== undefined) state.digits = Report.clampDigits(st.digits);
  }

  /* ================= 界面同步 ================= */

  function syncUI() {
    Array.prototype.forEach.call(el.fnTabs.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-selected', b.dataset.fn === state.fn ? 'true' : 'false');
    });
    Array.prototype.forEach.call(el.srcTabs.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-selected', b.dataset.src === state.valueSource ? 'true' : 'false');
    });
    el.angleRow.style.display = state.valueSource === 'auto' ? '' : 'none';
    el.valueRow.style.display = state.valueSource === 'user' ? '' : 'none';
    if (el.angle.value !== state.angle) el.angle.value = state.angle;
    if (el.value.value !== state.value) el.value.value = state.value;
    if (el.side.value !== state.side) el.side.value = state.side;
    el.sideKind.value = state.sideKind;
    if (el.digits.value !== String(state.digits)) el.digits.value = String(state.digits);
    el.fnHint.innerHTML = '';
    var sp = document.createElement('span');
    katexInline('\\' + state.fn + '\\theta', sp);
    el.fnHint.appendChild(sp);
    el.fnHint.appendChild(document.createTextNode('　' + FN_NAME[state.fn] + '　已知边选：' + SIDE_NAME[state.sideKind]));
    Array.prototype.forEach.call(el.viewTabs.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-selected', b.dataset.view === state.view ? 'true' : 'false');
    });
    el.rendered.hidden = state.view !== 'rendered';
    el.source.hidden = state.view !== 'source';
  }

  /* ================= 绑定 ================= */

  function bind() {
    Array.prototype.forEach.call(el.fnTabs.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        state.fn = b.dataset.fn;
        syncUI(); update();
      });
    });
    Array.prototype.forEach.call(el.srcTabs.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        state.valueSource = b.dataset.src;
        syncUI(); update();
        if (state.valueSource === 'user') { el.value.focus(); el.value.select(); }
        else { el.angle.focus(); el.angle.select(); }
      });
    });
    el.angle.addEventListener('input', function () {
      state.angle = el.angle.value;
      scheduleUpdate();
    });
    el.value.addEventListener('input', function () {
      state.value = el.value.value;
      scheduleUpdate();
    });
    el.side.addEventListener('input', function () {
      state.side = el.side.value;
      scheduleUpdate();
    });
    el.sideKind.addEventListener('change', function () {
      state.sideKind = el.sideKind.value;
      syncUI(); update();
    });
    el.digits.addEventListener('change', function () {
      state.digits = Report.clampDigits(el.digits.value);
      syncUI(); update();
    });
    Array.prototype.forEach.call(el.viewTabs.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        state.view = b.dataset.view;
        syncUI();
      });
    });
    el.examples.addEventListener('change', function () {
      var ex = EXAMPLES[Number(el.examples.value)];
      if (!ex) return;
      applyState(ex.state);
      syncUI(); update();
      el.examples.selectedIndex = 0;
    });
    el.btnCopy.addEventListener('click', function () {
      if (!state.report || !state.report.ok) { toast('当前没有可复制的报告'); return; }
      var md = state.report.markdown;
      var done = function () { toast('已复制三角函数报告'); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(md).then(done);
      else {
        var ta = document.createElement('textarea');
        ta.value = md; ta.style.position = 'fixed'; ta.style.top = '-1000px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败'); }
        document.body.removeChild(ta);
      }
    });
    el.btnDownload.addEventListener('click', function () {
      if (!state.report || !state.report.ok) { toast('当前没有可导出的报告'); return; }
      var blob = new Blob([state.report.markdown], { type: 'text/markdown;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '三角函数解析报告.md';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 200);
    });
    el.btnPrint.addEventListener('click', function () { window.print(); });
    el.btnShare.addEventListener('click', function () {
      try { history.replaceState(null, '', '#' + 'trig:' + encodeURIComponent(JSON.stringify(collectInput()))); } catch (e) { /* 忽略 */ }
      var url = location.href;
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(function () { toast('链接已复制，打开即可还原当前输入'); });
      else toast('请手动复制地址栏链接');
    });
    el.btnExamplePrev.addEventListener('click', function () { step(-1); });
    el.btnExampleNext.addEventListener('click', function () { step(1); });
    el.btnResetView.addEventListener('click', function () { TriPlot.resize(); UnitPlot.resize(); toast('已重绘图像'); });
  }

  function step(delta) {
    var n = EXAMPLES.length;
    if (!n) return;
    var cur = Number(el.examples.value) || 0;
    var next = ((cur + (delta || 1)) % n + n) % n;
    el.examples.value = String(next);
    applyState(EXAMPLES[next].state);
    syncUI(); update();
  }

  /* ================= 启动 ================= */

  function cache() {
    el.root = $('trig-app');
    el.fnTabs = $('trig-fn-tabs');
    el.srcTabs = $('trig-src-tabs');
    el.angleRow = $('trig-angle-row');
    el.valueRow = $('trig-value-row');
    el.angle = $('trig-angle');
    el.value = $('trig-value');
    el.sideKind = $('trig-side-kind');
    el.side = $('trig-side');
    el.digits = $('trig-digits');
    el.fnHint = $('trig-fn-hint');
    el.errSlot = $('trig-err-slot');
    el.rendered = $('trig-rendered');
    el.source = $('trig-source');
    el.viewTabs = $('trig-view-tabs');
    el.chips = $('trig-chips');
    el.examples = $('trig-examples');
    el.toast = $('toast');
    el.btnCopy = $('trig-btn-copy');
    el.btnDownload = $('trig-btn-download');
    el.btnPrint = $('trig-btn-print');
    el.btnShare = $('trig-btn-share');
    el.btnExamplePrev = $('trig-btn-example-prev');
    el.btnExampleNext = $('trig-btn-example-next');
    el.btnResetView = $('trig-btn-reset-view');
  }

  function boot() {
    /* 先确认页面上确实有这个工作区，再缓存元素（顺序不能反） */
    if (!document.getElementById('trig-app')) return;
    cache();
    if (!el.root) return;
    EXAMPLES.forEach(function (ex, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = ex.name;
      el.examples.appendChild(o);
    });
    el.examples.selectedIndex = 0;

    var fromHash = readHash();
    if (fromHash) applyState(fromHash);

    syncUI();
    TriPlot.init($('tri-plot'));
    UnitPlot.init($('unit-plot'));
    bind();
    update({ skipHash: !!fromHash });
    ready = true;

    /* 同步重绘一次，避免隐藏窗口里 requestAnimationFrame 被节流 */
    TriPlot.resize(); UnitPlot.resize();
    window.requestAnimationFrame(function () { TriPlot.resize(); UnitPlot.resize(); });
    window.addEventListener('load', function () { TriPlot.resize(); UnitPlot.resize(); });
  }

  /* ================= 对外 API ================= */

  window.TrigLab = {
    ready: function () { return ready; },
    isReady: function () { return !!(state.report && state.report.ok); },
    getMarkdown: function () { return (state.report && state.report.ok) ? state.report.markdown : null; },
    getData: function () { return (state.report && state.report.ok) ? state.report.data : null; },
    getState: function () { return JSON.parse(JSON.stringify(collectInput())); },
    setState: function (st) {
      if (!st || typeof st !== 'object') return false;
      try { applyState(st); syncUI(); update(); return true; }
      catch (e) { return false; }
    },
    hasHash: function () { return !!readHash(); },
    /* 工作区被隐藏时画布量到的尺寸是 0，切回来必须重新量一次（resize 内部会重绘） */
    redraw: function () { TriPlot.resize(); UnitPlot.resize(); },
    stepExample: function (d) { step(d); return true; },
    /** 三角形 + 单位圆合成为一张 PNG，便于导出 */
    getCanvasDataURL: function () {
      var a = TriPlot.canvas, b = UnitPlot.canvas;
      if (!a || !b) return null;
      try {
        var gap = 10;
        var out = document.createElement('canvas');
        out.width = Math.max(a.width, b.width);
        out.height = a.height + b.height + gap;
        var ctx = out.getContext('2d');
        var dark = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = dark ? '#1b2027' : '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(a, (out.width - a.width) / 2, 0);
        ctx.drawImage(b, (out.width - b.width) / 2, a.height + gap);
        return out.toDataURL('image/png');
      } catch (e) { return null; }
    },
    version: '1.3.0'
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();