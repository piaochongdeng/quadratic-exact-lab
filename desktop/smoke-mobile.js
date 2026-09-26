/* 移动端 / 吸顶回归测试（Electron 真实窗口 + 真实滚动 + 真实触摸事件）
 *
 * 覆盖：
 *   1. 吸顶回归：滚动后页头与工作区切换条不重叠，切换条可见且可点
 *      （v1.3.0 两者各自 sticky，页头 z-index 更高把切换条整条盖住）
 *   2. 手机竖屏（390 × 844）触控目标 ≥ 44 px
 *   3. 输入框字号 ≥ 16 px（防 iOS / Android 聚焦自动放大）
 *   4. 多宽度无横向溢出（含 320 / 360 超窄屏）
 *   5. 二次函数画布双指捏合缩放（合成 TouchEvent 驱动真实处理器）
 *
 * 用法： node_modules\electron\dist\electron.exe desktop/smoke-mobile.js
 */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'smoke-mobile-result.json');
app.disableHardwareAcceleration();

/* 在渲染进程里跑的检测脚本 */
const SCRIPT = `(async function () {
  var out = {};
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function q(id) { return document.getElementById(id); }
  function rect(sel) { var e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; }
  function overlap(a, b) {
    if (!a || !b) return 0;
    return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }

  /* 让窗口尺寸生效后再继续 */
  await sleep(260);
  window.QuadLab.setMode('quad');
  await sleep(200);

  /* ---------- 1. 吸顶重叠（回归 5.1） ---------- */
  window.scrollTo(0, 0);
  await sleep(80);
  window.scrollTo(0, 900);
  await sleep(220);

  var head = rect('.app-header');
  var bar = rect('.mode-bar');
  var scrollY = window.scrollY || window.pageYOffset;
  out.scrollY = scrollY;
  out.headerRect = head ? { top: head.top, bottom: head.bottom, height: head.height } : null;
  out.barRect = bar ? { top: bar.top, bottom: bar.bottom, height: bar.height } : null;
  out.overlap = Math.round(overlap(head, bar) * 100) / 100;

  /* 切换条是否真的可见：拿它的中心点做命中测试 */
  if (bar && bar.height > 0) {
    var cx = bar.left + bar.width / 2;
    var cy = bar.top + bar.height / 2;
    var hit = document.elementFromPoint(cx, cy);
    var barEl = document.querySelector('.mode-bar');
    out.barHitTag = hit ? (hit.tagName + '.' + (hit.className || '')) : null;
    out.barHitInsideBar = !!(hit && barEl.contains(hit));
    out.barCenterY = Math.round(cy);
    out.viewportH = window.innerHeight;
    out.barWithinViewport = cy >= 0 && cy <= window.innerHeight;
  } else {
    out.barHitInsideBar = false;
    out.barWithinViewport = false;
  }

  /* 真点一下滚动后的切换条，确认能切到三角函数工作区 */
  var trigBtn = document.querySelector('.mode-bar [data-mode="trig"]');
  if (trigBtn) {
    var tb = trigBtn.getBoundingClientRect();
    var el2 = document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2);
    out.trigBtnReachable = !!(el2 && (el2 === trigBtn || trigBtn.contains(el2)));
    trigBtn.click();
    await sleep(200);
    out.modeAfterClick = window.QuadLab.getMode();
    window.QuadLab.setMode('quad');
    await sleep(200);
  } else {
    out.trigBtnReachable = false;
  }

  /* ---------- 2. 触控目标尺寸 ---------- */
  window.scrollTo(0, 0);
  await sleep(120);
  /* 切到「自定义区间」，否则定义域那一排控件是 display:none，量到 0 */
  var intervalRadio = document.querySelector('.radio-row input[value="interval"]');
  if (intervalRadio) { intervalRadio.checked = true; intervalRadio.dispatchEvent(new Event('change', { bubbles: true })); }
  await sleep(160);

  var SEL = ['.header-actions .btn', '.mode-bar button', '.segmented button', '.bracket-btn', '.inf-toggle', '.radio-pill', '.view-tabs button', '.plot-toolbar .btn', 'input[type="text"]', 'select'];
  out.touchTargets = {};
  out.smallTargets = [];
  var smallest = Infinity;
  SEL.forEach(function (s) {
    var e = document.querySelector(s);
    if (!e) { out.touchTargets[s] = null; return; }
    var r = e.getBoundingClientRect();
    var o = { w: Math.round(r.width), h: Math.round(r.height) };
    out.touchTargets[s] = o;
    if (r.height > 0) {
      if (r.height < smallest) smallest = r.height;
      if (r.height < 44) out.smallTargets.push(s + '=' + o.h);
    }
  });
  out.smallestTargetH = smallest === Infinity ? 0 : smallest;

  /* ---------- 3. 输入框字号 ---------- */
  var inp = q('lval');
  var sel = q('examples');
  out.inputFontSize = parseFloat(getComputedStyle(inp).fontSize);
  out.selectFontSize = parseFloat(getComputedStyle(sel).fontSize);
  out.inputHeight = Math.round(inp.getBoundingClientRect().height);

  /* ---------- 4. 页头高度（窄屏瘦身） ---------- */
  out.headerHeight = Math.round(rect('.app-header').height);
  out.dockHeight = Math.round(rect('.top-dock').height);

  /* 切换条是否需要横向滚动（短标签应该能一屏放下） */
  var barEl2 = q('mode-bar');
  out.modeBarScroll = barEl2.scrollWidth - barEl2.clientWidth;
  out.modeBarLabel = (document.querySelector('.mode-bar .mode-short') && getComputedStyle(document.querySelector('.mode-bar .mode-short')).display !== 'none') ? 'short' : 'long';

  /* ---------- 5. 无横向溢出 ---------- */
  out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  /* ---------- 6. 双指捏合缩放 ---------- */
  var canvas = q('plot');
  function touch(id, x, y) {
    return new Touch({ identifier: id, target: canvas, clientX: x, clientY: y, pageX: x, pageY: y });
  }
  function fire(type, touches) {
    canvas.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, touches: touches, targetTouches: touches, changedTouches: touches
    }));
  }
  function mid() { var r = canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  var v0 = window.QuadLab.getView();
  var m = mid();
  /* 两指相距 100 px → 相距 200 px（张开 = 放大 = 视野范围缩小） */
  fire('touchstart', [touch(1, m.x - 50, m.y), touch(2, m.x + 50, m.y)]);
  fire('touchmove', [touch(1, m.x - 100, m.y), touch(2, m.x + 100, m.y)]);
  await sleep(60);
  var v1 = window.QuadLab.getView();
  fire('touchend', []);
  await sleep(60);

  out.viewBefore = v0;
  out.viewAfterPinchOut = v1;
  out.pinchOutSpanBefore = v0.xMax - v0.xMin;
  out.pinchOutSpanAfter = v1.xMax - v1.xMin;
  out.pinchZoomedIn = (v1.xMax - v1.xMin) < (v0.xMax - v0.xMin) * 0.9;

  /* 反方向：捏合（两指靠拢）= 缩小 = 视野范围变大 */
  var v2 = window.QuadLab.getView();
  var m2 = mid();
  fire('touchstart', [touch(3, m2.x - 100, m2.y), touch(4, m2.x + 100, m2.y)]);
  fire('touchmove', [touch(3, m2.x - 40, m2.y), touch(4, m2.x + 40, m2.y)]);
  await sleep(60);
  var v3 = window.QuadLab.getView();
  fire('touchend', []);
  await sleep(60);
  out.pinchZoomedOut = (v3.xMax - v3.xMin) > (v2.xMax - v2.xMin) * 1.1;
  out.pinchSpanBefore = v2.xMax - v2.xMin;
  out.pinchSpanAfter = v3.xMax - v3.xMin;

  /* 单指触摸不该被捏合逻辑吃掉（仍是平移，不报错） */
  window.QuadLab.resetView();
  await sleep(60);
  var v4 = window.QuadLab.getView();
  fire('touchstart', [touch(5, m.x, m.y)]);
  fire('touchmove', [touch(5, m.x + 30, m.y)]);
  fire('touchend', []);
  await sleep(60);
  var v5 = window.QuadLab.getView();
  out.singleTouchKeepsView = Math.abs((v5.xMax - v5.xMin) - (v4.xMax - v4.xMin)) < 1e-9;

  /* ---------- 7. 两个工作区在手机尺寸下都能正常渲染 ---------- */
  out.quadCanvas = { w: canvas.width, h: canvas.height };
  out.quadCanvasNonBlank = canvas.toDataURL('image/png').length > 2000;

  window.QuadLab.setMode('trig');
  await sleep(400);
  var tri = q('tri-plot'), uni = q('unit-plot');
  out.trigOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  out.triCanvas = { w: tri.width, h: tri.height };
  out.unitCanvas = { w: uni.width, h: uni.height };
  out.triNonBlank = tri.toDataURL('image/png').length > 2000;
  out.unitNonBlank = uni.toDataURL('image/png').length > 2000;
  window.QuadLab.setMode('quad');
  await sleep(200);

  return out;
})()`;

/* 逐个尺寸跑一遍：每个尺寸一个窗口 */
const SIZES = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-small', width: 320, height: 640 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 }
];

app.whenReady().then(async () => {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform }));
  ipcMain.handle('app:save-text', () => ({ ok: false, canceled: true }));

  const result = { sizes: {} };
  const allErrors = [];

  /* 只开一个窗口，逐个尺寸改大小。
     实测：destroy() 之后立刻新建窗口再 loadFile 会 ERR_FAILED(-2)，
     同一个窗口 setContentSize 更稳，也更贴近「用户转屏」的真实场景。 */
  const win = new BrowserWindow({
    width: SIZES[0].width, height: SIZES[0].height, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  const errs = [];
  win.webContents.on('console-message', (e, level, msg) => { if (level >= 2) errs.push(msg); });
  win.webContents.on('render-process-gone', (e, d) => errs.push('render-process-gone: ' + JSON.stringify(d)));

  await win.loadFile(path.join(ROOT, 'index.html'));
  await new Promise((r) => setTimeout(r, 1800));

  for (const s of SIZES) {
    win.setContentSize(s.width, s.height);
    await new Promise((r) => setTimeout(r, 500));

    const before = errs.length;
    const one = await win.webContents.executeJavaScript(SCRIPT);
    one.innerWidth = win.getContentBounds().width;
    one.innerHeight = win.getContentBounds().height;
    one.consoleErrors = errs.slice(before);
    result.sizes[s.name] = one;
    if (one.consoleErrors.length) allErrors.push(s.name + ': ' + JSON.stringify(one.consoleErrors));
  }
  win.destroy();

  result.consoleErrors = allErrors;
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  app.exit(0);
}).catch((e) => {
  fs.writeFileSync(OUT, JSON.stringify({ fatal: String((e && e.stack) || e) }, null, 2), 'utf8');
  console.error('FATAL', e);
  app.exit(1);
});
