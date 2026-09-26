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

  await win.loadFile(path.join(ROOT, 'index.html'));
  await new Promise((r) => setTimeout(r, 2500));

  const report = await win.webContents.executeJavaScript(`(function(){
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
