/* 桌面版导出链路测试：PDF / PNG / Markdown / JSON 的底层能力逐一验证。
   用法： node_modules\electron\dist\electron.exe desktop/smoke-export.js
*/
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUTDIR = path.join(__dirname, 'smoke-out');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const win = new BrowserWindow({
    width: 1400, height: 950, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform }));
  ipcMain.handle('app:save-text', (ev, payload) => {
    const target = path.join(OUTDIR, payload.defaultPath || 'out.txt');
    if (payload.base64) fs.writeFileSync(target, Buffer.from(String(payload.base64), 'base64'));
    else fs.writeFileSync(target, String(payload.content), 'utf8');
    return { ok: true, filePath: target };
  });

  await win.loadFile(path.join(ROOT, 'index.html'));
  await new Promise((r) => setTimeout(r, 2200));

  const result = {};

  /* 工作区会记忆到 localStorage：本套自测只关心二次函数工作区，先强制切过去，
     否则画布被隐藏后尺寸为 0，PNG 导出会失败。 */
  await win.webContents.executeJavaScript("try{localStorage.setItem('qel-mode','quad');}catch(e){}; window.QuadLab.setMode('quad');");
  await new Promise((r) => setTimeout(r, 600));

  /* 1) Markdown 导出：走 preload → IPC → 写盘 */
  const mdSave = await win.webContents.executeJavaScript(
    "window.QuadDesktop.saveText({ title: 't', defaultPath: 'report.md', content: window.QuadLab.getMarkdown() })"
  );
  result.markdownSave = mdSave;

  /* 2) PNG 导出 */
  const pngSave = await win.webContents.executeJavaScript(`(function(){
    var url = window.QuadLab.getCanvasDataURL();
    if (!url) return null;
    return window.QuadDesktop.saveText({ title:'t', defaultPath:'plot.png', base64: url.replace(/^data:image\\/png;base64,/, '') });
  })()`);
  result.pngSave = pngSave;

  /* 3) JSON 导出 */
  const jsonSave = await win.webContents.executeJavaScript(
    "window.QuadDesktop.saveText({ title:'t', defaultPath:'input.json', content: JSON.stringify(window.QuadLab.getState(), null, 2) })"
  );
  result.jsonSave = jsonSave;

  /* 4) PDF 导出（主进程能力，不经对话框） */
  try {
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    fs.writeFileSync(path.join(OUTDIR, 'report.pdf'), pdf);
    result.pdf = { ok: true, bytes: pdf.length };
  } catch (e) { result.pdf = { ok: false, error: String(e && e.message || e) }; }

  /* 5) 打印样式是否真的隐藏了输入区 */
  result.printCss = await win.webContents.executeJavaScript(`(function(){
    var found = false, rules = [];
    for (var i = 0; i < document.styleSheets.length; i++) {
      try {
        var rs = document.styleSheets[i].cssRules;
        for (var j = 0; j < rs.length; j++) {
          if (rs[j].type === CSSRule.MEDIA_RULE && /print/.test(rs[j].conditionText || '')) {
            found = true;
            rules.push(rs[j].cssText.length);
          }
        }
      } catch (e) {}
    }
    return { hasPrintMedia: found, ruleCount: rules.length };
  })()`);

  /* 6) 菜单事件：主进程发 → 渲染进程响应 */
  const before = await win.webContents.executeJavaScript("window.QuadLab.getState().form");
  win.webContents.send('menu:form-points');
  await new Promise((r) => setTimeout(r, 400));
  const afterPoints = await win.webContents.executeJavaScript("window.QuadLab.getState().form");
  win.webContents.send('menu:theme');
  await new Promise((r) => setTimeout(r, 300));
  const theme = await win.webContents.executeJavaScript("document.documentElement.getAttribute('data-theme')");
  win.webContents.send('menu:theme');
  await new Promise((r) => setTimeout(r, 300));
  win.webContents.send('menu:example-next');
  await new Promise((r) => setTimeout(r, 400));
  const afterExample = await win.webContents.executeJavaScript("window.QuadLab.isReady()");
  result.menu = { before: before, afterPoints: afterPoints, theme: theme, exampleOk: afterExample };

  /* 7) 输入框全角 / 小数容错在桌面版仍生效 */
  result.tolerantInput = await win.webContents.executeJavaScript(`(function(){
    window.QuadLab.setForm('general');
    var st = window.QuadLab.getState();
    st.values.general = { a: '１', b: '－２', c: '０.５' };
    window.QuadLab.setState(st);
    var md = window.QuadLab.getMarkdown() || '';
    return { ok: window.QuadLab.isReady(), hasFraction: md.indexOf('frac{1}{2}') >= 0 };
  })()`);

  result.files = fs.readdirSync(OUTDIR).map(function (f) {
    return { name: f, bytes: fs.statSync(path.join(OUTDIR, f)).size };
  });

  fs.writeFileSync(path.join(__dirname, 'smoke-export-result.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  app.exit(0);
}).catch((e) => {
  console.error('FATAL', e);
  app.exit(1);
});
