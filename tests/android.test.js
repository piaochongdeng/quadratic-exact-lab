/*!
 * quadratic-exact-lab · tests/android.test.js
 * ------------------------------------------------------------------
 * Android 真机 / 模拟器端到端自测。
 *
 *   node tests/android.test.js
 *
 * 它不等价于「网页版测试再跑一遍」——那些已经跑过了。这里只验证
 * 「套壳之后才可能出现的问题」：
 *   · assets 里的资源是否真的加载到了（KaTeX 字体、脚本、样式）
 *   · WebView 的 file:// 策略是否把 vendor/ 拦掉了
 *   · 原生桥 window.QuadAndroid 是否挂上、导出是否真的落盘
 *   · 真实手机的 viewport / 安全区下，页面是否还有重叠或横向溢出
 *
 * 依赖：一台已连接（adb devices 可见）且已安装 debug APK 的设备。
 * 没有设备时打印 skip 并以 0 退出，不影响纯网页版的测试套件。
 *
 * 实现方式：adb forward 到 WebView 的 devtools socket，然后用 CDP
 * （Runtime.evaluate）在真实 WebView 里跑断言。不是模拟，不是截图猜。
 * ------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const net = require('net');

const ROOT = path.join(__dirname, '..');
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || 'D:/android-toolchain/sdk';
const ADB = process.platform === 'win32'
  ? path.join(SDK, 'platform-tools', 'adb.exe')
  : path.join(SDK, 'platform-tools', 'adb');
const APK = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug',
  'quadratic-exact-lab-1.4.0-debug.apk');
const PKG = 'cn.piaochong.quadraticexactlab';
const PORT = 9222;

let pass = 0, fail = 0, skip = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (err) { fail++; console.log('  FAIL ' + name + '\n       ' + (err && err.message)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function adb(args, opts) {
  const res = spawnSync(ADB, args, Object.assign({ encoding: 'utf8', timeout: 120000 }, opts || {}));
  if (res.error) throw new Error('adb 执行失败：' + res.error.message);
  return (res.stdout || '') + (res.stderr || '');
}

/* ---------- 0. 有没有设备 ---------- */

if (!fs.existsSync(ADB)) {
  console.log('  skip 找不到 adb（' + ADB + '），设置 ANDROID_HOME 后重试');
  process.exit(0);
}

let serial = '';
try {
  const out = adb(['devices']);
  const line = out.split('\n').map(function (l) { return l.trim(); })
    .filter(function (l) { return /\sdevice$/.test(l); })[0];
  if (line) serial = line.split(/\s+/)[0];
} catch (e) { /* 落到下面的 skip */ }

if (!serial) {
  console.log('  skip 没有已连接的设备（adb devices 为空）——本套件只在有真机/模拟器时才有意义');
  process.exit(0);
}

const A = function (args, opts) { return adb(['-s', serial].concat(args), opts); };

/* ---------- 1. 装包并启动 ---------- */

function ensureInstalled() {
  if (!fs.existsSync(APK)) throw new Error('没有找到 debug APK：' + APK + '（先跑 gradlew assembleDebug）');
  A(['install', '-r', APK]);
  A(['shell', 'am', 'force-stop', PKG]);
  A(['logcat', '-c']);
  A(['shell', 'am', 'start', '-n', PKG + '/.MainActivity']);
}

/* ---------- 2. 连上 WebView 的 devtools ---------- */

function findSocket() {
  /* WebView 的 devtools socket 名字里带 pid，每启动一次都会变 */
  const out = A(['shell', 'cat', '/proc/net/unix']);
  const names = out.split('\n')
    .map(function (l) { return (l.match(/webview_devtools_remote(_\d+)?/) || [])[0]; })
    .filter(Boolean);
  return names[names.length - 1] || null;
}

function httpGetJson(urlPath) {
  return new Promise(function (resolve, reject) {
    const req = require('http').get({ host: '127.0.0.1', port: PORT, path: urlPath }, function (res) {
      let buf = '';
      res.on('data', function (c) { buf += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('CDP 返回的不是 JSON：' + buf.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function () { req.destroy(new Error('CDP 连接超时')); });
  });
}

/** 极简 CDP 客户端：Node 22+ 自带全局 WebSocket，不需要任何依赖 */
function connect(wsUrl) {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && pending.has(msg.id)) {
        const { resolve: rs, reject: rj } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rj(new Error(msg.error.message)); else rs(msg.result);
      }
    });
    ws.addEventListener('error', function () { reject(new Error('WebSocket 连接失败：' + wsUrl)); });
    ws.addEventListener('open', function () {
      resolve({
        send(method, params) {
          return new Promise(function (rs, rj) {
            const myId = ++id;
            pending.set(myId, { resolve: rs, reject: rj });
            ws.send(JSON.stringify({ id: myId, method: method, params: params || {} }));
            setTimeout(function () {
              if (pending.has(myId)) { pending.delete(myId); rj(new Error('CDP ' + method + ' 超时')); }
            }, 30000);
          });
        },
        close() { try { ws.close(); } catch (e) { /* 忽略 */ } }
      });
    });
  });
}

/** 在页面里跑一段表达式，返回它的值（必须是 JSON 可序列化的） */
async function evalIn(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: '(function(){' + expr + '})()',
    returnByValue: true,
    awaitPromise: true
  });
  if (r.exceptionDetails) {
    throw new Error('页面内异常：' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description
      || r.exceptionDetails.text));
  }
  return r.result.value;
}

/* ================= 主流程 ================= */

console.log('▶ Android 端到端自测  (设备 ' + serial + ')');

let cdp = null;

(async function main() {
  try {
    ensureInstalled();

    /* 等 WebView 起来并注册 devtools socket */
    let sock = null;
    for (let i = 0; i < 40 && !sock; i++) {
      await new Promise(function (r) { setTimeout(r, 500); });
      sock = findSocket();
    }
    if (!sock) throw new Error('等不到 WebView 的 devtools socket，应用可能没起来');

    A(['forward', 'tcp:' + PORT, 'localabstract:' + sock]);

    let targets = null;
    for (let i = 0; i < 40 && !(targets && targets.length); i++) {
      await new Promise(function (r) { setTimeout(r, 500); });
      try { targets = await httpGetJson('/json/list'); } catch (e) { targets = null; }
    }
    assert(targets && targets.length, 'CDP 上没有可调试的页面');

    const page = targets.filter(function (x) { return x.type === 'page'; })[0] || targets[0];
    cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');

    /* 等页面里 QuadLab 就绪 */
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      try { ready = await evalIn(cdp, 'return !!(window.QuadLab && window.QuadLab.isReady && window.QuadLab.isReady());'); }
      catch (e) { ready = false; }
      if (!ready) await new Promise(function (r) { setTimeout(r, 500); });
    }

    /* ---- 断言 1：assets 真的载进来了 ---- */
    const basic = await evalIn(cdp, `
      return {
        url: location.href,
        title: document.title,
        hasKatex: typeof window.katex === 'string' ? 'global' : typeof window.katex,
        katexFonts: (function(){
          var n = 0;
          document.fonts.forEach(function(f){ if (/KaTeX/.test(f.family)) n++; });
          return n;
        })(),
        version: window.QuadLab.version,
        trigVersion: window.TrigLab.version,
        bridge: !!(window.QuadAndroid && window.QuadAndroid.isAndroid()),
        androidPlatform: window.QuadAndroid ? window.QuadAndroid.platform() : null,
        androidVersionName: window.QuadAndroid ? window.QuadAndroid.versionName() : null,
        isAndroidClass: document.documentElement.classList.contains('is-android'),
        cssLoaded: getComputedStyle(document.body).backgroundColor
      };
    `);

    t('WebView 加载的是 assets 里的页面', () => {
      assert(/^file:\/\/\/android_asset\/index\.html/.test(basic.url), '实际地址：' + basic.url);
      assert(basic.title.indexOf('二次函数') >= 0, '标题不对：' + basic.title);
    });
    t('离线 KaTeX 跟着进了 APK（公式能排版）', () => {
      assert(basic.hasKatex !== 'undefined', 'katex 未定义，vendor/ 没打进去');
      assert((basic.katexFonts || 0) > 0, '没有加载到任何 KaTeX 字体（@font-face 没生效）');
    });
    t('原生桥 window.QuadAndroid 可用', () => {
      assert(basic.bridge, 'isAndroid() 没有返回 true');
      assert(/^android-/.test(String(basic.androidPlatform)), 'platform() 异常：' + basic.androidPlatform);
      assert(basic.androidVersionName === '1.4.0', 'versionName 应为 1.4.0，实际 ' + basic.androidVersionName);
      assert(basic.isAndroidClass, '没有加上 is-android 标记');
    });
    t('样式表已生效且版本号为 1.4.0', () => {
      assert(basic.cssLoaded && basic.cssLoaded !== 'rgba(0, 0, 0, 0)', 'body 背景色为空，styles.css 没生效');
      assert(basic.version === '1.4.0', 'QuadLab.version = ' + basic.version);
      assert(basic.trigVersion === '1.4.0', 'TrigLab.version = ' + basic.trigVersion);
    });

    /* ---- 断言 2：真实手机屏上的布局 ---- */
    const layout = await evalIn(cdp, `
      window.scrollTo(0, 1200);
      var dock = document.getElementById('top-dock');
      var bar = document.getElementById('mode-bar');
      var db = dock.getBoundingClientRect();
      var bb = bar.getBoundingClientRect();
      /* 重叠 = 页头盖住切换条的像素数。切换条顶边应 >= dock 顶边，且整条都在 dock 内 */
      var overlap = Math.max(0, Math.round(db.top + 0) - Math.round(bb.top));
      var cx = Math.round(bb.left + bb.width / 2), cy = Math.round(bb.top + bb.height / 2);
      var hit = document.elementFromPoint(cx, cy);
      /* 触控目标体检：所有可见按钮 */
      var small = [];
      Array.prototype.forEach.call(document.querySelectorAll('button, select, .segmented button'), function (b) {
        var r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 44 || r.width < 44) small.push((b.id || b.textContent.trim().slice(0, 8)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      /* 输入框字号 < 16px 会被 iOS/部分安卓键盘放大页面 */
      var fontSmall = [];
      Array.prototype.forEach.call(document.querySelectorAll('input[type="text"], select, input[type="number"]'), function (i) {
        var fs = parseFloat(getComputedStyle(i).fontSize);
        if (fs < 16) fontSmall.push((i.id || i.className) + ' ' + fs + 'px');
      });
      var doc = document.documentElement;
      var overflow = doc.scrollWidth - doc.clientWidth;
      var shortLabels = document.querySelector('.mode-short') && getComputedStyle(document.querySelector('.mode-short')).display;
      var kbdHidden = getComputedStyle(document.querySelector('.kbd-hint')).display;
      var touchHint = getComputedStyle(document.querySelector('.touch-hint')).display;
      return {
        vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio,
        cssWidth: doc.clientWidth,
        dockTop: Math.round(db.top), barTop: Math.round(bb.top),
        headerHeight: Math.round(document.querySelector('.app-header').getBoundingClientRect().height),
        barHeight: Math.round(bb.height),
        overlap: overlap,
        hitTag: hit ? hit.tagName + '.' + (hit.className || '') : null,
        hitInBar: !!(hit && hit.closest && hit.closest('#mode-bar')),
        small: small, fontSmall: fontSmall, overflow: overflow,
        shortLabels: shortLabels, kbdHidden: kbdHidden, touchHint: touchHint,
        coarse: matchMedia('(pointer: coarse)').matches,
        safeAreaTop: getComputedStyle(document.querySelector('.top-dock')).paddingTop
      };
    `);

    /* 把真机上的实测数字打出来：以后布局回归时对着这几个数看就够了 */
    console.log('   · 设备视口 ' + layout.vw + '×' + layout.vh + ' css px（dpr ' + layout.dpr +
      '）页头 ' + layout.headerHeight + 'px · 切换条 ' + layout.barHeight + 'px');

    t('吸顶不重叠（v1.3.0 回归，在真机屏上复验）', () => {
      assert(layout.dockTop === 0, '滚动后 dock 没贴住顶部：top=' + layout.dockTop);
      assert(layout.overlap === 0, '页头仍盖住切换条 ' + layout.overlap + 'px');
      assert(layout.hitInBar, '切换条中心点命中的是 ' + layout.hitTag + '，不是切换条本身');
    });
    t('触控目标 ≥ 44px、输入框字号 ≥ 16px', () => {
      assert(layout.small.length === 0, '过小的控件：' + JSON.stringify(layout.small));
      assert(layout.fontSmall.length === 0, '字号过小的输入框：' + JSON.stringify(layout.fontSmall));
    });
    t('真机屏上无横向溢出，页头已瘦身', () => {
      assert(layout.overflow === 0, '横向溢出 ' + layout.overflow + 'px');
      assert(layout.headerHeight <= 130, '页头高 ' + layout.headerHeight + 'px，手机上太占地方');
      assert(layout.coarse, 'device 没有报告 pointer: coarse，触屏样式没生效');
      assert(layout.kbdHidden === 'none' && layout.touchHint !== 'none', '触屏下快捷键/捏合说明切换不正确');
    });

    /* ---- 断言 3：两个工作区都能用，画布有内容 ---- */
    const workspaces = await evalIn(cdp, `
      function canvasInk(id) {
        var c = document.getElementById(id);
        if (!c) return -1;
        var ctx = c.getContext('2d');
        var d = ctx.getImageData(0, 0, c.width, c.height).data;
        var seen = 0;
        for (var i = 0; i < d.length; i += 4 * 97) { if (d[i + 3] > 8) seen++; }
        return seen;
      }
      var out = {};
      out.quadInk = canvasInk('plot');
      out.quadMd = (window.QuadLab.getMarkdown() || '').length;
      document.querySelector('#mode-bar [data-mode="trig"]').click();
      out.mode = window.QuadLab.getMode();
      out.trigInk = canvasInk('tri-plot');
      out.unitInk = canvasInk('unit-plot');
      out.trigMd = (window.TrigLab.getMarkdown() || '').length;
      var doc = document.documentElement;
      out.trigOverflow = doc.scrollWidth - doc.clientWidth;
      document.querySelector('#mode-bar [data-mode="quad"]').click();
      out.back = window.QuadLab.getMode();
      return out;
    `);

    t('二次函数工作区：报告与图像都正常', () => {
      assert(workspaces.quadMd > 500, '报告太短，可能没生成：' + workspaces.quadMd);
      assert(workspaces.quadInk > 20, '画布几乎是空白（采样到 ' + workspaces.quadInk + ' 个不透明点）');
    });
    t('三角函数工作区：切换、两张画布、无溢出', () => {
      assert(workspaces.mode === 'trig', '点切换条没有切到三角函数');
      assert(workspaces.trigMd > 500, '三角函数报告太短：' + workspaces.trigMd);
      assert(workspaces.trigInk > 20, '三角形画布空白（' + workspaces.trigInk + '）');
      assert(workspaces.unitInk > 20, '单位圆画布空白（' + workspaces.unitInk + '）');
      assert(workspaces.trigOverflow === 0, '三角函数工作区横向溢出 ' + workspaces.trigOverflow + 'px');
      assert(workspaces.back === 'quad', '切不回二次函数');
    });

    /* ---- 断言 4：原生导出真的落盘 ---- */
    const stamp = Date.now();
    const mdName = 'quadlab-selftest-' + stamp + '.md';
    const pngName = 'quadlab-selftest-' + stamp + '.png';

    const exportResult = await evalIn(cdp, `
      window.__qa = { md: null, png: null };
      var md = window.QuadLab.getMarkdown();
      var bytes = new TextEncoder().encode(md);
      var bin = ''; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      window.QuadAndroid.saveFile('${mdName}', 'text/markdown', btoa(bin));
      var url = window.QuadLab.getCanvasDataURL();
      window.QuadAndroid.saveFile('${pngName}', 'image/png', url.replace(/^data:image\\/png;base64,/, ''));
      return { mdLen: md.length, pngLen: url.length, clip: (function(){ try { window.QuadAndroid.copy(md); return true; } catch(e){ return false; } })() };
    `);
    assert(exportResult.mdLen > 500, '导出时报告为空');

    await new Promise(function (r) { setTimeout(r, 1500); });

    const listing = A(['shell', 'ls', '-l', '/sdcard/Download/']);
    t('原生导出：Markdown 报告写入「下载」目录', () => {
      assert(listing.indexOf(mdName) >= 0, '下载目录里没有 ' + mdName + '，实际：\n' + listing);
    });
    t('原生导出：PNG 图像写入「下载」目录', () => {
      assert(listing.indexOf(pngName) >= 0, '下载目录里没有 ' + pngName + '，实际：\n' + listing);
    });
    t('原生剪贴板可用', () => {
      assert(exportResult.clip, '调用 QuadAndroid.copy 抛异常');
    });

    /* 把导出的 md 拉回来，确认内容与页面里的一致（不是空文件） */
    const tmp = path.join(ROOT, 'android', 'build', '_selftest.md');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    A(['pull', '/sdcard/Download/' + mdName, tmp]);
    const pulled = fs.readFileSync(tmp, 'utf8');
    t('导出的 Markdown 内容完整（无截断、无乱码）', () => {
      assert(pulled.length > 500, '拉回来的文件只有 ' + pulled.length + ' 字符');
      /* 页面里的字符数必须与落盘文件完全一致：差一个字符都说明 Base64 往返被截断了 */
      assert(pulled.length === exportResult.mdLen,
        '落盘 ' + pulled.length + ' 字符，页面里是 ' + exportResult.mdLen + ' 字符 —— 传输被截断了');
      assert(pulled.indexOf('二次函数') >= 0, '内容里找不到中文标题，可能编码坏了');
      assert(pulled.indexOf('\ufffd') < 0, '内容里有替换字符（乱码）');
      assert(/[|$]|\\/.test(pulled) || pulled.indexOf('（') >= 0,
        '内容里没有任何 Markdown 结构，可能是空壳报告');
    });
    fs.unlinkSync(tmp);

    /* 清掉自测文件 */
    A(['shell', 'rm', '-f', '/sdcard/Download/' + mdName, '/sdcard/Download/' + pngName]);

    /* ---- 断言 5：没有权限申请、没有崩溃 ---- */
    const badging = A(['shell', 'dumpsys', 'package', PKG]);
    const perms = (badging.match(/requested permissions:/) ? badging.split('requested permissions:')[1].split('\n').slice(0, 12).join('\n') : '');
    t('没有申请任何权限（纯离线应用）', () => {
      assert(!/android\.permission\./.test(perms), '申请了权限：' + perms);
    });

    const crash = A(['logcat', '-d', '-b', 'crash']);
    t('运行期间没有崩溃日志', () => {
      assert(crash.indexOf(PKG) < 0, '崩溃日志里出现了本应用：\n' + crash.slice(-800));
    });

  } catch (err) {
    fail++;
    console.log('  FAIL 测试流程中断\n       ' + (err && err.message));
    if (err && err.stack) console.log(String(err.stack).split('\n').slice(1, 4).join('\n'));
  } finally {
    if (cdp) cdp.close();
    try { adb(['forward', '--remove', 'tcp:' + PORT]); } catch (e) { /* 忽略 */ }
    console.log('\n  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
    process.exit(fail ? 1 : 0);
  }
})();
