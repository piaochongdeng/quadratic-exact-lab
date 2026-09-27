/*!
 * quadratic-exact-lab · make-site-shots.js
 * ------------------------------------------------------------------
 * 给官网页面拍照，用于人工/视觉复核。
 *
 * 为什么要在脚本里自己起一个 HTTP 服务：
 *   官网的下载区用 fetch 读 releases.json 与 GitHub API，
 *   而 file:// 下 fetch 会被浏览器拦掉，拍出来的永远是「读取中…」。
 *   所以这里起一个临时服务，用 http:// 加载，才是真实效果。
 *
 * 用法：
 *   node_modules/electron/dist/electron.exe scripts/make-site-shots.js
 * 输出：
 *   docs/site/shots/*.png
 * ------------------------------------------------------------------
 */
'use strict';

const { app, BrowserWindow, nativeImage } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(DOCS, 'site', 'shots');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '2');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.md': 'text/plain; charset=utf-8'
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.normalize(path.join(DOCS, u));
      if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream'
      });
      const stream = fs.createReadStream(f);
      /* 窗口销毁时连接会断，别让 EPIPE 把整个进程带走 */
      stream.on('error', () => { try { res.destroy(); } catch (e) {} });
      stream.pipe(res);
    });
    server.on('clientError', (err, socket) => {
      try { socket.destroy(); } catch (e) {}
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 镜头：{ 名称, 宽, 高, 滚动目标, 额外动作 } */
const SHOTS = [
  { name: 'site-hero-desktop', width: 1440, height: 900, scroll: 0 },
  { name: 'site-full-desktop', width: 1440, height: 900, scroll: 'full' },
  /* 下面几张不从滚动位置拍，而是从整页图里裁出来。
     隐藏窗口（show:false）滚动之后不一定会重新合成，capturePage 会拿到旧帧
     —— download 镜头就拍到过整张首屏，踩了两次。裁剪是纯像素操作，稳。 */
  { name: 'site-features',   width: 1440, height: 900, crop: '#features', from: 'site-full-desktop' },
  { name: 'site-shots',      width: 1440, height: 900, crop: '#shots',    from: 'site-full-desktop' },
  { name: 'site-download',   width: 1440, height: 900, crop: '#download', from: 'site-full-desktop' },
  { name: 'site-phone-hero', width: 390, height: 844, scroll: 0, phone: true },
  { name: 'site-phone-full', width: 390, height: 844, scroll: 'full', phone: true },
  { name: 'site-phone-download', width: 390, height: 844, crop: '#download', from: 'site-phone-full' },
  { name: 'site-tablet', width: 834, height: 1112, scroll: 0 }
];

/* 从已经拍好的整页图里裁一块出来。
   为什么不直接滚到那一块再拍：隐藏窗口滚动之后不一定会重新合成，
   capturePage 会返回旧帧（download 镜头拍到过整张首屏，反复踩）。
   裁剪是纯像素操作，跟合成时机无关，稳。 */
async function shootCrop(win, shot) {
  await win.setContentSize(shot.width, shot.height);
  await wait(400);
  await win.webContents.executeJavaScript(`(function(){
    document.documentElement.style.scrollBehavior='auto';
    document.querySelectorAll('.reveal').forEach(function(n){ n.classList.add('in'); });
    window.scrollTo(0, 0);
  })()`);
  await wait(500);

  const rect = await win.webContents.executeJavaScript(`(function(){
    var t = document.querySelector(${JSON.stringify(shot.crop)});
    if (!t) return null;
    var r = t.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY,
             w: r.width, h: r.height };
  })()`);
  if (!rect) throw new Error(shot.name + '：页面上找不到 ' + shot.crop);

  const src = path.join(OUT, shot.from + '.png');
  if (!fs.existsSync(src)) throw new Error(shot.name + '：整页图 ' + shot.from + '.png 不存在');
  const full = nativeImage.createFromPath(src);
  const fs2 = full.getSize();
  if (fs2.width < 10) throw new Error(shot.name + '：整页图读不出来');

  /* 页面是 2 倍像素，CSS 坐标 × 2 */
  const x = Math.max(0, Math.round(rect.x * 2));
  const y = Math.max(0, Math.round(rect.y * 2));
  const w = Math.min(fs2.width - x, Math.round(rect.w * 2));
  const h = Math.min(fs2.height - y, Math.round(rect.h * 2));
  if (w < 10 || h < 10) {
    throw new Error(shot.name + '：裁剪框算出来是 ' + w + 'x' + h +
      '（整页图 ' + fs2.width + 'x' + fs2.height + '，区块 ' + JSON.stringify(rect) + '）');
  }
  fs.writeFileSync(path.join(OUT, shot.name + '.png'), full.crop({ x, y, width: w, height: h }).toPNG());

  const diag = await win.webContents.executeJavaScript(`(function(){
    var relVer = (document.querySelector('[data-rel-ver]') || {}).textContent || '';
    var status = (document.querySelector('[data-rel-status]') || {}).textContent || '';
    var btn = document.querySelector('[data-dl="android"] [data-dl-btn]');
    var overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    return {
      relVer: relVer.trim(), status: status.trim(),
      androidHref: btn ? btn.getAttribute('href') : '',
      androidLoading: btn ? btn.classList.contains('is-loading') : null,
      katex: document.querySelectorAll('.katex').length,
      rawTex: document.querySelectorAll('.tex-plain').length,
      docH: document.body.scrollHeight, overflowX: overflow, hiddenReveal: 0,
      innerH: window.innerHeight,
      maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      scrollY: 0, targetTop: 0
    };
  })()`);
  /* 裁剪信息在 Node 侧补上：上面那段字符串是丢给渲染进程执行的，
     不能直接引用 Node 变量（踩过：shot is not defined）。 */
  diag.cropped = { from: shot.from, w: w, h: h, cssH: Math.round(rect.h) };
  return diag;
}

async function shoot(win, shot) {
  if (shot.crop) return shootCrop(win, shot);

  if (shot.scroll === 'full') {
    /* 整页图：先把出现动画全部强制播完，再把窗口撑到文档那么高，
       否则下半部分的 .reveal 还是 opacity:0，拍出来是一片空白。 */
    const h = await win.webContents.executeJavaScript(`(function(){
      document.documentElement.style.scrollBehavior='auto';
      document.querySelectorAll('.reveal').forEach(function(n){ n.classList.add('in'); });
      window.scrollTo(0, 0);
      return Math.ceil(document.documentElement.scrollHeight);
    })()`);
    await win.setContentSize(shot.width, Math.min(h + 8, 12000));
    /* 出现动画最长 0.35s 延迟 + 0.6s 过渡，等够再拍 */
    await wait(1500);
  } else {
    const scrollJs = typeof shot.scroll === 'string'
      ? `(function(){var t=document.querySelector('${shot.scroll}');
         if(t) window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 8);})();`
      : `window.scrollTo(0, ${Number(shot.scroll) || 0});`;
    await win.webContents.executeJavaScript(
      `(function(){ document.documentElement.style.scrollBehavior='auto'; ${scrollJs} })()`);
    await wait(700);
  }

  const sel = typeof shot.scroll === 'string' ? JSON.stringify(shot.scroll) : 'null';
  const diag = await win.webContents.executeJavaScript(`(function(){
    var relVer = (document.querySelector('[data-rel-ver]') || {}).textContent || '';
    var status = (document.querySelector('[data-rel-status]') || {}).textContent || '';
    var btn = document.querySelector('[data-dl="android"] [data-dl-btn]');
    var katexNodes = document.querySelectorAll('.katex').length;
    var rawTex = document.querySelectorAll('.tex-plain').length;
    var overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    /* 只关心「本该看见却没显示」的：视口内的元素才算数，
       首屏以下的还没触发出现动画属于正常。 */
    var hidden = 0;
    document.querySelectorAll('.reveal').forEach(function(n){
      if (getComputedStyle(n).opacity !== '0') return;
      var r = n.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) hidden++;
    });
    return {
      relVer: relVer.trim(), status: status.trim(),
      androidHref: btn ? btn.getAttribute('href') : '',
      androidLoading: btn ? btn.classList.contains('is-loading') : null,
      katex: katexNodes, rawTex: rawTex,
      docH: document.body.scrollHeight, overflowX: overflow,
      hiddenReveal: hidden,
      innerH: window.innerHeight,
      maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      scrollY: Math.round(window.scrollY),
      targetTop: (function(){
        var sel = ${sel};
        if (!sel) return null;
        var t = document.querySelector(sel);
        return t ? Math.round(t.getBoundingClientRect().top) : 'not-found';
      })()
    };
  })()`);
  await wait(400);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, shot.name + '.png'), img.toPNG());
  return diag;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  console.log(`临时服务：${url}`);

  /* 只开一个窗口，靠 setContentSize 切换尺寸。
     反复新建/销毁窗口会在第二次 loadURL 时踩到 ERR_FAILED。 */
  const win = new BrowserWindow({
    width: 1440, height: 900,
    show: false, paintWhenInitiallyHidden: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });

  win.webContents.on('console-message', (e, level, message) => {
    if (/Content-Security-Policy|Electron Security Warning|Autofill/.test(message)) return;
    if (level >= 2) console.log(`     [控制台] ${message.slice(0, 160)}`);
  });

  await win.loadURL(url);
  await wait(2800);

  /* 页面开了 scroll-behavior:smooth，程序化 scrollTo 会变成动画，
     截图就会拍到滚到一半的位置。拍照期间强制关掉平滑滚动。 */
  await win.webContents.executeJavaScript(
    "document.documentElement.style.scrollBehavior='auto';'ok'");

  let bad = 0;
  for (const shot of SHOTS) {
    await win.setContentSize(shot.width, shot.height);
    await win.webContents.executeJavaScript(
      "(function(){document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0);})()");
    await wait(500);

    const diag = await shoot(win, shot);
    const warns = [];
    if (!diag.relVer || diag.relVer === '读取中…') warns.push('版本号没填上');
    if (diag.katex === 0) warns.push('KaTeX 没渲染');
    if (diag.rawTex > 0) warns.push(`有 ${diag.rawTex} 处退化成纯文本`);
    if (diag.overflowX) warns.push('横向溢出');
    if (diag.androidLoading) warns.push('安卓按钮仍是加载态');
    if (diag.hiddenReveal) warns.push(`${diag.hiddenReveal} 处内容没显出来`);
    if (warns.length) bad++;

    const size = fs.statSync(path.join(OUT, shot.name + '.png')).size;
    if (diag.cropped) {
      console.log(
        `  ${shot.name.padEnd(22)} ${String(shot.width).padStart(4)}×${String(shot.height).padEnd(5)}` +
        ` 版本=${(diag.relVer || '空').padEnd(8)} katex=${String(diag.katex).padStart(3)}` +
        ` 裁自 ${diag.cropped.from}  ${diag.cropped.w}×${diag.cropped.h}px` +
        ` （页面 ${diag.cropped.cssH}px 高） ${(size / 1024).toFixed(0)}KB` +
        (warns.length ? `  ⚠ ${warns.join('；')}` : '')
      );
      continue;
    }
    console.log(
      `  ${shot.name.padEnd(22)} ${String(shot.width).padStart(4)}×${String(shot.height).padEnd(5)}` +
      ` 版本=${(diag.relVer || '空').padEnd(8)} katex=${String(diag.katex).padStart(3)}` +
      ` 文档高=${String(diag.docH).padStart(5)} 视口高=${String(diag.innerH).padStart(5)}` +
      ` scrollY=${String(diag.scrollY).padStart(5)}/${String(diag.maxScroll).padStart(5)}` +
      ` 目标顶=${String(diag.targetTop).padStart(7)} ${(size / 1024).toFixed(0)}KB` +
      (warns.length ? `  ⚠ ${warns.join('；')}` : '')
    );
    if (diag.status) console.log(`     状态栏：${diag.status}`);
    if (diag.androidHref) console.log(`     安卓链接：${diag.androidHref.slice(0, 96)}`);
  }

  win.destroy();
  server.close();
  console.log(bad ? `\n有 ${bad} 个镜头异常` : '\n全部镜头正常');
  app.exit(bad ? 1 : 0);
}).catch((e) => {
  console.error(e);
  app.exit(1);
});
