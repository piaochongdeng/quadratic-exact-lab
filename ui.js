/*!
 * quadratic-exact-lab · ui.js  (v1.0.0)
 * ------------------------------------------------------------------
 * 界面逻辑：输入 → 精确计算 → Markdown 报告 + 图像可视化。
 * 依赖同目录下的 engine.js / report.js / markdown.js 与 vendor/katex。
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  var Report = window.QuadReport;
  var mdRenderer = window.Markdown.createRenderer(window.katex);

  /* ================= 常量 ================= */

  var FIELDS = {
    general: [
      { key: 'a', tex: 'a', hint: '二次项系数，不能为 0' },
      { key: 'b', tex: 'b', hint: '一次项系数，没有可填 0' },
      { key: 'c', tex: 'c', hint: '常数项，没有可填 0' }
    ],
    vertex: [
      { key: 'a', tex: 'a', hint: '二次项系数，不能为 0' },
      { key: 'h', tex: 'h', hint: '顶点横坐标' },
      { key: 'k', tex: 'k', hint: '顶点纵坐标' }
    ],
    factored: [
      { key: 'a', tex: 'a', hint: '二次项系数，不能为 0' },
      { key: 'r1', tex: 'x_1', hint: '第一个零点（与 x 轴交点的横坐标）' },
      { key: 'r2', tex: 'x_2', hint: '第二个零点' }
    ],
    points: [
      { key: 'p1x', tex: 'x_1', hint: '第 1 个点的横坐标' },
      { key: 'p1y', tex: 'y_1', hint: '第 1 个点的纵坐标' },
      { key: 'p2x', tex: 'x_2', hint: '第 2 个点的横坐标' },
      { key: 'p2y', tex: 'y_2', hint: '第 2 个点的纵坐标' },
      { key: 'p3x', tex: 'x_3', hint: '第 3 个点的横坐标' },
      { key: 'p3y', tex: 'y_3', hint: '第 3 个点的纵坐标' }
    ]
  };

  var FORM_FORMULA = {
    general: 'y = ax^{2} + bx + c',
    vertex: 'y = a(x - h)^{2} + k',
    factored: 'y = a(x - x_1)(x - x_2)',
    points: 'y = ax^{2} + bx + c\\ \\text{过三个已知点}'
  };

  var EXAMPLES = [
    { name: '① 顶点式 · 分数系数 1/2', state: { form: 'vertex', values: { vertex: { a: '1/2', h: '3', k: '4' } }, domain: 'all' } },
    { name: '② 交点式 · 两根 -1 与 5', state: { form: 'factored', values: { factored: { a: '1/3', r1: '-1', r2: '5' } }, domain: 'all' } },
    { name: '③ 一般式 · 无理零点 2±√3', state: { form: 'general', values: { general: { a: '1', b: '-4', c: '1' } }, domain: 'all' } },
    { name: '④ 一般式 · 判别式小于 0（无实根）', state: { form: 'general', values: { general: { a: '1', b: '0', c: '1' } }, domain: 'all' } },
    { name: '⑤ 一般式 · 二重根（与 x 轴相切）', state: { form: 'general', values: { general: { a: '-2', b: '4', c: '-2' } }, domain: 'all' } },
    { name: '⑥ 定义域 [-1, 7] · 顶点在内部', state: { form: 'general', values: { general: { a: '1', b: '-2', c: '3' } }, domain: 'interval', left: { value: '-1', open: false }, right: { value: '7', open: false } } },
    { name: '⑦ 定义域 (1, 4] · 端点取不到', state: { form: 'general', values: { general: { a: '1', b: '-2', c: '3' } }, domain: 'interval', left: { value: '1', open: true }, right: { value: '4', open: false } } },
    { name: '⑧ 定义域 [3, +∞) · 半无界', state: { form: 'general', values: { general: { a: '1', b: '-2', c: '3' } }, domain: 'interval', left: { value: '3', open: false }, right: { value: '', open: true } } },
    { name: '⑨ 开口向下 · 定义域 [-2, 3]', state: { form: 'vertex', values: { vertex: { a: '-1', h: '1', k: '4' } }, domain: 'interval', left: { value: '-2', open: false }, right: { value: '3', open: false } } },
    { name: '⑩ 小数输入 · 0.75 自动转分数', state: { form: 'general', values: { general: { a: '0.5', b: '-1.25', c: '0.75' } }, domain: 'all' } },
    { name: '⑪ 三点确定函数 (0,3) (1,0) (-1,0)', state: { form: 'points', values: { points: { p1x: '0', p1y: '3', p2x: '1', p2y: '0', p3x: '-1', p3y: '0' } }, domain: 'all' } },
    { name: '⑫ 三点确定函数 · 无理零点 (0,-2) (1,-1) (2,2)', state: { form: 'points', values: { points: { p1x: '0', p1y: '-2', p2x: '1', p2y: '-1', p3x: '2', p3y: '2' } }, domain: 'all' } }
  ];

  /* ================= 状态 ================= */

  var state = {
    form: 'general',
    values: {
      general: { a: '1', b: '-2', c: '3' },
      vertex: { a: '1', h: '1', k: '-4' },
      factored: { a: '1', r1: '-1', r2: '3' },
      points: { p1x: '0', p1y: '3', p2x: '1', p2y: '0', p3x: '-1', p3y: '0' }
    },
    domain: {
      mode: 'all',
      left: { value: '', open: true, unbounded: true },
      right: { value: '', open: true, unbounded: true }
    },
    view: 'rendered',
    report: null
  };

  var el = {};
  var debounceTimer = null;
  var Desktop = window.QuadDesktop || null;   /* 桌面版由 preload 注入；网页版为 null */
  var Android = window.QuadAndroid || null;   /* Android 壳用 addJavascriptInterface 注入；网页版为 null */

  /* ================= 小工具 ================= */

  function $(id) { return document.getElementById(id); }

  /** 字符串 → Base64（UTF-8 安全）。Android 的原生桥只收 Base64，二进制才不会被截断。 */
  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    var CHUNK = 0x8000;   /* 分块拼接，避免超长字符串把调用栈撑爆 */
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function katexInline(tex, target) {
    try {
      target.innerHTML = window.katex.renderToString(tex, { throwOnError: false, strict: false });
    } catch (e) { target.textContent = tex; }
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(el.toast._t);
    el.toast._t = setTimeout(function () { el.toast.classList.remove('on'); }, 1900);
  }

  function copyText(text) {
    /* Android 壳里 navigator.clipboard 在 file:// 下不可靠，交给原生剪贴板 */
    if (Android && typeof Android.copy === 'function') {
      return new Promise(function (resolve) {
        Android.copy(text);
        resolve();
      });
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); resolve(); }
      catch (err) { reject(err); }
      finally { document.body.removeChild(ta); }
    });
  }
  /* ================= 输入区 ================= */

  function buildCoefInputs() {
    var grid = el.coefGrid;
    grid.innerHTML = '';
    var fields = FIELDS[state.form];
    grid.classList.toggle('pairs', fields.length > 3);   /* 六个坐标 → 两列更清爽 */
    fields.forEach(function (f) {
      var wrap = document.createElement('div');
      var label = document.createElement('label');
      label.className = 'field-label';
      label.setAttribute('for', 'in-' + f.key);
      var span = document.createElement('span');
      katexInline(f.tex, span);
      label.appendChild(span);
      var input = document.createElement('input');
      input.type = 'text';
      input.id = 'in-' + f.key;
      input.className = 'mono';
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.value = state.values[state.form][f.key] || '';
      input.addEventListener('input', function () {
        state.values[state.form][f.key] = input.value;
        scheduleUpdate();
      });
      wrap.appendChild(label);
      wrap.appendChild(input);
      grid.appendChild(wrap);
    });
    var hint = document.createElement('div');
    hint.className = 'hint';
    var f0 = document.createElement('span');
    katexInline(FORM_FORMULA[state.form], f0);
    hint.appendChild(f0);
    hint.appendChild(document.createTextNode('　支持整数、分数（如 -3/4）、小数（如 0.75），小数会被精确换算成分数。'));
    grid.appendChild(hint);
  }

  function syncFormTabs() {
    Array.prototype.forEach.call(el.formTabs.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-selected', b.dataset.form === state.form ? 'true' : 'false');
    });
  }

  function syncDomainUI() {
    var isInterval = state.domain.mode === 'interval';
    el.domainInterval.style.display = isInterval ? '' : 'none';
    Array.prototype.forEach.call(document.querySelectorAll('input[name="dom"]'), function (r) {
      r.checked = (r.value === state.domain.mode);
    });
    el.linf.checked = !!state.domain.left.unbounded;
    el.rinf.checked = !!state.domain.right.unbounded;
    el.lval.value = state.domain.left.value;
    el.rval.value = state.domain.right.value;
    el.lval.disabled = el.linf.checked;
    el.rval.disabled = el.rinf.checked;
    el.lval.setAttribute('aria-disabled', el.linf.checked ? 'true' : 'false');
    el.rval.setAttribute('aria-disabled', el.rinf.checked ? 'true' : 'false');
    /* 勾上 ±∞ 时输入框会变灰禁用，这里把提示文字也换掉，避免用户以为是坏了 */
    el.lval.placeholder = el.linf.checked ? '\u2212\u221e 无端点，取消勾选即可输入' : '左端点，如 -1 或 -3/2';
    el.rval.placeholder = el.rinf.checked ? '+\u221e 无端点，取消勾选即可输入' : '右端点，如 3 或 7/2';
    el.lb.textContent = state.domain.left.open ? '(' : '[';
    el.rb.textContent = state.domain.right.open ? ')' : ']';
    el.lb.dataset.open = state.domain.left.open ? '1' : '0';
    el.rb.dataset.open = state.domain.right.open ? '1' : '0';
    renderIntervalPreview();
  }

  function renderIntervalPreview() {
    if (state.domain.mode !== 'interval') {
      el.intervalPreview.innerHTML = '<span>定义域：全体实数 \u211d</span>';
      return;
    }
    var L = state.domain.left, R = state.domain.right;
    var lv = (!L.unbounded && L.value) ? L.value : '\u2212\u221e';
    var rv = (!R.unbounded && R.value) ? R.value : '+\u221e';
    var lb = (L.unbounded || L.open) ? '(' : '[';
    var rb = (R.unbounded || R.open) ? ')' : ']';
    el.intervalPreview.innerHTML = '';
    var sp = document.createElement('span');
    sp.style.fontFamily = 'var(--mono)';
    sp.style.fontSize = '14px';
    sp.style.whiteSpace = 'nowrap';
    sp.textContent = '定义域：' + lb + lv + ', ' + rv + rb;
    el.intervalPreview.appendChild(sp);
  }

  /* ================= 计算与渲染 ================= */

  function collectInput() {
    var v = state.values[state.form];
    var input = { form: state.form };
    if (state.form === 'general') { input.a = v.a; input.b = v.b; input.c = v.c; }
    else if (state.form === 'vertex') { input.a = v.a; input.h = v.h; input.k = v.k; }
    else if (state.form === 'factored') { input.a = v.a; input.r1 = v.r1; input.r2 = v.r2; }
    else {
      input.p1 = { x: v.p1x, y: v.p1y };
      input.p2 = { x: v.p2x, y: v.p2y };
      input.p3 = { x: v.p3x, y: v.p3y };
    }
    input.domain = {
      mode: state.domain.mode,
      left: { value: state.domain.left.unbounded ? '' : state.domain.left.value, open: state.domain.left.open },
      right: { value: state.domain.right.unbounded ? '' : state.domain.right.value, open: state.domain.right.open }
    };
    return input;
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
      return;
    }

    el.errSlot.innerHTML = '<div class="ok-box"><span>\u2713</span><span>计算完成：全部结果均为精确值（分数 / 根号）。</span></div>';
    el.rendered.innerHTML = mdRenderer.render(res.markdown);
    el.source.textContent = res.markdown;
    renderChips(res.data, res.markdown);
    Plot.setData(res.data, res.givenPoints);
    if (!opts.skipHash) writeHash(input);
  }

  function renderChips(d, markdown) {
    var rangeMatch = /值域\*\*：\$([^$]+)\$/.exec(markdown || '');
    var chips = [
      { label: '顶点坐标', tex: '\\left(' + d.exact.h + ',\\ ' + d.exact.k + '\\right)' },
      { label: '对称轴', tex: 'x = ' + d.exact.h },
      { label: '值域', tex: rangeMatch ? rangeMatch[1] : '' }
    ];
    el.chips.innerHTML = '';
    chips.forEach(function (c) {
      var box = document.createElement('div');
      box.className = 'chip';
      var l = document.createElement('div');
      l.className = 'chip-label';
      l.textContent = c.label;
      var v = document.createElement('div');
      v.className = 'chip-value';
      box.appendChild(l);
      box.appendChild(v);
      el.chips.appendChild(box);
      katexInline(c.tex, v);
    });
  }

  /* ================= 工作区切换（二次函数 / 三角函数） ================= */

  var AppMode = {
    KEY: 'qel-mode',
    current: function () {
      var m = document.documentElement.getAttribute('data-mode');
      return m === 'trig' ? 'trig' : 'quad';
    },
    detect: function () {
      /* 分享链接以 trig: 开头时直接进三角函数工作区 */
      var raw = location.hash ? location.hash.slice(1) : '';
      if (raw.slice(0, 5) === 'trig:') return 'trig';
      if (raw.length > 1) return 'quad';
      var saved = null;
      try { saved = localStorage.getItem('qel-mode'); } catch (e) { /* 忽略 */ }
      return saved === 'trig' ? 'trig' : 'quad';
    },
    apply: function (mode) {
      var m = (mode === 'trig') ? 'trig' : 'quad';
      document.documentElement.setAttribute('data-mode', m);
      if (el.quadApp) el.quadApp.hidden = (m !== 'quad');
      if (el.trigApp) el.trigApp.hidden = (m !== 'trig');
      if (el.modeBar) {
        Array.prototype.forEach.call(el.modeBar.querySelectorAll('button'), function (b) {
          b.setAttribute('aria-selected', b.dataset.mode === m ? 'true' : 'false');
        });
      }
      try { localStorage.setItem('qel-mode', m); } catch (e) { /* 忽略 */ }
      /* 被隐藏时画布的尺寸是 0，切回来必须重新量一次。
         这里刻意不用 requestAnimationFrame：隐藏窗口里它会被节流，
         导致画布一直停在 300×150 的默认尺寸。同步重绘最可靠。 */
      if (m === 'quad') {
        Plot.resize(); Plot.fit(); Plot.draw();
      } else if (window.TrigLab && window.TrigLab.redraw) {
        window.TrigLab.redraw();
      }
      return m;
    },
    set: function (mode) {
      var m = AppMode.apply(mode);
      /* 切换工作区时把 hash 换成当前工作区的状态，避免链接还原到另一个工作区 */
      if (m === 'trig') {
        if (window.TrigLab && window.TrigLab.getState) {
          try { history.replaceState(null, '', '#trig:' + encodeURIComponent(JSON.stringify(window.TrigLab.getState()))); } catch (e) { /* 忽略 */ }
        }
      } else {
        try { writeHash(collectInput()); } catch (e) { /* 忽略 */ }
      }
      return m;
    }
  };

  /* ================= URL 状态 ================= */

  function writeHash(input) {
    /* 三角函数工作区有自己的 hash 前缀（trig:），两个工作区不能互相覆盖 */
    if (AppMode.current() !== 'quad') return;
    try {
      var encoded = encodeURIComponent(JSON.stringify(input));
      if (location.hash.slice(1) !== encoded) history.replaceState(null, '', '#' + encoded);
    } catch (e) { /* 忽略 */ }
  }

  function readHash() {
    if (!location.hash || location.hash.length < 2) return null;
    try { return JSON.parse(decodeURIComponent(location.hash.slice(1))); }
    catch (e) { return null; }
  }

  /**
   * 把一个端点归一化成 { value, open, unbounded }。
   * 旧链接 / 旧 JSON 只有 { value, open }，此时「值为空」表示该侧无界；
   * 新格式带 unbounded，直接采信——这正是修复「输入框无法输入」的关键：
   * 不再用「值为空」去反推无界，否则空输入框会被自动勾上 ±∞ 并被禁用。
   */
  function normSide(side) {
    var value = (side && side.value !== null && side.value !== undefined) ? String(side.value) : '';
    var unbounded = (side && typeof side.unbounded === 'boolean') ? side.unbounded : (value.trim() === '');
    return { value: value, open: !(side && side.open === false), unbounded: unbounded };
  }

  function applyState(st) {
    if (!st) return;
    if (st.form && FIELDS[st.form]) state.form = st.form;
    if (st.values) {
      Object.keys(st.values).forEach(function (k) {
        if (state.values[k]) Object.assign(state.values[k], st.values[k]);
      });
    }
    if (st.domain) {
      if (typeof st.domain === 'string') state.domain.mode = st.domain;
      else {
        state.domain.mode = st.domain.mode === 'interval' ? 'interval' : 'all';
        if (st.domain.left) state.domain.left = normSide(st.domain.left);
        if (st.domain.right) state.domain.right = normSide(st.domain.right);
      }
    }
    if (st.left) state.domain.left = normSide(st.left);
    if (st.right) state.domain.right = normSide(st.right);
  }
  /* ================= 图像 ================= */

  var Plot = {
    canvas: null, ctx: null, dpr: 1, W: 0, H: 0,
    data: null,
    view: { xMin: -5, xMax: 5, yMin: -6, yMax: 6 },
    hover: null,
    drag: null,

    init: function (canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      var self = this;

      window.addEventListener('resize', function () { self.resize(); });

      canvas.addEventListener('wheel', function (ev) {
        ev.preventDefault();
        var rect = canvas.getBoundingClientRect();
        var fx = (ev.clientX - rect.left) / rect.width;
        var fy = (ev.clientY - rect.top) / rect.height;
        self.zoomAt(fx, fy, ev.deltaY > 0 ? 1.12 : 1 / 1.12);
      }, { passive: false });

      canvas.addEventListener('pointerdown', function (ev) {
        canvas.setPointerCapture(ev.pointerId);
        self.drag = { x: ev.clientX, y: ev.clientY, view: Object.assign({}, self.view) };
      });

      canvas.addEventListener('pointermove', function (ev) {
        if (pinch) return;   /* 双指捏合期间不做悬停读数 / 平移 */
        var rect = canvas.getBoundingClientRect();
        var px = ev.clientX - rect.left, py = ev.clientY - rect.top;
        if (self.drag) {
          var dx = (ev.clientX - self.drag.x) / rect.width * (self.drag.view.xMax - self.drag.view.xMin);
          var dy = (ev.clientY - self.drag.y) / rect.height * (self.drag.view.yMax - self.drag.view.yMin);
          self.view.xMin = self.drag.view.xMin - dx;
          self.view.xMax = self.drag.view.xMax - dx;
          self.view.yMin = self.drag.view.yMin + dy;
          self.view.yMax = self.drag.view.yMax + dy;
        }
        self.hover = { px: px, py: py, x: self.pxToX(px), y: self.pxToY(py) };
        self.draw();
        self.updateTooltip(px, py);
      });

      canvas.addEventListener('pointerup', function (ev) {
        self.drag = null;
        try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      });

      canvas.addEventListener('pointerleave', function () {
        self.hover = null;
        self.drag = null;
        self.draw();
        el.tooltip.classList.remove('on');
      });

      canvas.addEventListener('dblclick', function () { self.fit(); self.draw(); });

      /* ---------- 双指捏合缩放 ----------
         触屏上没有滚轮，只靠 wheel 事件的话手机上根本没法缩放。
         这里用两支手指的距离变化做缩放，中点作为缩放锚点。
         双指期间禁用平移与悬停读数，避免和 pointer 事件打架。 */
      var pinch = null;

      function pinchInfo(ev) {
        var rect = canvas.getBoundingClientRect();
        var a = ev.touches[0], b = ev.touches[1];
        var dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        return {
          dist: dist,
          fx: ((a.clientX + b.clientX) / 2 - rect.left) / rect.width,
          fy: ((a.clientY + b.clientY) / 2 - rect.top) / rect.height
        };
      }

      canvas.addEventListener('touchstart', function (ev) {
        if (ev.touches.length !== 2) return;
        ev.preventDefault();
        self.drag = null;
        self.hover = null;
        el.tooltip.classList.remove('on');
        pinch = pinchInfo(ev);
      }, { passive: false });

      canvas.addEventListener('touchmove', function (ev) {
        if (ev.touches.length !== 2) return;
        ev.preventDefault();
        var now = pinchInfo(ev);
        if (!pinch || !(pinch.dist > 0) || !(now.dist > 0)) { pinch = now; return; }
        /* 两指张开 → 放大：k = 上一帧距离 / 当前距离（< 1 表示视野缩小 = 放大） */
        var k = pinch.dist / now.dist;
        if (Math.abs(k - 1) > 1e-4) self.zoomAt(now.fx, now.fy, k);
        pinch = now;
      }, { passive: false });

      canvas.addEventListener('touchend', function (ev) {
        if (ev.touches.length < 2) pinch = null;
      }, { passive: true });

      canvas.addEventListener('touchcancel', function () { pinch = null; }, { passive: true });
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

    setData: function (data, givenPoints) {
      this.data = data;
      this.given = givenPoints || null;   /* 三点输入时，把已知点也标出来 */
      this.resize();
      this.fit();
      this.draw();
    },

    f: function (x) {
      var d = this.data;
      return d ? d.a * x * x + d.b * x + d.c : 0;
    },

    fit: function () {
      var d = this.data;
      if (!d) return;

      /* --- 横向：以顶点为中心取一个「看得见形状」的窗口，再并入必须可见的点 --- */
      var w = 2.6 / Math.sqrt(Math.max(Math.abs(d.a), 1e-9));   /* |a| 越大开口越窄 */
      if (!isFinite(w) || w <= 0) w = 2.6;
      w = Math.max(w, 1);
      var lo = d.h - w, hi = d.h + w;
      var anchors = [0, d.h];
      if (d.domain.hasLeft) anchors.push(d.domain.m);
      if (d.domain.hasRight) anchors.push(d.domain.n);
      (d.roots || []).forEach(function (r) { anchors.push(r); });
      (this.given || []).forEach(function (p) { anchors.push(p.x); });
      anchors.forEach(function (x) {
        if (!isFinite(x)) return;
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      });
      if (hi - lo < 1e-6) { lo -= 2; hi += 2; }
      var pad = (hi - lo) * 0.12;
      var xMin = lo - pad, xMax = hi + pad;
      var spanX = xMax - xMin;

      /* --- 纵向：以「关键函数值」为中心取窗口，避免抛物线两端把画面拉爆 --- */
      var musts = [d.k, 0];
      if (d.domain.hasLeft) musts.push(this.f(d.domain.m));
      if (d.domain.hasRight) musts.push(this.f(d.domain.n));
      if (d.extrema.min) musts.push(d.extrema.min.value);
      if (d.extrema.max) musts.push(d.extrema.max.value);
      musts = musts.filter(function (v) { return isFinite(v); });
      if (!musts.length) musts = [0];

      var mustLo = Math.min.apply(null, musts), mustHi = Math.max.apply(null, musts);
      var cy = (mustLo + mustHi) / 2;
      var hy = Math.max((mustHi - mustLo) * 0.75, spanX * 0.42, 1.6);
      var yLo = cy - hy, yHi = cy + hy;

      /* 采样真实函数值；区间模式下只看定义域内的部分，画面更聚焦 */
      var sLo = Infinity, sHi = -Infinity, N = 300;
      var sampLo = xMin, sampHi = xMax;
      if (d.domain.mode === 'interval') {
        if (d.domain.hasLeft) sampLo = Math.max(sampLo, d.domain.m);
        if (d.domain.hasRight) sampHi = Math.min(sampHi, d.domain.n);
      }
      for (var i = 0; i <= N; i++) {
        var x = sampLo + (sampHi - sampLo) * i / N;
        var y = this.f(x);
        if (!isFinite(y)) continue;
        if (y < sLo) sLo = y;
        if (y > sHi) sHi = y;
      }
      if (isFinite(sLo)) {
        if (sLo > yLo && sLo < cy + hy * 0.5) yLo = sLo;
        if (sHi < yHi && sHi > cy - hy * 0.5) yHi = sHi;
      }

      /* 坐标轴离得太远就不强行塞进画面 */
      if (yLo > 0 && yLo < hy * 0.7) yLo = 0;
      if (yHi < 0 && -yHi < hy * 0.7) yHi = 0;

      var yPad = (yHi - yLo) * 0.12 || 0.5;
      this.view = { xMin: xMin, xMax: xMax, yMin: yLo - yPad, yMax: yHi + yPad };
    },

    zoomAt: function (fx, fy, k) {
      var v = this.view;
      var x0 = v.xMin + (v.xMax - v.xMin) * fx;
      var y0 = v.yMax - (v.yMax - v.yMin) * fy;
      v.xMin = x0 + (v.xMin - x0) * k;
      v.xMax = x0 + (v.xMax - x0) * k;
      v.yMin = y0 + (v.yMin - y0) * k;
      v.yMax = y0 + (v.yMax - y0) * k;
      this.draw();
    },

    xToPx: function (x) { return (x - this.view.xMin) / (this.view.xMax - this.view.xMin) * this.W; },
    yToPx: function (y) { return this.H - (y - this.view.yMin) / (this.view.yMax - this.view.yMin) * this.H; },
    pxToX: function (px) { return this.view.xMin + px / this.W * (this.view.xMax - this.view.xMin); },
    pxToY: function (py) { return this.view.yMin + (this.H - py) / this.H * (this.view.yMax - this.view.yMin); },

    colors: function () {
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
        card: g('--card', '#ffffff')
      };
    },
    draw: function () {
      var ctx = this.ctx, d = this.data;
      if (!ctx || !this.W) return;
      var C = this.colors();
      var v = this.view, W = this.W, H = this.H, self = this;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.card;
      ctx.fillRect(0, 0, W, H);

      /* --- 网格 --- */
      var stepX = niceStep((v.xMax - v.xMin) / 9);
      var stepY = niceStep((v.yMax - v.yMin) / 7);
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      var gx = Math.ceil(v.xMin / stepX) * stepX;
      for (; gx <= v.xMax + 1e-9; gx += stepX) {
        var px = Math.round(this.xToPx(gx)) + 0.5;
        ctx.moveTo(px, 0); ctx.lineTo(px, H);
      }
      var gy = Math.ceil(v.yMin / stepY) * stepY;
      for (; gy <= v.yMax + 1e-9; gy += stepY) {
        var py = Math.round(this.yToPx(gy)) + 0.5;
        ctx.moveTo(0, py); ctx.lineTo(W, py);
      }
      ctx.stroke();

      /* --- 定义域之外淡灰遮罩 --- */
      if (d && d.domain.mode === 'interval') {
        ctx.fillStyle = 'rgba(128,128,128,0.10)';
        if (d.domain.hasLeft) {
          var xm = this.xToPx(d.domain.m);
          if (xm > 0) ctx.fillRect(0, 0, Math.min(xm, W), H);
        }
        if (d.domain.hasRight) {
          var xn = this.xToPx(d.domain.n);
          if (xn < W) ctx.fillRect(Math.max(xn, 0), 0, W - Math.max(xn, 0), H);
        }
      }

      /* --- 坐标轴 --- */
      var axisYVisible = (0 >= v.yMin && 0 <= v.yMax);
      var axisXVisible = (0 >= v.xMin && 0 <= v.xMax);
      var axisY = Math.max(0, Math.min(H, this.yToPx(0)));
      var axisX = Math.max(0, Math.min(W, this.xToPx(0)));
      ctx.strokeStyle = C.gridStrong;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (axisYVisible) { ctx.moveTo(0, axisY); ctx.lineTo(W, axisY); }
      if (axisXVisible) { ctx.moveTo(axisX, 0); ctx.lineTo(axisX, H); }
      ctx.stroke();

      /* --- 刻度文字 --- */
      ctx.fillStyle = C.inkFaint;
      ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var labelY = axisYVisible ? Math.min(H - 15, axisY + 4) : H - 16;
      gx = Math.ceil(v.xMin / stepX) * stepX;
      for (; gx <= v.xMax + 1e-9; gx += stepX) {
        if (Math.abs(gx) < stepX * 1e-6) continue;
        ctx.fillText(fmtNum(gx, stepX), this.xToPx(gx), labelY);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      var labelX = axisXVisible ? Math.max(24, axisX - 5) : 24;
      gy = Math.ceil(v.yMin / stepY) * stepY;
      for (; gy <= v.yMax + 1e-9; gy += stepY) {
        if (Math.abs(gy) < stepY * 1e-6) continue;
        ctx.fillText(fmtNum(gy, stepY), labelX, this.yToPx(gy));
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      if (axisXVisible && axisYVisible) ctx.fillText('O', axisX + 4, axisY + 13);

      if (!d) return;

      /* --- 对称轴 --- */
      if (d.h >= v.xMin && d.h <= v.xMax) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = C.warm;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        var hx = this.xToPx(d.h);
        ctx.moveTo(hx, 0); ctx.lineTo(hx, H);
        ctx.stroke();
        ctx.restore();
      }

      /* --- 抛物线 --- */
      var inDomain = function (x) {
        if (!d.domain || d.domain.mode !== 'interval') return true;
        if (d.domain.hasLeft && x < d.domain.m - 1e-12) return false;
        if (d.domain.hasRight && x > d.domain.n + 1e-12) return false;
        return true;
      };

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();

      /* 定义域之外：淡虚线 */
      ctx.strokeStyle = C.gridStrong;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      var started = false;
      for (var p1 = 0; p1 <= W; p1 += 1) {
        var x1 = self.pxToX(p1);
        if (inDomain(x1)) { started = false; continue; }
        var y1 = self.yToPx(self.f(x1));
        if (!started) { ctx.moveTo(p1, y1); started = true; } else { ctx.lineTo(p1, y1); }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      /* 定义域之内：主曲线 */
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      var pen = false;
      for (var p2 = 0; p2 <= W; p2 += 1) {
        var x2 = self.pxToX(p2);
        if (!inDomain(x2)) { pen = false; continue; }
        var y2 = self.yToPx(self.f(x2));
        if (!pen) { ctx.moveTo(p2, y2); pen = true; } else { ctx.lineTo(p2, y2); }
      }
      ctx.stroke();
      ctx.restore();

      /* --- 零点 --- */
      (d.roots || []).forEach(function (r) {
        if (r < v.xMin || r > v.xMax) return;
        dot(ctx, self.xToPx(r), self.yToPx(0), 5, C.green, C.card);
      });

      /* --- 三点输入时的已知点 --- */
      (this.given || []).forEach(function (p) {
        if (!isFinite(p.x) || !isFinite(p.y)) return;
        if (p.x < v.xMin || p.x > v.xMax || p.y < v.yMin || p.y > v.yMax) return;
        ring(ctx, self.xToPx(p.x), self.yToPx(p.y), 7, C.inkSoft);
        dot(ctx, self.xToPx(p.x), self.yToPx(p.y), 4, C.inkSoft, C.card);
      });

      /* --- 与 y 轴交点 --- */
      if (0 >= v.xMin && 0 <= v.xMax && d.c >= v.yMin && d.c <= v.yMax) {
        dot(ctx, this.xToPx(0), this.yToPx(d.c), 4.5, C.inkSoft, C.card);
      }

      /* --- 定义域端点（实心=闭，空心=开） --- */
      if (d.domain.mode === 'interval') {
        [[d.domain.hasLeft, d.domain.m, d.domain.leftOpen], [d.domain.hasRight, d.domain.n, d.domain.rightOpen]]
          .forEach(function (t) {
            if (!t[0]) return;
            var py2 = self.yToPx(self.f(t[1]));
            if (py2 < -40 || py2 > H + 40) return;
            dot(ctx, self.xToPx(t[1]), py2, 4.5, C.accent, C.card, t[2]);
          });
      }

      /* --- 最值点 --- */
      [d.extrema.min, d.extrema.max].forEach(function (ex) {
        if (!ex) return;
        var py3 = self.yToPx(ex.value);
        if (py3 < -40 || py3 > H + 40) return;
        ring(ctx, self.xToPx(ex.at), py3, 8.5, C.warm);
      });

      /* --- 顶点 --- */
      if (d.h >= v.xMin && d.h <= v.xMax) {
        var vx = this.xToPx(d.h), vy = this.yToPx(d.k);
        ring(ctx, vx, vy, 8.5, C.warm);
        dot(ctx, vx, vy, 5.5, C.warm, C.card);
        drawLabel(ctx, '顶点 (' + fmtNum(d.h, stepX) + ', ' + fmtNum(d.k, stepY) + ')',
          vx, vy, C, { dy: d.up ? -24 : 24, anchor: 'center' });
      }

      /* --- 悬停 --- */
      if (this.hover && this.hover.px >= 0 && this.hover.px <= W) {
        var hx2 = this.xToPx(this.hover.x), hy2 = this.yToPx(this.f(this.hover.x));
        ctx.save();
        ctx.strokeStyle = C.inkFaint;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx2, 0); ctx.lineTo(hx2, H);
        ctx.stroke();
        ctx.restore();
        if (hy2 >= -10 && hy2 <= H + 10) dot(ctx, hx2, hy2, 4, C.accent, C.card);
      }
    },

    updateTooltip: function (px, py) {
      if (!this.data) return;
      var x = this.hover.x, y = this.f(x);
      var ex = niceFrac(x), ey = niceFrac(y);
      /* 能写成简单分数时就给分数，并附上近似小数 */
      var l1 = 'x = ' + (ex ? (ex.indexOf('/') >= 0 ? ex + '  ≈ ' + x.toFixed(4) : ex) : x.toFixed(4));
      var l2 = 'y = ' + (ey ? (ey.indexOf('/') >= 0 ? ey + '  ≈ ' + y.toFixed(4) : ey) : y.toFixed(4));
      el.tooltip.innerHTML = '<div>' + l1 + '</div><div>' + l2 + '</div>';
      el.tooltip.style.left = px + 'px';
      el.tooltip.style.top = py + 'px';
      el.tooltip.classList.add('on');
    }
  };
  /* ================= 绘图小工具 ================= */

  function dot(ctx, x, y, r, color, ringColor, hollow) {
    if (!isFinite(x) || !isFinite(y)) return;
    ctx.beginPath();
    ctx.arc(x, y, r + 1.6, 0, Math.PI * 2);
    ctx.fillStyle = ringColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (hollow) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = ringColor;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function ring(ctx, x, y, r, color) {
    if (!isFinite(x) || !isFinite(y)) return;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  function drawLabel(ctx, text, x, y, C, opts) {
    opts = opts || {};
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.save();
    ctx.font = '11.5px ' + getComputedStyle(document.body).fontFamily;
    var w = ctx.measureText(text).width;
    var padX = 6;
    var bx = opts.anchor === 'center' ? x - w / 2 - padX : x + 8;
    var by = y + (opts.dy || -24) - 9;
    bx = Math.max(3, Math.min(Plot.W - w - padX * 2 - 3, bx));
    by = Math.max(3, Math.min(Plot.H - 21, by));
    ctx.fillStyle = dark ? 'rgba(27,32,39,0.86)' : 'rgba(255,255,255,0.86)';
    roundRect(ctx, bx, by, w + padX * 2, 18, 5);
    ctx.fill();
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.inkSoft;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + padX, by + 9.5);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function niceStep(raw) {
    if (!isFinite(raw) || raw <= 0) return 1;
    var exp = Math.floor(Math.log10(raw));
    var base = Math.pow(10, exp);
    var f = raw / base;
    return (f <= 1 ? 1 : (f <= 2 ? 2 : (f <= 5 ? 5 : 10))) * base;
  }

  function fmtNum(v, step) {
    if (Math.abs(v) < (step || 1) * 1e-9) return '0';
    var abs = Math.abs(v);
    if (abs >= 1e6 || abs < 1e-4) return v.toExponential(1).replace('e+', 'e');
    var digits = Math.max(0, Math.min(6, -Math.floor(Math.log10(step || 1)) + 1));
    var s = v.toFixed(digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  /* 把浮点还原成好看的分母不超过 16 的分数，用于悬停读数 */
  function niceFrac(v, maxDen) {
    maxDen = maxDen || 16;
    if (!isFinite(v)) return null;
    for (var d = 1; d <= maxDen; d++) {
      var n = Math.round(v * d);
      if (Math.abs(v - n / d) < 1e-9) return d === 1 ? String(n) : n + '/' + d;
    }
    return null;
  }

  /* ================= 事件绑定 ================= */

  function bind() {
    if (el.modeBar) {
      Array.prototype.forEach.call(el.modeBar.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () { AppMode.set(b.dataset.mode); });
      });
    }

    Array.prototype.forEach.call(el.formTabs.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        state.form = b.dataset.form;
        syncFormTabs();
        buildCoefInputs();
        update();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('input[name="dom"]'), function (r) {
      r.addEventListener('change', function () {
        state.domain.mode = r.value;
        if (r.value === 'interval' && state.domain.left.unbounded && state.domain.right.unbounded) {
          /* 两侧都无界等于全体实数，与「自定义区间」矛盾；
             自动取消左侧 −∞ 并把光标放进输入框，省得用户面对一个被禁用的框。 */
          state.domain.left.unbounded = false;
        }
        syncDomainUI();
        update();
        if (r.value === 'interval' && !el.lval.disabled) {
          el.lval.focus();
          el.lval.select();
        }
      });
    });

    el.lb.addEventListener('click', function () {
      state.domain.left.open = !state.domain.left.open;
      syncDomainUI(); update();
    });
    el.rb.addEventListener('click', function () {
      state.domain.right.open = !state.domain.right.open;
      syncDomainUI(); update();
    });
    el.lval.addEventListener('input', function () {
      state.domain.left.value = el.lval.value;
      state.domain.left.unbounded = el.lval.value.trim() === '' && state.domain.left.unbounded;
      renderIntervalPreview();
      scheduleUpdate();
    });
    el.rval.addEventListener('input', function () {
      state.domain.right.value = el.rval.value;
      state.domain.right.unbounded = el.rval.value.trim() === '' && state.domain.right.unbounded;
      renderIntervalPreview();
      scheduleUpdate();
    });
    el.linf.addEventListener('change', function () {
      state.domain.left.unbounded = el.linf.checked;
      if (el.linf.checked) state.domain.left.value = '';   /* −∞ 没有端点数值 */
      syncDomainUI(); update();
    });
    el.rinf.addEventListener('change', function () {
      state.domain.right.unbounded = el.rinf.checked;
      if (el.rinf.checked) state.domain.right.value = '';
      syncDomainUI(); update();
    });

    el.examples.addEventListener('change', function () {
      var ex = EXAMPLES[Number(el.examples.value)];
      if (!ex) return;
      applyState(ex.state);
      syncFormTabs();
      buildCoefInputs();
      syncDomainUI();
      update();
      el.examples.selectedIndex = 0;
    });

    Array.prototype.forEach.call(el.viewTabs.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        state.view = b.dataset.view;
        Array.prototype.forEach.call(el.viewTabs.querySelectorAll('button'), function (o) {
          o.setAttribute('aria-selected', o.dataset.view === state.view ? 'true' : 'false');
        });
        el.rendered.hidden = state.view !== 'rendered';
        el.source.hidden = state.view !== 'source';
      });
    });

    el.btnCopy.addEventListener('click', function () {
      if (!state.report || !state.report.ok) { toast('当前没有可复制的报告'); return; }
      copyText(state.report.markdown)
        .then(function () { toast('已复制完整 Markdown 报告'); })
        .catch(function () { toast('复制失败，请切到源码视图手动复制'); });
    });

    el.btnDownload.addEventListener('click', function () {
      if (!state.report || !state.report.ok) { toast('当前没有可下载的报告'); return; }
      if (Android) { androidSave('二次函数解析报告.md', 'text/markdown', state.report.markdown); return; }
      var blob = new Blob([state.report.markdown], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '二次函数解析报告.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('已导出 Markdown 文件');
    });

    el.btnPrint.addEventListener('click', function () { androidPrint(); });

    el.btnShare.addEventListener('click', function () {
      copyText(location.href)
        .then(function () { toast('链接已复制，打开即可还原当前输入'); })
        .catch(function () { toast('复制失败'); });
    });

    el.btnTheme.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('qel-theme', next); } catch (e) { /* 忽略 */ }
      Plot.draw();
      toast(next === 'dark' ? '已切换到深色主题' : '已切换到浅色主题');
    });

    el.btnZoomIn.addEventListener('click', function () { Plot.zoomAt(0.5, 0.5, 1 / 1.25); });
    el.btnZoomOut.addEventListener('click', function () { Plot.zoomAt(0.5, 0.5, 1.25); });
    el.btnReset.addEventListener('click', function () { Plot.fit(); Plot.draw(); toast('已恢复默认视野'); });

    /* 键盘快捷键：焦点不在输入框时生效 */
    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var k = ev.key.toLowerCase();
      if (k === '1' || k === '2' || k === '3' || k === '4') {
        state.form = k === '1' ? 'general' : (k === '2' ? 'vertex' : (k === '3' ? 'factored' : 'points'));
        syncFormTabs(); buildCoefInputs(); update();
      } else if (k === 'r') { Plot.fit(); Plot.draw(); }
      else if (k === 't') { el.btnTheme.click(); }
      else if (k === 'c') { el.btnCopy.click(); }
      else if (k === 'm') { AppMode.set(AppMode.current() === 'quad' ? 'trig' : 'quad'); }
    });
  }

  /* ================= 启动 ================= */

  function cache() {
    el.modeBar = $('mode-bar');
    el.quadApp = $('quad-app');
    el.trigApp = $('trig-app');
    el.formTabs = $('form-tabs');
    el.coefGrid = $('coef-grid');
    el.domainInterval = $('domain-interval');
    el.lval = $('lval'); el.rval = $('rval');
    el.linf = $('linf'); el.rinf = $('rinf');
    el.lb = $('lb'); el.rb = $('rb');
    el.intervalPreview = $('interval-preview');
    el.errSlot = $('err-slot');
    el.rendered = $('rendered');
    el.source = $('source');
    el.viewTabs = $('view-tabs');
    el.chips = $('chips');
    el.tooltip = $('plot-tooltip');
    el.toast = $('toast');
    el.examples = $('examples');
    el.btnCopy = $('btn-copy');
    el.btnDownload = $('btn-download');
    el.btnPrint = $('btn-print');
    el.btnShare = $('btn-share');
    el.btnTheme = $('btn-theme');
    el.btnZoomIn = $('btn-zoom-in');
    el.btnZoomOut = $('btn-zoom-out');
    el.btnReset = $('btn-reset');
  }

  function boot() {
    cache();

    var saved = null;
    try { saved = localStorage.getItem('qel-theme'); } catch (e) { /* 忽略 */ }
    document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');

    EXAMPLES.forEach(function (ex, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = ex.name;
      el.examples.appendChild(o);
    });
    el.examples.selectedIndex = 0;

    var mode = AppMode.detect();
    AppMode.apply(mode);

    var fromHash = (mode === 'quad') ? readHash() : null;
    if (fromHash) applyState(fromHash);

    syncFormTabs();
    buildCoefInputs();
    syncDomainUI();
    Plot.init($('plot'));
    bind();
    update({ skipHash: !!fromHash });

    /* 首帧布局稳定后再画一次，避免容器尺寸尚未确定 */
    window.requestAnimationFrame(function () { Plot.resize(); Plot.fit(); Plot.draw(); });
    window.addEventListener('load', function () { Plot.resize(); Plot.fit(); Plot.draw(); });
  }

  /* ================= 对外 API（桌面版主进程调用 / 网页版调试） ================= */

  window.QuadLab = {
    /** 当前 Markdown 报告；没有有效报告时返回 null */
    getMarkdown: function () {
      return (state.report && state.report.ok) ? state.report.markdown : null;
    },

    /** 当前计算数据（顶点、判别式、最值等），无则返回 null */
    getData: function () {
      return (state.report && state.report.ok) ? state.report.data : null;
    },

    /** 当前输入条件，可原样喂回 setState */
    getState: function () {
      return JSON.parse(JSON.stringify({ form: state.form, values: state.values, domain: state.domain }));
    },

    /** 还原输入条件；成功返回 true */
    setState: function (st) {
      if (!st || typeof st !== 'object') return false;
      if (st.form && !FIELDS[st.form]) return false;
      try {
        applyState(st);
        syncFormTabs();
        buildCoefInputs();
        syncDomainUI();
        update();
        return true;
      } catch (e) { return false; }
    },

    /** 图像画布导出为 PNG dataURL；无图像返回 null */
    getCanvasDataURL: function () {
      if (!Plot.canvas || !Plot.data) return null;
      try {
        /* 临时铺一层背景色，避免导出成透明底 */
        var src = Plot.canvas;
        var out = document.createElement('canvas');
        out.width = src.width; out.height = src.height;
        var ctx = out.getContext('2d');
        var dark = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = dark ? '#1b2027' : '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(src, 0, 0);
        return out.toDataURL('image/png');
      } catch (e) { return null; }
    },

    /** 切换输入形式（供桌面菜单调用） */
    setForm: function (form) {
      if (!FIELDS[form]) return false;
      state.form = form;
      syncFormTabs(); buildCoefInputs(); update();
      return true;
    },

    /** 载入内置示例：delta=+1 下一个，-1 上一个 */
    stepExample: function (delta) {
      var n = EXAMPLES.length;
      if (!n) return false;
      var cur = Number(el.examples.value) || 0;
      var next = ((cur + (delta || 1)) % n + n) % n;
      el.examples.value = String(next);
      var ex = EXAMPLES[next];
      if (!ex) return false;
      applyState(ex.state);
      syncFormTabs(); buildCoefInputs(); syncDomainUI(); update();
      return true;
    },

    /** 复制报告 / 切主题 / 视野操作，供菜单复用同一套逻辑 */
    copyMarkdown: function () { el.btnCopy.click(); },
    toggleTheme: function () { el.btnTheme.click(); },
    resetView: function () { el.btnReset.click(); },
    zoomIn: function () { el.btnZoomIn.click(); },
    zoomOut: function () { el.btnZoomOut.click(); },

    /** 当前图像视野（只读快照）。缩放 / 平移 / 捏合后可用它校验视野是否真的变了 */
    getView: function () {
      return { xMin: Plot.view.xMin, xMax: Plot.view.xMax, yMin: Plot.view.yMin, yMax: Plot.view.yMax };
    },

    /** 报告当前是否可用 */
    isReady: function () { return !!(state.report && state.report.ok); },

    /** 供三角函数工作区复用的提示条 */
    toast: function (msg) { toast(msg); },

    /** 工作区：'quad'（二次函数）或 'trig'（三角函数） */
    setMode: function (mode) { return AppMode.set(mode); },
    getMode: function () { return AppMode.current(); },

    version: '1.4.0'
  };

  /* ================= 桌面版菜单事件 ================= */

  function bindDesktop() {
    if (!Desktop) return;
    document.documentElement.classList.add('is-desktop');
    var map = {
      'menu:mode-quad': function () { window.QuadLab.setMode('quad'); },
      'menu:mode-trig': function () { window.QuadLab.setMode('trig'); },
      'menu:form-general': function () { window.QuadLab.setForm('general'); },
      'menu:form-vertex': function () { window.QuadLab.setForm('vertex'); },
      'menu:form-factored': function () { window.QuadLab.setForm('factored'); },
      'menu:form-points': function () { window.QuadLab.setForm('points'); },
      'menu:example-prev': function () { window.QuadLab.stepExample(-1); },
      'menu:example-next': function () { window.QuadLab.stepExample(1); },
      'menu:theme': function () { window.QuadLab.toggleTheme(); },
      'menu:reset-view': function () { window.QuadLab.resetView(); },
      'menu:zoom-in': function () { window.QuadLab.zoomIn(); },
      'menu:zoom-out': function () { window.QuadLab.zoomOut(); }
    };
    Object.keys(map).forEach(function (ch) { Desktop.on(ch, map[ch]); });

    /* 桌面版：把浏览器语义的按钮换成原生文件对话框 */
    el.btnDownload.title = '导出 Markdown 文件（Ctrl+S）';
    el.btnPrint.title = '导出 PDF（Ctrl+P）';
    el.btnShare.textContent = '导出图像';
    el.btnShare.title = '把当前函数图像导出为 PNG（Ctrl+Shift+E）';

    el.btnDownload.addEventListener('click', function () { saveText({
      title: '导出 Markdown 报告',
      defaultPath: '二次函数解析报告.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }, { name: '纯文本', extensions: ['txt'] }],
      content: (state.report && state.report.ok) ? state.report.markdown : ''
    }); });

    el.btnShare.addEventListener('click', function () { exportPng(); });

    var loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'btn btn-sm';
    loadBtn.textContent = '载入数据';
    loadBtn.title = '从 JSON 还原输入条件（Ctrl+O）';
    loadBtn.addEventListener('click', function () { loadJson(); });
    el.btnShare.parentNode.insertBefore(loadBtn, el.btnShare);
  }

  /* ================= Android 原生桥 ================= */

  /**
   * 保存文件到 Android 的「下载」目录。
   * @param {string} name       文件名
   * @param {string} mime       MIME 类型
   * @param {string} content    文本内容，或已经是 Base64 的二进制
   * @param {boolean} isBase64  第三项是否已经是 Base64
   */
  function androidSave(name, mime, content, isBase64) {
    if (!Android || typeof Android.saveFile !== 'function') { toast('当前环境不支持导出'); return; }
    var b64 = isBase64 ? content : utf8ToBase64(content);
    try {
      Android.saveFile(name, mime, b64);
      toast('正在保存 ' + name);
    } catch (e) {
      toast('导出失败');
    }
  }

  /** 打印 / 导出 PDF：Android 走系统的打印框架（可选「另存为 PDF」） */
  function androidPrint() {
    if (Android && typeof Android.printPage === 'function') { Android.printPage(); return; }
    window.print();
  }

  /**
   * Android 壳里的按钮适配。
   * 与桌面版一样，把浏览器语义的按钮换成原生语义：
   * 「分享链接」在 APK 里没有意义（链接指向 file:///android_asset），改成导出图像。
   */
  function bindAndroid() {
    if (!Android) return;
    document.documentElement.classList.add('is-android');

    el.btnDownload.title = '保存 Markdown 报告到「下载」目录';
    el.btnPrint.title = '打印或另存为 PDF';
    el.btnShare.textContent = '导出图像';
    el.btnShare.title = '把当前函数图像保存为 PNG';

    el.btnShare.addEventListener('click', function () { exportPng(); });

    /* Android 也补上「载入数据」：原生侧实现了 onShowFileChooser，能弹系统文件选择器 */
    var loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'btn btn-sm';
    loadBtn.textContent = '载入数据';
    loadBtn.title = '从 JSON 还原输入条件';
    loadBtn.addEventListener('click', function () { loadJson(); });
    el.btnShare.parentNode.insertBefore(loadBtn, el.btnShare);
  }

  /* ================= 桌面版文件读写 ================= */

  /** 交给主进程弹原生保存对话框；没有内容时给出提示 */
  function saveText(payload) {
    if (!payload.content) { toast('当前没有可导出的内容'); return; }
    Desktop.saveText(payload).then(function (r) {
      if (r && r.ok) toast('已保存：' + r.filePath);
    }).catch(function () { toast('保存失败'); });
  }

  /** 导出图像 PNG：浏览器版走下载，桌面版走原生对话框，Android 走 MediaStore */
  function exportPng() {
    var url = window.QuadLab.getCanvasDataURL();
    if (!url) { toast('当前没有可导出的图像'); return; }
    if (Android) {
      androidSave('二次函数图像.png', 'image/png', url.replace(/^data:image\/png;base64,/, ''), true);
      return;
    }
    if (!Desktop) {
      var a = document.createElement('a');
      a.href = url; a.download = '二次函数图像.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast('已导出函数图像');
      return;
    }
    var b64 = url.replace(/^data:image\/png;base64,/, '');
    Desktop.saveText({
      title: '导出函数图像',
      defaultPath: '二次函数图像.png',
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      base64: b64
    }).then(function (r) { if (r && r.ok) toast('已保存：' + r.filePath); });
  }

  /** 从 JSON 还原输入条件 */
  function loadJson() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var ok = false;
        try { ok = window.QuadLab.setState(JSON.parse(String(fr.result))); } catch (e) { ok = false; }
        toast(ok ? '已载入输入数据' : '文件格式不符合本工具的输入结构');
      };
      fr.readAsText(f, 'utf-8');
    });
    inp.click();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(); bindDesktop(); bindAndroid(); });
  else { boot(); bindDesktop(); bindAndroid(); }
})();
