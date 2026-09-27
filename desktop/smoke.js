/* 桌面版冒烟测试：用 Electron 以隐藏窗口启动应用，跑一遍自检后退出。
   用法： node_modules\electron\dist\electron.exe desktop/smoke.js
*/
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'smoke-result.json');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  /* 与 main.js 相同的最小 IPC 契约，保证 preload 的调用有响应 */
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform, arch: process.arch, home: require('os').homedir() }));
  ipcMain.handle('app:save-text', () => ({ ok: false, canceled: true }));
  const win = new BrowserWindow({
    width: 1400, height: 950, show: false,
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
  await new Promise((r) => setTimeout(r, 2500));

  const report = await win.webContents.executeJavaScript(`(async function(){
    /* 自测必须从二次函数工作区开始：工作区会记忆到 localStorage，
       上一次跑三角函数自测可能把它留在 trig，导致画布被隐藏、尺寸为 0。 */
    try { localStorage.setItem('qel-mode', 'quad'); } catch (e) { /* 忽略 */ }
    window.QuadLab.setMode('quad');

    var out = {};
    out.hasDesktopBridge = !!window.QuadDesktop;
    out.hasApi = !!window.QuadLab;
    out.apiVersion = window.QuadLab && window.QuadLab.version;
    out.isReady = window.QuadLab && window.QuadLab.isReady();
    out.markdownLen = (window.QuadLab && window.QuadLab.getMarkdown() || '').length;
    out.dataH = window.QuadLab && window.QuadLab.getData() && window.QuadLab.getData().exact.h;
    out.canvasUrl = !!(window.QuadLab && window.QuadLab.getCanvasDataURL());
    out.canvasUrlLen = (window.QuadLab && window.QuadLab.getCanvasDataURL() || '').length;
    out.stateForm = window.QuadLab && window.QuadLab.getState().form;
    out.isDesktopClass = document.documentElement.classList.contains('is-desktop');
    out.katexErrors = document.querySelectorAll('.katex-error').length;
    out.docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

    /* 四点验证：切换形式 / 三点输入 / 载入 JSON / 主题 */
    out.switchPoints = window.QuadLab.setForm('points');
    out.pointsReady = window.QuadLab.isReady();
    out.pointsMdHasCramer = /克莱姆/.test(window.QuadLab.getMarkdown() || '');
    var st = window.QuadLab.getState();
    st.values.points = { p1x:'0', p1y:'-2', p2x:'1', p2y:'-1', p3x:'2', p3y:'2' };
    out.setStateOk = window.QuadLab.setState(st);
    out.surdInReport = window.QuadLab.getMarkdown().indexOf(String.fromCharCode(92) + 'sqrt{2}') >= 0;
    out.exampleNext = window.QuadLab.stepExample(1);
    out.examplePrev = window.QuadLab.stepExample(-1);
    window.QuadLab.toggleTheme();
    out.themeAfterToggle = document.documentElement.getAttribute('data-theme');
    window.QuadLab.toggleTheme();
    out.themeBack = document.documentElement.getAttribute('data-theme');

    /* ---------- v1.4.1 · 数学键盘：没有地方能打出 √，全靠点 ---------- */
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var btn = function (sel) { return document.querySelector(sel); };

    /* 回到一般式并清空 a，模拟「用户点开一格准备输入根号」 */
    window.QuadLab.setForm('general');
    var inA = document.getElementById('in-a');
    inA.value = '';
    inA.dispatchEvent(new Event('input', { bubbles: true }));
    inA.focus();

    out.keypadHasSqrt = !!btn('.mk[data-insert="√"]');
    btn('.mk[data-insert="√"]').click();
    out.afterSqrtClick = inA.value;               /* 期望 '√' */
    btn('.mk[data-insert="√"]').click();
    out.afterTwoSqrt = inA.value;                 /* 期望 '√√' */
    btn('.mk[data-action="back"]').click();
    btn('.mk[data-action="back"]').click();
    btn('.mk[data-insert="√"]').click();
    window.QuadLab.insertMath('2');
    out.sqrtTwoValue = inA.value;                 /* 期望 '√2' */

    /* √( ) 应该插入 '√()' 并把光标放进括号中间 */
    var inB = document.getElementById('in-b');
    inB.value = '';
    inB.dispatchEvent(new Event('input', { bubbles: true }));
    inB.focus();
    btn('.mk[data-insert="√()"]').click();
    out.parenInserted = inB.value;                /* 期望 '√()' */
    out.parenCaret = inB.selectionStart;          /* 期望 2 */

    /* 填完 a=√2 后等去抖刷新，报告里必须出现真正的根号 */
    inA.value = '√2';
    inA.dispatchEvent(new Event('input', { bubbles: true }));
    inB.value = '0';
    inB.dispatchEvent(new Event('input', { bubbles: true }));
    /* c 取 0：判别式为 0，零点恰好是 0，报告一定能成立而不依赖别的根式 */
    var inC = document.getElementById('in-c');
    inC.value = '0';
    inC.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
    var mdRoot = window.QuadLab.getMarkdown() || '';
    var BS = String.fromCharCode(92);
    out.sqrtReportOk = mdRoot.indexOf(BS + 'sqrt{2}') >= 0;
    out.sqrtReportVertex = mdRoot.indexOf(BS + 'sqrt{2}') >= 0 && window.QuadLab.isReady();

    /* ± 与退格：点按钮后活动元素是按钮，键盘会落到「最后聚焦过的输入框」，
       所以每次点击前都把焦点放回 inA——这正是真人的操作顺序 */
    inA.focus();
    inA.value = '-3';
    inA.dispatchEvent(new Event('input', { bubbles: true }));
    btn('.mk[data-action="neg"]').click();
    out.negToggle = inA.value;                    /* 期望 '3' */
    btn('.mk[data-action="neg"]').click();
    out.negToggleBack = inA.value;                /* 期望 '-3' */
    inA.value = '1+√3';
    inA.dispatchEvent(new Event('input', { bubbles: true }));
    inA.focus();
    btn('.mk[data-action="neg"]').click();
    out.negWrap = inA.value;                      /* 期望 '-(1+√3)' */
    inA.focus();
    btn('.mk[data-action="clear"]').click();
    out.cleared = inA.value;                      /* 期望 '' */

    /* 定义域端点也要能点根号。
       上面那步把 a 清空了，报告此刻是「参数不完整」的状态，
       所以先摆一个干净的 y = x²，否则这里测的是错误提示而不是根号。 */
    inA.value = '1';
    inA.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(300);
    var rval = document.getElementById('rval');
    var radios = document.querySelectorAll('input[name="dom"]');
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event('change', { bubbles: true }));
    /* 切到自定义区间后左侧会取消 −∞，右侧仍是 +∞（输入框禁用），先取消它 */
    var rinf = document.getElementById('rinf');
    rinf.checked = false;
    rinf.dispatchEvent(new Event('change', { bubbles: true }));
    out.domainRightEnabled = !rval.disabled;
    rval.focus();
    rval.value = '';
    rval.dispatchEvent(new Event('input', { bubbles: true }));
    window.QuadLab.insertMath('√2');
    await wait(400);
    out.domainSqrtValue = rval.value;
    out.domainSqrtInMd = (window.QuadLab.getMarkdown() || '').indexOf(BS + 'sqrt{2}') >= 0;

    /* ---------- v1.4.1 · 设置面板 ---------- */
    var defs = window.QuadLab.getSettings();
    out.settingsDefaults = JSON.stringify(defs);
    out.settingsDecimalsInput = document.getElementById('opt-decimals').value;

    window.QuadLab.setSettings({ decimals: 6 });
    out.settingsAfterSet = window.QuadLab.getSettings().decimals;
    out.settingsPersisted = /"decimals":6/.test(localStorage.getItem('qel-settings') || '');
    out.settingsInputSynced = document.getElementById('opt-decimals').value === '6';

    /* 位数上限是 10：填 10 不能被悄悄改掉（三角函数那边本来就支持 10 位） */
    window.QuadLab.setSettings({ decimals: 10 });
    out.decimals10 = window.QuadLab.getSettings().decimals;
    window.QuadLab.setSettings({ decimals: 12 });
    out.decimalsTooBig = window.QuadLab.getSettings().decimals;
    window.QuadLab.setSettings({ decimals: 6 });

    /* 小数位数真的生效：√2 的近似值应为 1.414214（6 位） */
    window.QuadLab.setForm('general');
    window.QuadLab.setState({ form: 'general', values: { general: { a: '1', b: '0', c: '-2' } }, domain: 'all' });
    var md6 = window.QuadLab.getMarkdown() || '';
    out.decimalsApplied = md6.indexOf('1.414214') >= 0;

    /* 「只要结论」模式：章节数必须大幅减少 */
    out.fullSections = (md6.match(/^## /gm) || []).length;
    window.QuadLab.setSettings({ detail: 'brief' });
    var mdBrief = window.QuadLab.getMarkdown() || '';
    out.briefSections = (mdBrief.match(/^## /gm) || []).length;
    out.briefKeepsConclusion = mdBrief.indexOf('## 一、结论速览') >= 0;

    /* 主题：设置面板与页头按钮要互相同步 */
    window.QuadLab.setSettings({ detail: 'full', theme: 'dark' });
    out.themeAfterSettings = document.documentElement.getAttribute('data-theme');
    out.themeButtonState = document.querySelector('#opt-theme button[data-theme="dark"]').getAttribute('aria-selected');
    window.QuadLab.toggleTheme();
    out.themeAfterHeaderBtn = document.documentElement.getAttribute('data-theme');
    out.themePanelSynced = document.querySelector('#opt-theme button[data-theme="light"]').getAttribute('aria-selected');
    out.themeSettingValue = window.QuadLab.getSettings().theme;

    /* 恢复默认设置 */
    document.getElementById('btn-opt-reset').click();
    out.afterReset = JSON.stringify(window.QuadLab.getSettings());

    /* ---------- v1.4.1 · 使用说明 ---------- */
    var modal = document.getElementById('help-modal');
    out.helpClosedAtStart = modal.hidden === true;
    window.QuadLab.openHelp();
    await wait(120);
    out.helpOpened = modal.hidden === false;
    out.helpBodyLen = document.getElementById('help-body').textContent.length;
    out.helpH1 = document.querySelectorAll('#help-body h1').length;
    out.helpH2 = document.querySelectorAll('#help-body h2').length;
    out.helpTables = document.querySelectorAll('#help-body table').length;
    out.helpKatexErrors = document.querySelectorAll('#help-body .katex-error').length;
    out.helpStrayDollar = document.getElementById('help-body').textContent.indexOf('$') >= 0;
    out.helpSaysSqrt = document.getElementById('help-body').textContent.indexOf('数学键盘') >= 0;

    /* Esc 关闭 */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    out.helpClosedByEsc = modal.hidden === true;

    /* ? 打开 */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true }));
    out.helpOpenedByQuestion = modal.hidden === false;
    /* 点遮罩关闭 */
    document.getElementById('help-backdrop').click();
    out.helpClosedByBackdrop = modal.hidden === true;

    /* 打开说明后焦点要还回去，数学键盘还能接着用 */
    document.getElementById('in-a').focus();
    window.QuadLab.openHelp();
    window.QuadLab.closeHelp();
    window.QuadLab.insertMath('√2');
    out.keypadWorksAfterHelp = document.getElementById('in-a').value.indexOf('√2') >= 0;

    out.katexErrorsTotal = document.querySelectorAll('.katex-error').length;
    out.docOverflowAtEnd = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return out;
  })()`);

  const info = await win.webContents.executeJavaScript('window.QuadDesktop.info()');
  report.desktopInfo = { version: info.version, electron: info.electron, platform: info.platform };
  report.consoleErrors = errs;

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  app.exit(0);
}).catch((e) => {
  fs.writeFileSync(OUT, JSON.stringify({ fatal: String(e && e.stack || e) }, null, 2), 'utf8');
  console.error('FATAL', e);
  app.exit(1);
});
