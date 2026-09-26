/* 定义域输入框回归测试（Electron 真实 DOM）
 *
 * 修复前的 bug：空端点值会被反推成「−∞」，于是自动勾上 ±∞ 并 disabled 输入框；
 * 又因为值一直是空，取消勾选后会被立刻重新勾上 —— 输入框永远无法输入。
 *
 * 这里用「真实焦点 + 真实插入文本」验证：disabled 的输入框拿不到焦点、
 * insertText 也不会生效，所以本测试在旧代码上必然失败。
 *
 * 注意：文本输入走 130ms 防抖，读结果前必须等一拍；勾选框是同步更新。
 *
 * 用法： node_modules\electron\dist\electron.exe desktop/smoke-domain.js
 */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'smoke-domain-result.json');
app.disableHardwareAcceleration();

const SCRIPT = `(async function () {
  var out = {};
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var el = {
    lval: document.getElementById('lval'),
    rval: document.getElementById('rval'),
    linf: document.getElementById('linf'),
    rinf: document.getElementById('rinf'),
    lb: document.getElementById('lb'),
    rb: document.getElementById('rb'),
    radioInterval: document.querySelector('input[name="dom"][value="interval"]'),
    radioAll: document.querySelector('input[name="dom"][value="all"]'),
    err: document.getElementById('err-slot')
  };
  var st = function () { return window.QuadLab.getState(); };

  /* 在输入框里真实插入文本：disabled 的框拿不到焦点，insertText 无效 */
  function typeInto(input, text) {
    input.focus();
    var focused = document.activeElement === input;
    if (input.select) input.select();
    var inserted = document.execCommand('insertText', false, text);
    return { focused: focused, inserted: inserted, value: input.value };
  }
  function clickRadio(r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
  function setCheck(box, on) { box.checked = on; box.dispatchEvent(new Event('change', { bubbles: true })); }

  /* ---------- 1. 切到「自定义区间」后，左输入框必须可用 ---------- */
  clickRadio(el.radioAll);
  clickRadio(el.radioInterval);
  out.leftDisabledAfterSwitch = el.lval.disabled;
  out.leftUnboundedAfterSwitch = el.linf.checked;
  out.rightStillInf = el.rinf.checked;

  /* ---------- 2. 真实输入左端点 -3/2（走防抖，等一拍） ---------- */
  out.typeLeft = typeInto(el.lval, '-3/2');
  await sleep(320);
  out.stateLeftValue = st().domain.left.value;
  out.readyAfterLeft = window.QuadLab.isReady();
  out.mdLeftIsFraction = (window.QuadLab.getMarkdown() || '').indexOf('\\\\frac{3}{2}') >= 0;

  /* ---------- 3. 取消 +∞ 后才能输入右端点 7/2 ---------- */
  setCheck(el.rinf, false);
  out.rightEnabledAfterUncheck = !el.rval.disabled;
  out.typeRight = typeInto(el.rval, '7/2');
  await sleep(320);
  out.stateRightValue = st().domain.right.value;
  out.readyAfterRight = window.QuadLab.isReady();
  out.mdRightIsFraction = (window.QuadLab.getMarkdown() || '').indexOf('\\\\frac{7}{2}') >= 0;

  /* ---------- 4. 勾上 +∞ 应禁用右框并清空值 ---------- */
  setCheck(el.rinf, true);
  out.rightDisabledWhenInf = el.rval.disabled;
  out.rightValueCleared = el.rval.value === '';
  out.readyHalfOpen = window.QuadLab.isReady();
  out.mdHalfOpenInf = (window.QuadLab.getMarkdown() || '').indexOf('-\\\\infty') >= 0 ||
                      (window.QuadLab.getMarkdown() || '').indexOf('\\\\infty') >= 0;

  /* ---------- 5. 方括号按钮：开闭切换 ---------- */
  var beforeOpen = st().domain.right.open;
  el.rb.click();
  out.bracketToggled = st().domain.right.open !== beforeOpen;
  el.rb.click();
  out.bracketRestored = st().domain.right.open === beforeOpen;

  /* ---------- 6. 两侧都无界 → 明确报错，而不是静默出错 ---------- */
  setCheck(el.linf, true);
  out.bothInfReady = window.QuadLab.isReady();
  out.bothInfError = (el.err.textContent || '').trim().slice(0, 70);

  /* ---------- 7. 重新输入后必须能恢复可用 ---------- */
  setCheck(el.linf, false);
  out.leftReEnabled = !el.lval.disabled;
  out.typeLeftAgain = typeInto(el.lval, '-1');
  await sleep(320);
  out.readyAfterRecover = window.QuadLab.isReady();
  out.recoveredLeft = st().domain.left.value;

  /* ---------- 8. 存档 → 还原（含无界标记） ---------- */
  setCheck(el.rinf, true);
  await sleep(120);
  var snapshot = st();
  out.snapshotRight = snapshot.domain.right;
  setCheck(el.rinf, false);
  setCheck(el.linf, true);
  await sleep(120);
  out.roundTripOk = window.QuadLab.setState(snapshot) && window.QuadLab.isReady();
  out.roundTripRightUnbounded = st().domain.right.unbounded;
  out.roundTripLeftValue = st().domain.left.value;

  /* ---------- 9. 旧格式（空值=无界）仍能还原，保证旧分享链接不失效 ---------- */
  out.legacyStateOk = window.QuadLab.setState({
    form: 'general',
    values: { general: { a: '1', b: '-2', c: '3' } },
    domain: { mode: 'interval', left: { value: '0', open: false }, right: { value: '', open: true } }
  });
  out.legacyLeft = st().domain.left.value;
  out.legacyRightUnbounded = st().domain.right.unbounded;
  out.legacyRightDisabled = el.rval.disabled;
  out.legacyReady = window.QuadLab.isReady();

  return out;
})()`;

app.whenReady().then(async () => {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform }));
  ipcMain.handle('app:save-text', () => ({ ok: false }));

  const win = new BrowserWindow({
    width: 1400, height: 950, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  const errs = [];
  win.webContents.on('console-message', (e, level, msg) => { if (level >= 2) errs.push(msg); });

  await win.loadFile(path.join(ROOT, 'index.html'));
  await new Promise((r) => setTimeout(r, 2000));

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
