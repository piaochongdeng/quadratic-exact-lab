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
 * 依赖：一台已连接（adb devices 可见）的设备。默认验 debug 包（CDP 全量断言），
 *       设 ANDROID_APK=<正式包路径> 则降级为 adb 层检查（正式包不开远程调试）。
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
/* 默认验 debug 包；想验签名过的正式包就设 ANDROID_APK=<绝对路径>：
     set ANDROID_APK=D:\...\quadratic-exact-lab-1.4.1-release.apk
   正式包不开 WebView 远程调试（那是 debug 专属），所以这条路径验的是
   「页面能起来、布局对、导出真落盘」，验不了 CDP —— 脚本会自动降级。 */
const APK = process.env.ANDROID_APK || path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug',
  'quadratic-exact-lab-1.4.1-debug.apk');
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
  if (!fs.existsSync(APK)) {
    throw new Error('没有找到 APK：' + APK + '（debug 包先跑 gradlew assembleDebug，正式包先跑 assembleRelease）');
  }
  let out = A(['install', '-r', APK]);
  /* debug 包与正式包的签名密钥不同，直接 -r 覆盖会报 INSTALL_FAILED_UPDATE_INCOMPATIBLE。
     这时先卸掉旧包再装 —— 应用本身不存任何用户数据，卸载无副作用。 */
  if (out.indexOf('Success') < 0 && /UPDATE_INCOMPATIBLE|signatures do not match/i.test(out)) {
    console.log('  · 设备上是另一个签名的同包名版本，先卸载再装');
    A(['uninstall', PKG]);
    out = A(['install', '-r', APK]);
  }
  if (out.indexOf('Success') < 0) throw new Error('安装失败：' + out.trim());

  A(['shell', 'am', 'force-stop', PKG]);
  A(['logcat', '-c']);
  A(['shell', 'am', 'start', '-n', PKG + '/.MainActivity']);
}

/* ---------- 2. 连上 WebView 的 devtools ---------- */

/** 应用主进程的 pid：WebView 的 devtools socket 名字就是 webview_devtools_remote_<主进程pid> */
function appPid() {
  let out = A(['shell', 'pidof', PKG]).trim();
  if (!/^\d/.test(out)) {
    out = A(['shell', 'ps', '-A', '-o', 'PID,NAME'])
      .split('\n')
      .filter(function (l) { return l.trim().split(/\s+/).pop() === PKG; })
      .map(function (l) { return l.trim().split(/\s+/)[0]; })
      .join(' ');
  }
  return (out.split(/\s+/)[0] || '').trim();
}

/** 只认「属于本应用主进程」的那一个 socket。
    /proc/net/unix 是全设备可见的，别的应用也会挂同名 socket ——
    不按 pid 过滤的话，正式包这一轮可能连到别人的调试端口上，test 会给出假绿。 */
function findSocket() {
  const pid = appPid();
  if (!pid) return null;
  const names = A(['shell', 'cat', '/proc/net/unix']).split('\n')
    .map(function (l) { return (l.match(/webview_devtools_remote(_\d+)?/) || [])[0]; })
    .filter(Boolean);
  return names.indexOf('webview_devtools_remote_' + pid) >= 0
    ? 'webview_devtools_remote_' + pid
    : null;
}

/** 装上去的这个包本身是不是 debuggable 构建（dumpsys 的 flags 里带 DEBUGGABLE） */
function isDebuggableInstalled() {
  return A(['shell', 'dumpsys', 'package', PKG]).indexOf('DEBUGGABLE') >= 0;
}

/** 要验的这个 APK 是不是正式包 —— 由 APK 自己说了算，不看文件名。
    （文件可能被改名成 dl.apk 之类，靠名字猜变体会误判。） */
function apkIsRelease() {
  const bt = path.join(SDK, 'build-tools');
  if (!fs.existsSync(bt)) return null;
  const exe = process.platform === 'win32' ? 'aapt2.exe' : 'aapt2';
  const aapt2 = fs.readdirSync(bt).sort().reverse()
    .map(function (v) { return path.join(bt, v, exe); })
    .filter(function (p) { return fs.existsSync(p); })[0];
  if (!aapt2) return null;
  const res = spawnSync(aapt2, ['dump', 'badging', APK], { encoding: 'utf8', timeout: 60000 });
  if (res.error || !res.stdout) return null;
  return res.stdout.indexOf('application-debuggable') < 0;   /* badging 里有这行才是调试包 */
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

/* ---------- 3. 不依赖 CDP 的两条公共断言 ---------- */

function commonTailChecks() {
  const badging = A(['shell', 'dumpsys', 'package', PKG]);
  const perms = (badging.match(/requested permissions:/) ? badging.split('requested permissions:')[1].split('\n').slice(0, 12).join('\n') : '');
  t('没有申请任何权限（纯离线应用）', () => {
    assert(!/android\.permission\./.test(perms), '申请了权限：' + perms);
  });

  const crash = A(['logcat', '-d', '-b', 'crash']);
  t('运行期间没有崩溃日志', () => {
    assert(crash.indexOf(PKG) < 0, '崩溃日志里出现了本应用：\n' + crash.slice(-800));
  });
}

/* ---------- 4. 正式包（不可调试）的降级检查 ----------
   正式包在正式镜像上不开 WebView 远程调试（MainActivity 里判了 FLAG_DEBUGGABLE），
   拿不到 CDP，所以这里改用 adb 能拿到的东西：
     · 窗口真的建起来了、Activity 处于 resumed
     · 页面真的渲染了东西（用 screencap 的原始像素格式直接统计墨色占比，不需要解码 PNG）
     · 资源没有加载失败（logcat 里的 net::ERR_* 是 assets 缺失的信号）
   然后接上面那两条公共断言。 */

function screencapStats() {
  /* `screencap` 不带 -p 时输出的是 12 字节头 + RGBA 原始像素，Node 直接读，不用任何解码库 */
  const res = spawnSync(ADB, ['-s', serial, 'exec-out', 'screencap'],
    { maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
  if (res.error || !res.stdout || res.stdout.length < 16) return null;
  const buf = res.stdout;
  const w = buf.readUInt32LE(0), h = buf.readUInt32LE(4);
  if (!w || !h || buf.length < 12 + w * h * 4) return null;
  let dark = 0, total = 0;
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const o = 12 + (y * w + x) * 4;
      total++;
      if (buf[o] < 170 && buf[o + 1] < 170 && buf[o + 2] < 170) dark++;
    }
  }
  return { w: w, h: h, ink: dark / total };
}

function releaseSmokeChecks() {
  console.log('  · 这是不可调试的正式包，拿不到 devtools socket —— 只跑 adb 层的检查');

  const top = A(['shell', 'dumpsys', 'activity', 'activities']);
  t('正式包能启动且处于前台', () => {
    assert(top.indexOf(PKG) >= 0, 'dumpsys activity 里找不到本应用');
    assert(/ResumedActivity[\s\S]{0,200}?quadraticexactlab/.test(top)
      || top.indexOf(PKG + '/.MainActivity') >= 0, 'Activity 没有进入 resumed 状态');
  });

  const logs = A(['shell', 'logcat', '-d', '-v', 'brief']);
  t('页面资源全部加载成功（没有 ERR_FILE_NOT_FOUND）', () => {
    const bad = ['ERR_FILE_NOT_FOUND', 'ERR_ACCESS_DENIED', 'ERR_INVALID_URL']
      .filter(function (k) { return logs.indexOf(k) >= 0; });
    assert(!bad.length, 'logcat 里有加载失败：' + bad.join(', '));
  });

  const shot = screencapStats();
  t('页面真的渲染出了内容（不是白屏）', () => {
    assert(shot, 'screencap 拿不到像素数据');
    assert(shot.ink > 0.004, '屏幕上几乎没有墨色像素（ink=' + shot.ink.toFixed(4) + '），疑似白屏');
    assert(shot.ink < 0.6, '屏幕几乎全黑（ink=' + shot.ink.toFixed(4) + '），疑似渲染失败');
  });
  if (shot) console.log('   · 正式包截图 ' + shot.w + '×' + shot.h + '，墨色像素占比 ' + shot.ink.toFixed(4));

  commonTailChecks();
}

/* ================= 主流程 ================= */

console.log('▶ Android 端到端自测  (设备 ' + serial + ')');

let cdp = null;

(async function main() {
  try {
    ensureInstalled();

    /* 装上去的包是不是不可调试的正式包 —— 这是正式版最该守住的一条。
       顺带把「设备镜像本身可不可调试」也读出来，后面判断调试端口合不合法要看它。 */
    const debuggable = isDebuggableInstalled();
    const deviceDebuggable = A(['shell', 'getprop', 'ro.debuggable']).trim() === '1';
    const wantedRelease = apkIsRelease();
    if (wantedRelease === null) {
      console.log('  · 找不到 aapt2（' + path.join(SDK, 'build-tools') + '），跳过「变体一致」这条断言');
    } else {
      t(wantedRelease ? '正式包装起来是不可调试的' : 'debug 包装起来是可调试的', () => {
        assert(debuggable === !wantedRelease,
          'APK 是 ' + (wantedRelease ? 'release' : 'debug') + ' 变体，但装出来的包 debuggable=' + debuggable);
      });
    }

    /* 等 WebView 起来并注册 devtools socket */
    let sock = null;
    for (let i = 0; i < 30 && !sock; i++) {
      await new Promise(function (r) { setTimeout(r, 500); });
      sock = findSocket();
    }

    if (sock && !debuggable && !deviceDebuggable) {
      /* 正式包 + 正式镜像：本来就不该有这个端口，说明有人误改了 MainActivity */
      throw new Error('正式包在正式镜像上挂出了 WebView 调试端口：' + sock);
    }
    if (sock && !debuggable && deviceDebuggable) {
      /* 正式包 + userdebug 镜像（模拟器）：平台自己会把调试打开，应用压不住。
         这不是缺陷，但要说清楚，别把它当成「正式包很安全」的证据。 */
      console.log('  · 设备镜像是 userdebug（ro.debuggable=1），平台会强制打开 WebView 调试，'
        + '这条 socket 不是应用开的；正式（user）镜像上没有。');
    }
    if (!sock) {
      if (debuggable) throw new Error('debug 包应该开 WebView 远程调试，却等不到 devtools socket');
      return releaseSmokeChecks();
    }

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
      assert(basic.androidVersionName === '1.4.1', 'versionName 应为 1.4.1，实际 ' + basic.androidVersionName);
      assert(basic.isAndroidClass, '没有加上 is-android 标记');
    });
    t('样式表已生效且版本号为 1.4.1', () => {
      assert(basic.cssLoaded && basic.cssLoaded !== 'rgba(0, 0, 0, 0)', 'body 背景色为空，styles.css 没生效');
      assert(basic.version === '1.4.1', 'QuadLab.version = ' + basic.version);
      assert(basic.trigVersion === '1.4.1', 'TrigLab.version = ' + basic.trigVersion);
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

    /* ---- 断言 3.5：v1.4.1 的三样新东西，必须能在真机屏上真的用起来 ----
       手机上根本没有 √ 键，所以数学键盘不是「锦上添花」，而是唯一入口；
       设置与使用说明两个弹窗也必须在小屏上放得下、点得到。 */
    const newUi = await evalIn(cdp, `
      return (async function () {
      function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      var out = {};
      /* ---- 数学键盘：手机上没有 √ 键，点键盘上的 √ 再补 2，常数项就写成 √2 ---- */
      out.quadKeys = document.querySelectorAll('#math-keys .mk').length;
      out.trigKeys = document.querySelectorAll('#trig-math-keys .mk').length;
      window.QuadLab.setForm('general');
      await sleep(160);
      /* 先摆一个干净、必定有解的式子：y = x² + √2（Δ = -4√2 < 0，无实数零点） */
      window.QuadLab.setState({ form: 'general', values: { general: { a: '1', b: '0', c: '1' } }, domain: 'all' });
      await sleep(400);
      out.keypadBaseline = (window.QuadLab.getMarkdown() || '').length;

      var c0 = document.getElementById('in-c');
      c0.focus();
      c0.value = '';
      c0.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(140);
      var c = document.getElementById('in-c');
      c.focus();
      document.querySelector('#math-keys .mk[data-insert="√"]').click();
      await sleep(60);
      window.QuadLab.insertMath('2');
      await sleep(80);
      out.keypadTyped = document.getElementById('in-c').value;
      document.getElementById('in-c').dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(520);
      out.keypadInReport = (window.QuadLab.getMarkdown() || '').indexOf('sqrt{2}') >= 0;
      out.keypadStateC = window.QuadLab.getState().values.general.c;
      out.keypadError = document.getElementById('err-slot').textContent.slice(0, 100);
      window.QuadLab.setState({ form: 'general', values: { general: { a: '1', b: '-2', c: '3' } }, domain: 'all' });
      await sleep(400);
      /* 键盘最小键位也要点得到 */
      var mks = document.querySelectorAll('#math-keys .mk');
      var minH = 999, minW = 999;
      Array.prototype.forEach.call(mks, function (b) {
        var r = b.getBoundingClientRect();
        if (r.height < minH) minH = r.height;
        if (r.width < minW) minW = r.width;
      });
      out.keypadMin = Math.round(Math.min(minH, minW));
      /* ---- 结论速览必须排在最上面，且三件事都在 ---- */
      var md = window.QuadLab.getMarkdown() || '';
      var head = md.slice(0, md.indexOf('## 二、'));
      out.quickVertex = head.indexOf('顶点坐标') >= 0;
      out.quickExtremum = head.indexOf('最小值') >= 0 || head.indexOf('最大值') >= 0;
      out.quickForms = head.indexOf('三种形式的互化') >= 0;
      out.quickIsFirst = md.indexOf('## 一、结论速览') >= 0 && md.indexOf('## 一、结论速览') < md.indexOf('## 二、');
      /* ---- 设置弹窗 ---- */
      window.QuadLab.openSettings();
      await sleep(220);
      var sm = document.getElementById('settings-modal');
      var sp = sm.querySelector('.modal-panel').getBoundingClientRect();
      out.settingsOpen = sm.hidden === false;
      out.settingsFits = sp.left >= -1 && sp.right <= window.innerWidth + 1 && sp.top >= -1;
      out.settingsNoOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      var closeR = document.getElementById('btn-settings-close').getBoundingClientRect();
      out.settingsCloseTarget = Math.round(Math.min(closeR.width, closeR.height));
      /* 在设置里改位数，报告要跟着变（两个工作区共用一个值） */
      window.QuadLab.setSettings({ decimals: 2 });
      await sleep(420);
      out.decimalsInState = window.QuadLab.getSettings().decimals;
      out.decimalsInInput = document.getElementById('opt-decimals').value;
      window.QuadLab.setSettings({ decimals: 4 });
      await sleep(300);
      document.getElementById('btn-settings-close').click();
      await sleep(200);
      out.settingsClosed = sm.hidden === true;
      /* ---- 使用说明弹窗 ---- */
      window.QuadLab.openHelp();
      await sleep(260);
      var hm = document.getElementById('help-modal');
      var hr = hm.querySelector('.modal-panel').getBoundingClientRect();
      out.helpOpen = hm.hidden === false;
      out.helpFits = hr.left >= -1 && hr.right <= window.innerWidth + 1 && hr.top >= -1;
      out.helpNoOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      out.helpLen = document.getElementById('help-body').textContent.length;
      out.helpKatexErrors = document.querySelectorAll('#help-body .katex-error').length;
      out.helpSaysKeypad = document.getElementById('help-body').textContent.indexOf('数学键盘') >= 0;
      var hcR = document.getElementById('btn-help-close').getBoundingClientRect();
      out.helpCloseTarget = Math.round(Math.min(hcR.width, hcR.height));
      document.getElementById('btn-help-close').click();
      await sleep(200);
      out.helpClosed = hm.hidden === true;
      /* ---- 三角函数工作区里也能写根号 ---- */
      document.querySelector('#mode-bar [data-mode="trig"]').click();
      await sleep(420);
      document.querySelector('#trig-fn-tabs [data-fn="sin"]').click();
      await sleep(160);
      /* 函数值输入框只在「我输入函数值」这一档下才露出来 */
      document.querySelector('#trig-src-tabs [data-src="user"]').click();
      await sleep(260);
      var tv = document.getElementById('trig-value');
      out.trigValueVisible = tv.offsetParent !== null;
      tv.value = '';
      tv.focus();
      document.querySelector('#trig-math-keys .mk[data-insert="√"]').click();
      await sleep(80);
      window.QuadLab.insertMath('3/2');
      await sleep(520);
      out.trigValueTyped = document.getElementById('trig-value').value;
      out.trigSqrtMd = window.TrigLab.getMarkdown() || '';
      out.trigSqrtExact = out.trigSqrtMd.indexOf('sqrt{3}') >= 0;
      out.trigSqrtAngle60 = out.trigSqrtMd.indexOf('60') >= 0;
      out.trigOverflowAfter = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      document.querySelector('#mode-bar [data-mode="quad"]').click();
      await sleep(300);
      out.overflowAtEnd = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return out;
      })();
    `);

    t('数学键盘在真机屏上真的能用（手机打不出 √，这是唯一入口）', () => {
      assert(newUi.quadKeys >= 10 && newUi.trigKeys >= 10,
        '两个工作区的键位数量不对：' + newUi.quadKeys + ' / ' + newUi.trigKeys);
      assert(newUi.quadKeys === newUi.trigKeys,
        '两个工作区的键盘键位不一样多：' + newUi.quadKeys + ' / ' + newUi.trigKeys);
      assert(newUi.keypadTyped === '√2', '点 √ 再插 2 之后输入框里是 ' + JSON.stringify(newUi.keypadTyped));
      assert(newUi.keypadBaseline > 500, '基线报告就不正常，长度 ' + newUi.keypadBaseline);
      assert(newUi.keypadInReport,
        '√2 没有被算进报告：状态里是 ' + JSON.stringify(newUi.keypadStateC) +
        '，提示格：' + JSON.stringify(newUi.keypadError));
      assert(newUi.keypadMin >= 44, '最小的键位只有 ' + newUi.keypadMin + 'px，手指点不准');
    });
    t('结论速览固定排在最上面，三件事齐全', () => {
      assert(newUi.quickIsFirst, '「一、结论速览」不在最前面');
      assert(newUi.quickVertex, '结论速览里没有顶点坐标');
      assert(newUi.quickExtremum, '结论速览里没有最大/最小值');
      assert(newUi.quickForms, '结论速览里没有三种形式的互化');
    });
    t('设置弹窗在真机屏上放得下、点得到、改了就生效', () => {
      assert(newUi.settingsOpen, '设置弹窗没打开');
      assert(newUi.settingsFits, '设置面板超出屏幕');
      assert(newUi.settingsNoOverflow === 0, '设置面板撑出横向滚动 ' + newUi.settingsNoOverflow + 'px');
      assert(newUi.settingsCloseTarget >= 44, '关闭键只有 ' + newUi.settingsCloseTarget + 'px');
      assert(newUi.decimalsInState === 2, '设置的位数没写进状态：' + newUi.decimalsInState);
      assert(newUi.decimalsInInput === '2', '设置的位数没同步到输入框：' + newUi.decimalsInInput);
      assert(newUi.settingsClosed, '设置弹窗没关掉');
    });
    t('使用说明弹窗在真机屏上可读、可关', () => {
      assert(newUi.helpOpen, '使用说明没打开');
      assert(newUi.helpFits, '使用说明面板超出屏幕');
      assert(newUi.helpNoOverflow === 0, '使用说明撑出横向滚动 ' + newUi.helpNoOverflow + 'px');
      assert(newUi.helpLen > 2000, '说明正文太短：' + newUi.helpLen + ' 字符');
      assert(newUi.helpKatexErrors === 0, '说明里有 ' + newUi.helpKatexErrors + ' 处公式排版错误');
      assert(newUi.helpSaysKeypad, '说明里没有讲数学键盘');
      assert(newUi.helpCloseTarget >= 44, '关闭键只有 ' + newUi.helpCloseTarget + 'px');
      assert(newUi.helpClosed, '使用说明没关掉');
    });
    t('三角函数工作区里也能用键盘写根号并精确反推', () => {
      assert(newUi.trigValueVisible === true, '「我输入函数值」档位下函数值输入框没露出来');
      assert(newUi.trigValueTyped === '√3/2', '三角函数输入框里是 ' + JSON.stringify(newUi.trigValueTyped));
      assert(newUi.trigSqrtExact, '报告里没有 √3');
      assert(newUi.trigSqrtAngle60, 'sin θ = √3/2 没有反推出 60°');
      assert(newUi.trigOverflowAfter === 0 && newUi.overflowAtEnd === 0,
        '收尾时横向溢出 ' + newUi.trigOverflowAfter + ' / ' + newUi.overflowAtEnd + 'px');
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
    commonTailChecks();

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
