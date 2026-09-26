/*!
 * quadratic-exact-lab · desktop/main.js
 * ------------------------------------------------------------------
 * Electron 主进程：窗口、原生菜单、文件导出（Markdown / PNG / PDF）、
 * 单实例、窗口位置记忆、外链交给系统浏览器。
 * 渲染进程仍然是纯静态的 index.html —— 与网页版共用同一套引擎。
 * ------------------------------------------------------------------
 */
'use strict';

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_TITLE = '二次函数精确解析器';
const ROOT = path.join(__dirname, '..');
const IS_MAC = process.platform === 'darwin';

/** 窗口位置 / 尺寸记忆 */
function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}
function readWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (raw && typeof raw === 'object' && Number.isFinite(raw.width) && Number.isFinite(raw.height)) return raw;
  } catch (e) { /* 首次运行 */ }
  return null;
}
function writeWindowState(win) {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(Object.assign({}, win.getNormalBounds(), { maximized: win.isMaximized() })), 'utf8');
  } catch (e) { /* 忽略 */ }
}

let mainWindow = null;

function createWindow() {
  const saved = readWindowState();
  mainWindow = new BrowserWindow({
    width: (saved && saved.width) || 1440,
    height: (saved && saved.height) || 960,
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: '#f4f2ee',
    title: APP_TITLE,
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  if (saved && saved.maximized) mainWindow.maximize();

  mainWindow.loadFile(path.join(ROOT, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.executeJavaScript(
      "document.documentElement.classList.add('is-desktop');" +
      "document.body.classList.add('is-desktop');" +
      "document.title = '二次函数精确解析器';"
    ).catch(() => {});
  });

  ['resize', 'move', 'maximize', 'unmaximize'].forEach((ev) => {
    mainWindow.on(ev, () => { clearTimeout(mainWindow.__t); mainWindow.__t = setTimeout(() => writeWindowState(mainWindow), 400); });
  });
  mainWindow.on('close', () => writeWindowState(mainWindow));

  /* 外链走系统浏览器，不在应用内开新窗口 */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (ev, url) => {
    if (!url.startsWith('file://')) { ev.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

/* ================= 导出：Markdown ================= */

async function exportMarkdown(win) {
  const md = await win.webContents.executeJavaScript('window.QuadLab && window.QuadLab.getMarkdown()').catch(() => null);
  if (!md) { dialog.showMessageBox(win, { type: 'warning', message: '当前没有可导出的报告', detail: '请先修正输入，使左侧显示「计算完成」。' }); return; }
  const r = await dialog.showSaveDialog(win, {
    title: '导出 Markdown 报告',
    defaultPath: path.join(app.getPath('documents'), '二次函数解析报告.md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }, { name: '纯文本', extensions: ['txt'] }]
  });
  if (r.canceled || !r.filePath) return;
  fs.writeFileSync(r.filePath, md, 'utf8');
  notify(win, '已导出', r.filePath);
}

/* ================= 导出：PNG 图像 ================= */

async function exportPng(win) {
  const dataUrl = await win.webContents.executeJavaScript('window.QuadLab && window.QuadLab.getCanvasDataURL()').catch(() => null);
  if (!dataUrl) { dialog.showMessageBox(win, { type: 'warning', message: '当前没有可导出的图像' }); return; }
  const r = await dialog.showSaveDialog(win, {
    title: '导出函数图像',
    defaultPath: path.join(app.getPath('pictures'), '二次函数图像.png'),
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  });
  if (r.canceled || !r.filePath) return;
  fs.writeFileSync(r.filePath, Buffer.from(String(dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64'));
  notify(win, '已导出', r.filePath);
}

/* ================= 导出：PDF（整页报告） ================= */

async function exportPdf(win) {
  const r = await dialog.showSaveDialog(win, {
    title: '导出 PDF',
    defaultPath: path.join(app.getPath('documents'), '二次函数解析报告.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (r.canceled || !r.filePath) return;
  try {
    const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.45, right: 0.45 } });
    fs.writeFileSync(r.filePath, data);
    notify(win, '已导出', r.filePath);
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', message: '导出 PDF 失败', detail: String(e && e.message || e) });
  }
}

/* ================= 导出：JSON（当前输入） ================= */

async function exportJson(win) {
  const st = await win.webContents.executeJavaScript('window.QuadLab && window.QuadLab.getState()').catch(() => null);
  if (!st) { dialog.showMessageBox(win, { type: 'warning', message: '当前没有可导出的输入' }); return; }
  const r = await dialog.showSaveDialog(win, {
    title: '导出输入数据',
    defaultPath: path.join(app.getPath('documents'), '二次函数输入.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePath) return;
  fs.writeFileSync(r.filePath, JSON.stringify(st, null, 2), 'utf8');
  notify(win, '已导出', r.filePath);
}

/* ================= 导入：JSON（还原输入） ================= */

async function importJson(win) {
  const r = await dialog.showOpenDialog(win, {
    title: '载入输入数据',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePaths.length) return;
  try {
    const st = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    const ok = await win.webContents.executeJavaScript('window.QuadLab && window.QuadLab.setState(' + JSON.stringify(st) + ')');
    if (!ok) dialog.showMessageBox(win, { type: 'warning', message: '文件格式不符合本工具的输入结构' });
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', message: '读取失败', detail: String(e && e.message || e) });
  }
}

/* ================= 复制 ================= */

async function copyMarkdown(win) {
  const md = await win.webContents.executeJavaScript('window.QuadLab && window.QuadLab.getMarkdown()').catch(() => null);
  if (!md) { dialog.showMessageBox(win, { type: 'warning', message: '当前没有可复制的报告' }); return; }
  const { clipboard } = require('electron');
  clipboard.writeText(md);
  notify(win, '已复制 Markdown 报告到剪贴板', '');
}

function notify(win, message, detail) {
  dialog.showMessageBox(win, { type: 'info', message, detail: detail || undefined, buttons: ['好的'], noLink: true });
}

/* ================= 原生菜单 ================= */

function buildMenu() {
  const send = (channel) => () => { if (mainWindow) mainWindow.webContents.send(channel); };
  const template = [
    {
      label: '文件(&F)',
      submenu: [
        { label: '复制 Markdown 报告', accelerator: 'CmdOrCtrl+Shift+C', click: () => mainWindow && copyMarkdown(mainWindow) },
        { type: 'separator' },
        { label: '导出 Markdown…', accelerator: 'CmdOrCtrl+S', click: () => mainWindow && exportMarkdown(mainWindow) },
        { label: '导出 PDF…', accelerator: 'CmdOrCtrl+P', click: () => mainWindow && exportPdf(mainWindow) },
        { label: '导出函数图像 PNG…', accelerator: 'CmdOrCtrl+Shift+E', click: () => mainWindow && exportPng(mainWindow) },
        { type: 'separator' },
        { label: '导出输入数据 JSON…', click: () => mainWindow && exportJson(mainWindow) },
        { label: '载入输入数据 JSON…', accelerator: 'CmdOrCtrl+O', click: () => mainWindow && importJson(mainWindow) },
        { type: 'separator' },
        IS_MAC ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑(&E)',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '输入形式(&M)',
      submenu: [
        { label: '一般式  y = ax² + bx + c', accelerator: 'CmdOrCtrl+1', click: send('menu:form-general') },
        { label: '顶点式  y = a(x−h)² + k', accelerator: 'CmdOrCtrl+2', click: send('menu:form-vertex') },
        { label: '交点式  y = a(x−x₁)(x−x₂)', accelerator: 'CmdOrCtrl+3', click: send('menu:form-factored') },
        { label: '三点确定函数', accelerator: 'CmdOrCtrl+4', click: send('menu:form-points') },
        { type: 'separator' },
        { label: '工作区：二次函数（形式互化 / 最值）', accelerator: 'CmdOrCtrl+5', click: send('menu:mode-quad') },
        { label: '工作区：三角函数 · 直角三角形', accelerator: 'CmdOrCtrl+6', click: send('menu:mode-trig') },
        { type: 'separator' },
        { label: '上一个示例', accelerator: 'CmdOrCtrl+Up', click: send('menu:example-prev') },
        { label: '下一个示例', accelerator: 'CmdOrCtrl+Down', click: send('menu:example-next') }
      ]
    },
    {
      label: '视图(&V)',
      submenu: [
        { label: '深色 / 浅色主题', accelerator: 'CmdOrCtrl+T', click: send('menu:theme') },
        { label: '重置图像视野', accelerator: 'CmdOrCtrl+0', click: send('menu:reset-view') },
        { type: 'separator' },
        { label: '放大图像', accelerator: 'CmdOrCtrl+=', click: send('menu:zoom-in') },
        { label: '缩小图像', accelerator: 'CmdOrCtrl+-', click: send('menu:zoom-out') },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置界面缩放' },
        { role: 'zoomIn', label: '放大界面' },
        { role: 'zoomOut', label: '缩小界面' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '帮助(&H)',
      submenu: [
        { label: '快捷键一览', accelerator: 'F1', click: () => showAbout(true) },
        { label: '关于 ' + APP_TITLE, click: () => showAbout(false) },
        { type: 'separator' },
        { label: '打开 GitHub 仓库', click: () => shell.openExternal('https://github.com/piaochongdeng/quadratic-exact-lab') },
        { label: '打开 Gitee 仓库', click: () => shell.openExternal('https://gitee.com/piaochong1/quadratic-exact-lab') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ================= 关于窗口 ================= */

function showAbout(showKeys) {
  const win = new BrowserWindow({
    width: showKeys ? 620 : 520,
    height: showKeys ? 620 : 460,
    parent: mainWindow || undefined,
    modal: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    title: showKeys ? '快捷键一览' : '关于 ' + APP_TITLE,
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#f4f2ee',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'about.html'), { query: { keys: showKeys ? '1' : '0', v: app.getVersion() } });
}

/* ================= 生命周期 ================= */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    ipcMain.handle('app:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: process.platform, arch: process.arch, home: os.homedir() }));
    ipcMain.handle('app:save-text', async (ev, payload) => {
      const win = BrowserWindow.fromWebContents(ev.sender);
      const r = await dialog.showSaveDialog(win, { title: payload.title || '保存', defaultPath: payload.defaultPath, filters: payload.filters });
      if (r.canceled || !r.filePath) return { ok: false };
      if (payload.base64) fs.writeFileSync(r.filePath, Buffer.from(String(payload.base64), 'base64'));
      else fs.writeFileSync(r.filePath, String(payload.content), 'utf8');
      return { ok: true, filePath: r.filePath };
    });
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });
}
