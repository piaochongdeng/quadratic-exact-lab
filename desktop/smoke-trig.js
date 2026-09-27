/* 三角函数工作区回归测试（Electron 真实 DOM + 真实输入）
 *
 * 覆盖：
 *   · 工作区切换（M / 按钮 / hash 前缀 trig:）
 *   · 特殊角给出精确值、非特殊角给出近似值
 *   · 用户自填函数值反推（有理数 → 精确；无理数 → 近似）
 *   · 已知一条边求另外两条边、面积、周长
 *   · 等比缩放：超大 / 超小数值都能画进画布，画布尺寸不变
 *   · 小数精度可自定义且影响报告
 *
 * 用法： node_modules\electron\dist\electron.exe desktop/smoke-trig.js
 */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'smoke-trig-result.json');
app.disableHardwareAcceleration();

const SCRIPT = `(async function () {
  var out = {};
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function q(id) { return document.getElementById(id); }
  function setText(input, text) {
    input.focus();
    if (input.select) input.select();
    document.execCommand('insertText', false, text);
    return { focused: document.activeElement === input, value: input.value };
  }
  function clearText(input) {
    input.focus();
    if (input.select) input.select();
    document.execCommand('insertText', false, '');
  }
  function clickTab(container, attr, val) {
    var b = container.querySelector('[data-' + attr + '="' + val + '"]');
    b.click();
    return !!b;
  }

  /* ---------- 0. 先回到二次函数工作区，确认两个工作区能来回切 ---------- */
  window.QuadLab.setMode('quad');
  await sleep(220);
  out.quadVisible = !q('quad-app').hidden;
  out.trigHidden = q('trig-app').hidden;
  out.quadCanvasWidth = q('plot').width;

  /* ---------- 1. 切到三角函数工作区 ---------- */
  out.switchOk = window.QuadLab.setMode('trig') === 'trig';
  out.modeAfterSwitch = window.QuadLab.getMode();
  out.trigVisible = !q('trig-app').hidden;
  out.quadHidden = q('quad-app').hidden;
  out.modeBarSelected = document.querySelector('#mode-bar [data-mode="trig"]').getAttribute('aria-selected');
  await sleep(300);

  /* ---------- 2. 默认输入：30° / 对边 3 → 3-3√3-6 ---------- */
  out.ready = window.TrigLab.isReady();
  out.readyAfter = window.TrigLab.ready();
  var d = window.TrigLab.getData();
  out.defSin = d.ratio.sin.plain;
  out.defCos = d.ratio.cos.plain;
  out.defTan = d.ratio.tan.plain;
  out.defExact = d.exact;
  out.defO = d.tri.o.plain;
  out.defA = d.tri.a.plain;
  out.defH = d.tri.h.plain;
  out.defArea = d.tri.area.plain;
  out.defPerim = d.tri.perimeter.plain;
  out.mdHasSqrt3Over3 = window.TrigLab.getMarkdown().indexOf('\\\\frac{\\\\sqrt{3}}{3}') >= 0;
  out.mdHasSimplest = window.TrigLab.getMarkdown().indexOf('\\\\sqrt{12}') < 0;

  /* ---------- 3. 两张画布都有内容，且尺寸正常 ---------- */
  var tri = q('tri-plot'), unit = q('unit-plot');
  out.triCanvas = { w: tri.width, h: tri.height };
  out.unitCanvas = { w: unit.width, h: unit.height };
  out.triNonBlank = (function () {
    var ctx = tri.getContext('2d');
    var img = ctx.getImageData(0, 0, tri.width, tri.height).data;
    var seen = {};
    for (var i = 0; i < img.length; i += 4 * 97) seen[img[i] + ',' + img[i+1] + ',' + img[i+2]] = 1;
    return Object.keys(seen).length > 2;
  })();
  out.unitNonBlank = (function () {
    var ctx = unit.getContext('2d');
    var img = ctx.getImageData(0, 0, unit.width, unit.height).data;
    var seen = {};
    for (var i = 0; i < img.length; i += 4 * 97) seen[img[i] + ',' + img[i+1] + ',' + img[i+2]] = 1;
    return Object.keys(seen).length > 2;
  })();

  /* ---------- 4. 真实输入：改成 37° 的斜边 5（非特殊角） ---------- */
  clickTab(q('trig-fn-tabs'), 'fn', 'sin');
  clickTab(q('trig-src-tabs'), 'src', 'auto');
  await sleep(60);
  out.angleRowVisible = q('trig-angle-row').style.display !== 'none';
  clearText(q('trig-angle'));
  out.angleTyped = setText(q('trig-angle'), '37');
  await sleep(320);
  q('trig-side-kind').value = 'hypotenuse';
  q('trig-side-kind').dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(60);
  clearText(q('trig-side'));
  out.sideTyped = setText(q('trig-side'), '5');
  await sleep(320);
  out.ready37 = window.TrigLab.isReady();
  var d37 = window.TrigLab.getData();
  out.d37Exact = d37.exact;
  out.d37Sin = d37.ratio.sin.num;
  out.d37H = d37.tri.h.num;
  out.d37O = d37.tri.o.num;
  out.d37A = d37.tri.a.num;
  out.md37HasApprox = /近似/.test(window.TrigLab.getMarkdown());
  out.md37HasNoExactClaim = window.TrigLab.getMarkdown().indexOf('全部是精确值') < 0;

  /* ---------- 5. 用户自填 sinθ = 0.6 → 精确 4/5 与 3/4 ---------- */
  clickTab(q('trig-src-tabs'), 'src', 'user');
  await sleep(60);
  out.valueRowVisible = q('trig-value-row').style.display !== 'none';
  clearText(q('trig-value'));
  out.valueTyped = setText(q('trig-value'), '0.6');
  await sleep(320);
  q('trig-side-kind').value = 'hypotenuse';
  q('trig-side-kind').dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(60);
  clearText(q('trig-side'));
  setText(q('trig-side'), '10');
  await sleep(320);
  var d6 = window.TrigLab.getData();
  out.ready06 = window.TrigLab.isReady();
  out.d6Exact = d6.exact;
  out.d6Cos = d6.ratio.cos.plain;
  out.d6Tan = d6.ratio.tan.plain;
  out.d6O = d6.tri.o.plain;
  out.d6A = d6.tri.a.plain;
  out.d6H = d6.tri.h.plain;
  out.md06HasFraction = window.TrigLab.getMarkdown().indexOf('\\\\frac{4}{5}') >= 0;

  /* ---------- 6. 用户自填无理数 → 按精度近似 ---------- */
  clearText(q('trig-value'));
  setText(q('trig-value'), '0.7071067812');
  await sleep(320);
  var d7 = window.TrigLab.getData();
  out.d7Exact = d7.exact;
  out.d7Source = d7.source;
  out.d7Tan = d7.ratio.tan.num;

  /* ---------- 7. 小数精度可自定义 ---------- */
  var digits = q('trig-digits');
  digits.value = '2';
  digits.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(320);
  out.digits2 = window.TrigLab.getData().digits;
  out.mdDigits2 = /小数点后 \\$2\\$ 位/.test(window.TrigLab.getMarkdown());
  out.d7TanDigits2 = window.TrigLab.getData().ratio.tan.num;
  digits.value = '10';
  digits.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(320);
  out.digits10 = window.TrigLab.getData().digits;
  digits.value = '4';
  digits.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(320);
  out.digitsBack = window.TrigLab.getData().digits;

  /* ---------- 8. 等比缩放：3 与 3000000 画出来一样大 ---------- */
  clickTab(q('trig-src-tabs'), 'src', 'auto');
  await sleep(60);
  clearText(q('trig-angle'));
  setText(q('trig-angle'), '30');
  await sleep(320);
  q('trig-side-kind').value = 'hypotenuse';
  q('trig-side-kind').dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(60);
  clearText(q('trig-side'));
  setText(q('trig-side'), '3');
  await sleep(320);
  var imgA = tri.toDataURL('image/png');
  var dSmall = window.TrigLab.getData();
  out.scaleSmall = { o: dSmall.tri.o.num, h: dSmall.tri.h.num };
  clearText(q('trig-side'));
  setText(q('trig-side'), '3000000');
  await sleep(320);
  var dBig = window.TrigLab.getData();
  out.scaleBig = { o: dBig.tri.o.num, h: dBig.tri.h.num };
  out.scaleRatioConsistent = Math.abs((dBig.tri.o.num / dBig.tri.h.num) - (dSmall.tri.o.num / dSmall.tri.h.num)) < 1e-9;
  out.canvasSizeStable = tri.width === out.triCanvas.w && tri.height === out.triCanvas.h;
  out.bigValuesFinite = isFinite(dBig.tri.h.num) && dBig.tri.h.num > 1e6;
  out.noOverflowAfterBig = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  out.mdBigHasHuge = /3000000|3,000,000|3e\\+6/.test(window.TrigLab.getMarkdown());

  /* ---------- 9. 极小数同样能画 ---------- */
  clearText(q('trig-side'));
  setText(q('trig-side'), '0.0007');
  await sleep(320);
  var dTiny = window.TrigLab.getData();
  out.tinyH = dTiny.tri.h.num;
  out.tinyFinite = isFinite(dTiny.tri.h.num) && dTiny.tri.h.num > 0;

  /* ---------- 10. 特殊角覆盖：45° / 60° / 90° / 120° / 390° ---------- */
  clickTab(q('trig-src-tabs'), 'src', 'auto');
  await sleep(60);
  var table = {};
  var angles = ['45', '60', '90', '120', '390', '30'];
  for (var i = 0; i < angles.length; i++) {
    clearText(q('trig-angle'));
    setText(q('trig-angle'), angles[i]);
    await sleep(260);
    var dd = window.TrigLab.getData();
    table[angles[i]] = {
      ok: window.TrigLab.isReady(),
      exact: dd.exact,
      sin: dd.ratio.sin.plain,
      cos: dd.ratio.cos.plain,
      tan: dd.ratio.tan.missing ? 'NONE' : dd.ratio.tan.plain
    };
  }
  out.specialTable = table;

  /* ---------- 11. 非法输入给出明确提示，而不是崩掉 ---------- */
  clickTab(q('trig-src-tabs'), 'src', 'user');
  await sleep(60);
  clearText(q('trig-value'));
  setText(q('trig-value'), '2');
  await sleep(320);
  out.sin2Ready = window.TrigLab.isReady();
  out.sin2Error = (q('trig-err-slot').textContent || '').trim();
  clearText(q('trig-value'));
  setText(q('trig-value'), '0.6');
  await sleep(320);
  out.recoverReady = window.TrigLab.isReady();

  /* ---------- 12. 示例步进 / 分享链接 hash / 工作区互不干扰 ---------- */
  out.stepOk = window.TrigLab.stepExample(1) && window.TrigLab.isReady();
  var hashNow = location.hash;
  out.hashIsTrig = hashNow.indexOf('#trig:') === 0;
  out.hashRoundTrip = (function () {
    var st = window.TrigLab.getState();
    st.angle = '60'; st.sideKind = 'adjacent'; st.side = '7'; st.digits = 5;
    var ok = window.TrigLab.setState(st);
    return ok && window.TrigLab.isReady() && window.TrigLab.getData().digits === 5;
  })();
  /* 切回二次函数：hash 不能还是 trig: */
  window.QuadLab.setMode('quad');
  await sleep(200);
  out.hashAfterBackToQuad = location.hash.indexOf('#trig:') === 0 ? 'STILL_TRIG' : 'ok';
  out.quadReadyAfterBack = window.QuadLab.isReady();
  out.quadCanvasOk = q('plot').width > 100;
  window.QuadLab.setMode('trig');
  await sleep(200);
  out.trigReadyAfterReturn = window.TrigLab.isReady();

  /* ---------- 13. 报告结构 + KaTeX 无误 + 无残留占位符 ---------- */
  var md = window.TrigLab.getMarkdown() || '';
  out.mdSections = ['## 一、已知条件', '## 二、三角函数值', '## 三、直角三角形求解',
                    '## 四、面积与周长', '## 五、恒等式检验', '## 六、求解步骤',
                    '## 七、图像与缩放说明', '## 八、精度说明'].filter(function (h) { return md.indexOf(h) >= 0; }).length;
  out.mdDollarEven = (md.match(/\\$/g) || []).length % 2 === 0;
  out.katexErrors = document.querySelectorAll('.katex-error').length;
  out.mdPlaceholderLeft = /\\u0000|@@|\\{\\{/.test(md);
  out.docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  /* ---------- 14. 无结果时画布给出提示而不是空白 ---------- */
  clickTab(q('trig-src-tabs'), 'src', 'auto');
  await sleep(60);
  clearText(q('trig-angle'));
  await sleep(320);
  out.emptyAngleReady = window.TrigLab.isReady();
  out.emptyAngleError = (q('trig-err-slot').textContent || '').trim();
  out.canvasStillSized = q('tri-plot').width > 100;

  /* ---------- 15. 导出合成 PNG ---------- */
  clearText(q('trig-angle'));
  setText(q('trig-angle'), '30');
  await sleep(320);
  var url = window.TrigLab.getCanvasDataURL();
  out.canvasExport = !!url && url.indexOf('data:image/png;base64,') === 0 && url.length > 2000;

  /* ---------- 16. v1.4.1：三角函数工作区的数学键盘 / 设置 / 说明 ---------- */

  /* 函数值里写根号：sin θ = √3/2 应当精确反推出 60° */
  clickTab(q('trig-fn-tabs'), 'fn', 'sin');
  clickTab(q('trig-src-tabs'), 'src', 'user');
  await sleep(60);
  setText(q('trig-value'), '\\u221a3/2');
  await sleep(360);
  var mdSqrt = window.TrigLab.getMarkdown() || '';
  out.sqrtValueOk = window.TrigLab.isReady();
  out.sqrtValueExact = mdSqrt.indexOf('\\\\frac{\\\\sqrt{3}}{2}') >= 0;
  out.sqrtValueAngle60 = /\\\\theta \\\\approx 60/.test(mdSqrt);
  out.sqrtValueCosHalf = /\\\\cos\\\\theta.*\\\\frac\\{1\\}\\{2\\}/.test(mdSqrt);
  out.sqrtValueTanSqrt3 = /\\\\tan\\\\theta.*\\\\sqrt\\{3\\}/.test(mdSqrt);

  /* 三角函数工作区也有一块数学键盘，并且往当前聚焦的框里插 */
  clickTab(q('trig-fn-tabs'), 'fn', 'tan');
  await sleep(60);
  var trigValue = q('trig-value');
  clearText(trigValue);
  trigValue.focus();
  out.trigKeypadExists = !!document.querySelector('#trig-math-keys .mk[data-insert="\\u221a"]');
  document.querySelector('#trig-math-keys .mk[data-insert="\\u221a"]').click();
  window.QuadLab.insertMath('3');
  out.trigKeypadTyped = trigValue.value;
  await sleep(360);
  var mdKeypad = window.TrigLab.getMarkdown() || '';
  out.trigKeypadReport = /\\\\theta \\\\approx 60/.test(mdKeypad);
  out.trigKeypadExact = mdKeypad.indexOf('\\sqrt{3}') >= 0;

  /* 设置面板在三角函数工作区里照样能开、能改 */
  window.QuadLab.openSettings();
  out.settingsOpensInTrig = q('settings-modal').hidden === false;
  out.trigDigitsBefore = q('trig-digits').value;
  window.QuadLab.setSettings({ decimals: 6 });
  await sleep(360);
  out.trigDigitsAfterSetting = q('trig-digits').value;
  out.trigReportFollowsDigits = /1\\.732051/.test(window.TrigLab.getMarkdown() || '');

  /* 反过来：在三角函数这边改精度，设置面板也要跟着变 */
  setText(q('trig-digits'), '2');
  q('trig-digits').dispatchEvent(new Event('change'));
  await sleep(360);
  out.settingsFollowsTrigDigits = window.QuadLab.getSettings().decimals;
  out.trigReportFollowsDigits2 = /1\\.73\\b/.test(window.TrigLab.getMarkdown() || '');

  window.QuadLab.setSettings({ decimals: 4 });
  window.QuadLab.closeSettings();
  out.settingsClosedInTrig = q('settings-modal').hidden === true;
  await sleep(200);

  /* 说明弹窗在三角函数工作区里也能开 */
  window.QuadLab.openHelp();
  out.helpOpensInTrig = q('help-modal').hidden === false && q('help-body').textContent.length > 2000;
  window.QuadLab.closeHelp();
  out.helpClosedInTrig = q('help-modal').hidden === true;

  out.katexErrorsAfterNewUi = document.querySelectorAll('.katex-error').length;
  out.docOverflowAfterNewUi = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  return out;
})()`;

app.whenReady().then(async () => {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform }));
  ipcMain.handle('app:save-text', () => ({ ok: false }));

  const win = new BrowserWindow({
    width: 1500, height: 1000, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  const errs = [];
  win.webContents.on('console-message', (e, level, msg) => { if (level >= 2) errs.push(msg); });
  win.webContents.on('render-process-gone', (e, d) => errs.push('render-process-gone: ' + JSON.stringify(d)));

  /* 自测必须先清空本机存储：App 会记住上次的输入与设置（v1.4.1 起），
     上一次自测留下的状态会让这一次的初始断言不成立。
     清完再加载页面，等价于「第一次打开 App」。 */
  try {
    await require('electron').session.defaultSession.clearStorageData({ storages: ['localstorage'] });
  } catch (e) { /* 忽略：拿不到 session 也不该让自测崩掉 */ }

  await win.loadFile(path.join(ROOT, 'index.html'));
  await new Promise((r) => setTimeout(r, 2200));

  const result = await win.webContents.executeJavaScript(SCRIPT);
  result.consoleErrors = errs;

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  app.exit(0);
}).catch((e) => {
  fs.writeFileSync(OUT, JSON.stringify({ fatal: String(e && e.stack || e) }, null, 2), 'utf8');
  console.error('FATAL', e);
  app.exit(1);
});