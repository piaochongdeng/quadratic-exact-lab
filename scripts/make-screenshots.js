/* 官网截图：用 Electron 把真实界面拍成高清图（2 倍像素密度），供 docs/ 官网页面使用。
 *
 *   node_modules\electron\dist\electron.exe scripts\make-screenshots.js
 *
 * 产物：docs/screens/*.png（原图，随后由 scripts/optimize-screens.py 转 webp）
 *       docs/screens/shots.json（每张图的尺寸与滚动位置，官网据此排版）
 *
 * 注意两点（都是踩过的坑）：
 *  1) force-device-scale-factor=2 之后，setContentSize 收的是 CSS 像素，
 *     截出来是 2 倍物理像素。所以想要 1440 宽的布局就传 1440。
 *  2) 页面是「整页滚动」而不是面板内部滚动（.col-right 里的报告面板在图像面板下方），
 *     想拍报告就得 window.scrollTo。
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screens');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '2');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 每个镜头：CSS 像素尺寸 + 要做的操作 + 滚动目标 */
const SHOTS = [
  {
    name: 'desktop-quad',
    width: 1440, height: 980,
    scroll: 0,
    async run(win) {
      await win.webContents.executeJavaScript(`(function(){
        window.QuadLab.setMode('quad');
        window.QuadLab.setState({
          form: 'general',
          values: { general: { a: '-1/6', b: '1/6', c: '11/24' } },
          domain: { mode: 'all' }
        });
        return true;
      })()`);
    }
  },
  {
    name: 'desktop-quad-report',
    width: 1440, height: 980,
    scroll: 'report',
    async run(win) { /* 沿用上一镜头的状态 */ }
  },
  /* 深色版：官网首屏 hero 是深色底，配深色截图才融为一体 */
  {
    name: 'desktop-quad-dark',
    width: 1440, height: 980,
    theme: 'dark',
    scroll: 0,
    async run(win) {
      await win.webContents.executeJavaScript(`(function(){
        window.QuadLab.setMode('quad');
        window.QuadLab.setState({
          form: 'general',
          values: { general: { a: '-1/6', b: '1/6', c: '11/24' } },
          domain: { mode: 'all' }
        });
        return true;
      })()`);
    }
  },
  {
    name: 'desktop-quad-report-dark',
    width: 1440, height: 980,
    theme: 'dark',
    scroll: 'report',
    async run(win) { /* 沿用上一镜头的状态 */ }
  },
  {
    name: 'desktop-interval',
    width: 1440, height: 980,
    scroll: 0,
    async run(win) {
      await win.webContents.executeJavaScript(`(function(){
        window.QuadLab.setMode('quad');
        window.QuadLab.setState({
          form: 'general',
          values: { general: { a: '-1/2', b: '1', c: '3/2' } },
          domain: { mode: 'interval', left: { value: '-1', open: false }, right: { value: '3', open: false } }
        });
        return true;
      })()`);
    }
  },
  {
    name: 'desktop-trig',
    width: 1440, height: 980,
    scroll: 0,
    async run(win) {
      await win.webContents.executeJavaScript(`(function(){
        window.QuadLab.setMode('trig');
        window.TrigLab.setState({ fn: 'tan', valueSource: 'auto', angle: '60', sideKind: 'adjacent', side: '2', digits: 4 });
        return true;
      })()`);
    }
  },
  {
    name: 'desktop-settings',
    width: 1440, height: 980, modal: true,
    scroll: 0,
    async run(win) {
      await win.webContents.executeJavaScript(`(function(){
        window.QuadLab.setMode('quad');
        window.QuadLab.openSettings();
        return true;
      })()`);
    }
  },
  {
    name: 'desktop-help',
    width: 1440, height: 980, modal: true,
    scroll: 0,
    async run(win) {
      await win.webContents.executeJavaScript(`(function(){
        window.QuadLab.closeSettings();
        window.QuadLab.openHelp();
        return true;
      })()`);
    }
  },
  {
    name: 'phone-quad',
    width: 390, height: 844,
    scroll: 0,
    async run(win) {
      await win.webContents.executeJavaScript(`(function(){
        window.QuadLab.closeHelp();
        window.QuadLab.setMode('quad');
        window.QuadLab.setState({
          form: 'general',
          values: { general: { a: '-1/6', b: '1/6', c: '11/24' } },
          domain: { mode: 'all' }
        });
        return true;
      })()`);
    }
  },
  {
    name: 'phone-quad-dark',
    width: 391, height: 845,
    theme: 'dark',
    scroll: 0,
    async run(win) {
      await win.webContents.executeJavaScript(`(function(){
        window.QuadLab.setMode('quad');
        window.QuadLab.setState({
          form: 'general',
          values: { general: { a: '-1/6', b: '1/6', c: '11/24' } },
          domain: { mode: 'all' }
        });
        return true;
      })()`);
    }
  },
  {
    name: 'phone-report',
    width: 390, height: 844,
    scroll: 'report',
    async run(win) { /* 沿用 */ }
  },
  {
    name: 'phone-trig',
    width: 390, height: 844,
    scroll: 0,
    async run(win) {
      await win.webContents.executeJavaScript(`(function(){
        window.QuadLab.setMode('trig');
        window.TrigLab.setState({ fn: 'tan', valueSource: 'user', angle: '', value: '3/4', sideKind: 'opposite', side: '6', digits: 4 });
        return true;
      })()`);
    }
  }
];

/* 滚到报告区；返回实际滚动位置 */
async function scrollToReport(win) {
  return win.webContents.executeJavaScript(`(function(){
    var panel = null;
    var heads = document.querySelectorAll('.col-right .panel');
    for (var i = 0; i < heads.length; i++) {
      if (/报告/.test(heads[i].textContent.slice(0, 60))) { panel = heads[i]; break; }
    }
    if (!panel) panel = document.querySelectorAll('.col-right .panel')[1];
    if (!panel) return -1;
    var y = panel.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo(0, Math.max(0, y));
    return Math.round(window.scrollY);
  })()`);
}

async function diagnose(win) {
  return win.webContents.executeJavaScript(`(function(){
    var out = {};
    var plot = document.getElementById('plot');
    if (plot) {
      var r = plot.getBoundingClientRect();
      out.plot = { w: Math.round(r.width), h: Math.round(r.height), bufW: plot.width, bufH: plot.height, visible: r.width > 10 };
    }
    var tri = document.getElementById('tri-plot');
    if (tri) { var t = tri.getBoundingClientRect(); out.tri = { w: Math.round(t.width), h: Math.round(t.height), visible: t.width > 10 }; }
    /* 画布在视口里的位置（CSS 像素），截图后按这个矩形抽查像素 */
    if (plot) {
      var pr = plot.getBoundingClientRect();
      out.plotRect = { x: Math.round(pr.left), y: Math.round(pr.top), w: Math.round(pr.width), h: Math.round(pr.height) };
      /* 包着画布的那张卡片整体（含标题、缩放按钮、图例），首屏特写按它裁 */
      var panel = plot.closest('.panel');
      if (panel) {
        var pn = panel.getBoundingClientRect();
        out.plotPanel = { x: Math.round(pn.left), y: Math.round(pn.top),
                          w: Math.round(pn.width), h: Math.round(pn.height) };
      }
    }
    out.innerH = window.innerHeight;
    out.smooth = getComputedStyle(document.documentElement).scrollBehavior;
    out.doc = { clientH: document.documentElement.clientHeight, scrollH: document.documentElement.scrollHeight };
    out.scrollY = Math.round(window.scrollY);
    out.katexErrors = document.querySelectorAll('.katex-error').length;
    out.mdLen = (window.QuadLab.getMarkdown() || '').length;
    return out;
  })()`);
}

/* 逼窗口重绘一次：改一下不影响观感的样式，再等一个 rAF 回来 */
async function forceRepaint(win) {
  await win.webContents.executeJavaScript(`new Promise(function(res){
    var d = document.documentElement;
    d.style.willChange = 'transform';
    void d.offsetHeight;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      d.style.willChange = '';
      res(true);
    }); });
  })`);
}

/* 画布区域是不是一片纯色（=没画东西）。rect 是 CSS 像素，图片是 2 倍像素。 */
function canvasLooksBlank(img, rect) {
  if (!rect || rect.w < 10 || rect.h < 10) return null;
  if (rect.y + rect.h < 0 || rect.y > img.getSize().height) return 'offscreen';
  const x = Math.max(0, Math.round(rect.x * 2));
  const y = Math.max(0, Math.round(rect.y * 2));
  const w = Math.min(img.getSize().width - x, Math.round(rect.w * 2));
  const h = Math.min(img.getSize().height - y, Math.round(rect.h * 2));
  if (w < 8 || h < 8) return 'offscreen';
  try {
    const bmp = img.crop({ x, y, width: w, height: h }).getBitmap();
    let n = 0, sum = 0, sum2 = 0;
    for (let i = 0; i < bmp.length; i += 4) {
      const v = (bmp[i] + bmp[i + 1] + bmp[i + 2]) / 3;
      sum += v; sum2 += v * v; n++;
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    return sd < 4 ? `纯色(均值${mean.toFixed(0)})` : null;
  } catch (e) {
    return '抽样失败:' + e.message;
  }
}

async function shoot(win, shot) {
  await win.setContentSize(shot.width, shot.height);
  await wait(800);

  /* 主题按镜头切：官网首屏要深色图（配深色 hero 才不刺眼）。
     只改 data-theme 不会重绘画布，所以下面还要再走一次 setState 逼它重画。 */
  const theme = shot.theme || 'light';
  await win.webContents.executeJavaScript(
    "(function(){document.documentElement.setAttribute('data-theme','" + theme + "');return true;})()");
  await wait(200);

  if (shot.run) await shot.run(win);
  await wait(1000);

  /* 每张图都必须显式设定滚动位置：镜头之间窗口是同一个，
     上一张滚到哪儿、这一张就还在哪儿（踩过）。 */
  if (shot.scroll === 'report') {
    const y = await scrollToReport(win);
    if (y < 0) throw new Error(shot.name + '：找不到报告面板');
  } else {
    await win.webContents.executeJavaScript('window.scrollTo(0,' + (Number(shot.scroll) || 0) + ')');
  }
  /* 隐藏窗口的合成会被节流，滚动之后 capturePage 有可能拿到上一帧
     （踩过：切回顶部后拍出来的还是滚动前的画面）。这里强制重绘并等一拍。 */
  await wait(400);
  await forceRepaint(win);
  await wait(900);

  const diag = await diagnose(win);
  const img = await win.webContents.capturePage();
  /* 画布区域抽查：如果这块区域是纯色，说明画布没画出来 */
  diag.canvasBlank = canvasLooksBlank(img, diag.plotRect);
  const png = img.toPNG();
  const file = path.join(OUT, shot.name + '.png');
  fs.writeFileSync(file, png);
  const size = img.getSize();

  const warn = [];
  if (!shot.modal) {
    if (shot.name.indexOf('trig') >= 0) {
      if (!diag.tri || !diag.tri.visible) warn.push('三角画布不可见');
    } else if (!diag.plot || !diag.plot.visible) {
      warn.push('画布不可见');
    }
  }
  if (diag.katexErrors) warn.push('KaTeX 错误 ' + diag.katexErrors);
  if (diag.canvasBlank && diag.canvasBlank !== 'offscreen') warn.push('画布空白（' + diag.canvasBlank + '）');
  if (diag.mdLen < 200) warn.push('报告过短 ' + diag.mdLen);

  console.log('  ' + shot.name.padEnd(22) + size.width + '×' + size.height +
    '  scrollY=' + String(diag.scrollY).padStart(5) +
    '  文档高=' + diag.doc.scrollH +
    '  ' + Math.round(png.length / 1024) + 'KB' +
    (warn.length ? '   ⚠ ' + warn.join('，') : ''));
  return { name: shot.name, w: size.width, h: size.height, cssW: shot.width, cssH: shot.height,
    theme: shot.theme || 'light', scrollY: diag.scrollY, docH: diag.doc.scrollH,
    plotPanel: diag.plotPanel || null, plotRect: diag.plotRect || null,
    bytes: png.length, warn };
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1440, height: 980, show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(ROOT, 'desktop', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  const errs = [];
  win.webContents.on('console-message', (e, level, msg) => {
    if (level >= 2 && !/Content-Security-Policy|Electron Security Warning/.test(msg)) errs.push(msg);
  });

  try { win.webContents.setBackgroundThrottling(false); } catch (e) {}
  try { await require('electron').session.defaultSession.clearStorageData({ storages: ['localstorage'] }); } catch (e) {}

  await win.loadFile(path.join(ROOT, 'index.html'));
  await wait(2600);

  /* 统一浅色主题 + 完整报告：官网配图要的是信息量最大的那一种 */
  await win.webContents.executeJavaScript(`(function(){
    try { localStorage.setItem('qel-settings', JSON.stringify({ decimals: 4, detail: 'full', theme: 'light', boot: 'keep' })); } catch (e) {}
    return true;
  })()`);
  await win.reload();
  await wait(2800);

  console.log('\n拍摄中（CSS 尺寸 / 2 倍物理像素）…');
  const results = [];
  for (const shot of SHOTS) results.push(await shoot(win, shot));

  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(results, null, 2));

  const bad = results.filter((r) => r.warn.length);
  console.log('\n控制台错误：' + (errs.length ? errs.length + ' 条\n  ' + errs.join('\n  ') : '无'));
  console.log('异常镜头：' + (bad.length ? bad.map((b) => b.name + '(' + b.warn.join('、') + ')').join('；') : '无'));
  console.log('已写入 ' + path.relative(ROOT, OUT));
  app.exit(bad.length || errs.length ? 1 : 0);
}).catch((err) => { console.error('截图失败：', err); app.exit(1); });
