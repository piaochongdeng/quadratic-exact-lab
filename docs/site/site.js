/*!
 * quadratic-exact-lab · 官网脚本
 * ------------------------------------------------------------------
 * 下载区不写死版本号：优先读 GitHub Releases API，拿到什么就显示什么，
 * 所以以后发新版，官网自动跟着变，不需要改这个文件。
 * API 失败（限流 / 离线）时退回同源的 site/releases.json（打包时生成）。
 * 无任何第三方依赖。
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  var REPO = 'piaochongdeng/quadratic-exact-lab';
  var API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  var FALLBACK = 'site/releases.json';
  var RELEASES_PAGE = 'https://github.com/' + REPO + '/releases';

  /* ===================== 安装包镜像 =====================
     官网同时挂在两个地方：GitHub Pages 和自有服务器。安装包本体一直托管在
     GitHub（release-assets.githubusercontent.com），国内下载实测只有 19 KB/s，
     90MB 的 EXE 要一个多小时。自有服务器上有一份镜像（由
     scripts/mirror-releases.sh 每天从 GitHub 同步），同一条线路实测中位数
     约 2.5 MB/s。

     只在镜像站上才用它：GitHub Pages 那份页面的同源目录里没有 dl/，
     指过去必然 404。判断方式是看当前域名。

     清单 dl-mirror.json 由镜像脚本在文件校验通过之后才写，所以
     「清单里有这个名字」就等于「本地确实有一份完整且哈希正确的文件」。
     版本对不上（刚发了新版、镜像还没同步）就退回 GitHub 链接 ——
     宁可用慢的，也不给一个点了 404 的按钮。 */
  var MIRROR_HOSTS = ['43.155.128.66'];
  var MIRROR_MANIFEST = 'dl-mirror.json';
  var MIRROR_PREFIX = '/dl/';

  var mirror = null;   /* 镜像清单；不在镜像站上时保持 null */

  function onMirrorHost() {
    return MIRROR_HOSTS.indexOf(location.hostname) >= 0;
  }

  function loadMirror() {
    if (!onMirrorHost()) return Promise.resolve(null);
    return fetch(MIRROR_MANIFEST, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* 这个文件在本地镜像里有吗？有就返回本地地址，没有返回 null */
  function mirrorUrl(asset, release) {
    if (!mirror || !mirror.assets || !release) return null;
    if (mirror.tag !== release.tag) return null;      /* 镜像还是上一版 */
    if (!mirror.assets[asset.name]) return null;
    return MIRROR_PREFIX + encodeURIComponent(asset.name);
  }

  /* ===================== 小工具 ===================== */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '—';
    var mb = bytes / 1048576;
    if (mb >= 1) return mb.toFixed(mb >= 100 ? 0 : 1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function fmtCount(n) {
    if (!n && n !== 0) return '';
    return n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : String(n);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ===================== 平台识别 ===================== */
  function detectOS() {
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/Windows|Win32|Win64|WOW64/i.test(ua)) return 'windows';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'mac';
    if (/Linux/i.test(ua)) return 'linux';
    return 'other';
  }

  /* ===================== 资产归类 =====================
     只认后缀，不认版本号，所以命名规则不变就一直有效。
     APK 可能有多个 ABI 变体，优先挑「通用」那个。 */
  function pickAsset(assets, kind) {
    var apks = assets.filter(function (a) { return /\.apk$/i.test(a.name); });
    var exes = assets.filter(function (a) { return /\.exe$/i.test(a.name); });
    var zips = assets.filter(function (a) { return /\.zip$/i.test(a.name); });

    if (kind === 'android') {
      if (!apks.length) return null;
      // 优先 release 包；其次不带 ABI 后缀的通用包；再退而求其次取第一个
      var rel = apks.filter(function (a) { return /release/i.test(a.name); });
      var pool = rel.length ? rel : apks;
      var universal = pool.filter(function (a) { return !/(arm64|armeabi|armv7|x86_64|x86)/i.test(a.name); });
      return (universal.length ? universal : pool)[0];
    }
    if (kind === 'win-setup') {
      if (!exes.length) return null;
      var x64 = exes.filter(function (a) { return /x64|amd64|64/i.test(a.name); });
      return (x64.length ? x64 : exes)[0];
    }
    if (kind === 'win-zip') {
      if (!zips.length) return null;
      var xz = zips.filter(function (a) { return /x64|amd64|win/i.test(a.name); });
      return (xz.length ? xz : zips)[0];
    }
    return null;
  }

  /* ===================== 渲染下载卡片 ===================== */
  var KIND_LABEL = {
    'android': 'Android 手机 / 平板',
    'win-setup': 'Windows 安装包',
    'win-zip': 'Windows 免安装'
  };

  function fillCard(card, asset, release) {
    var body = $('[data-dl-body]', card);
    var btn = $('[data-dl-btn]', card);
    var facts = $('[data-dl-facts]', card);
    var hashBox = $('[data-dl-hash]', card);

    if (!asset) {
      if (body) body.textContent = '本次发布没有提供该平台的文件。';
      if (btn) { btn.setAttribute('aria-disabled', 'true'); btn.classList.add('is-loading'); }
      return;
    }

    if (facts) {
      facts.innerHTML = '';
      /* 不显示下载次数：新项目基本都是 0～个位数，摆出来既不好看，
         又会让「有次数的那张卡多一行」把三张卡的高度撑得参差不齐。
         真要看得去 GitHub Releases 看，那里更权威。 */
      var local = mirrorUrl(asset, release);
      var rows = [
        ['版本', release.tag],
        ['大小', fmtSize(asset.size)],
        ['日期', fmtDate(release.date)],
        /* 三张卡都显示这一行，高度保持一致。
           写明来源是有用的：镜像站上点下载走本地直连（实测中位数 2.5 MB/s），
           退回 GitHub 时国内可能要等一个多小时，用户有权知道自己在等什么。 */
        ['来源', local ? '本站镜像' : 'GitHub']
      ];
      rows.forEach(function (r) {
        if (!r[1]) return;
        var d = el('div');
        d.appendChild(el('span', 'k', r[0]));
        d.appendChild(el('span', 'v', r[1]));
        facts.appendChild(d);
      });
    }

    if (hashBox) {
      var sha = asset.sha256;
      if (sha) {
        hashBox.hidden = false;
        $('code', hashBox).textContent = sha;
      } else {
        hashBox.hidden = true;
      }
    }

    if (btn) {
      var localUrl = mirrorUrl(asset, release);
      btn.href = localUrl || asset.url;
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-disabled');
      btn.setAttribute('download', '');
      btn.setAttribute('rel', 'noopener');
      // 带上下载地址里的文件名，便于用户确认下到的是什么
      btn.title = localUrl
        ? '下载 ' + asset.name + '（本站镜像，国内直连）'
        : '下载 ' + asset.name + '（来自 GitHub）';
    }
  }

  function applyRelease(release, opts) {
    var bar = $('[data-rel-bar]');
    var status = $('[data-rel-status]');

    // 顶部版本条
    if (bar) {
      $('[data-rel-ver]', bar).textContent = release.tag;
      var when = fmtDate(release.date);
      $('[data-rel-when]', bar).textContent = when ? '发布于 ' + when : '';
      var link = $('[data-rel-link]', bar);
      if (link) link.href = release.htmlUrl || RELEASES_PAGE;
    }
    if (status) {
      status.textContent = opts && opts.stale
        ? '（网络不可用，显示的是打包时的版本快照，请以 GitHub Releases 为准）'
        : '';
      status.className = 'rel-status' + (opts && opts.stale ? ' warn' : '');
    }

    var os = detectOS();
    var map = [
      ['android', 'android'],
      ['win-setup', 'win-setup'],
      ['win-zip', 'win-zip']
    ];
    var recommended = os === 'android' ? 'android' : (os === 'windows' ? 'win-setup' : null);

    var mirrored = 0;
    map.forEach(function (pair) {
      var card = $('[data-dl="' + pair[0] + '"]');
      if (!card) return;
      var asset = pickAsset(release.assets, pair[0]);
      if (asset && mirrorUrl(asset, release)) mirrored++;
      fillCard(card, asset, release);
      var isRec = recommended === pair[0];
      card.classList.toggle('rec', isRec);
      var nameEl = $('[data-dl-name]', card);
      if (nameEl) nameEl.textContent = asset ? asset.name : '';
    });

    /* 说清楚这次点下载会从哪儿取文件。
       镜像站上如果还没同步到最新版，这里要讲明白，否则用户看到
       「来源：GitHub」会以为镜像坏了。 */
    var mirrorNote = $('[data-dl-mirror-note]');
    if (mirrorNote) {
      if (!onMirrorHost()) {
        mirrorNote.textContent = '';
        mirrorNote.className = 'rel-status';
      } else if (mirrored) {
        mirrorNote.textContent = '安装包已同步到本站，点按钮直接从本站下载（国内直连），不用等 GitHub。';
        mirrorNote.className = 'rel-status';
      } else {
        mirrorNote.textContent = '本站镜像还在同步最新版，按钮暂时指向 GitHub Releases。';
        mirrorNote.className = 'rel-status warn';
      }
    }

    // 主按钮跟着平台走
    var primary = $('[data-cta-primary]');
    if (primary) {
      var text = '下载';
      if (os === 'android') text = '下载 Android 版';
      else if (os === 'windows') text = '下载 Windows 版';
      var label = $('[data-cta-primary-label]', primary);
      if (label) label.textContent = text;
      primary.href = '#download';
    }

    var platNote = $('[data-dl-platform-note]');
    if (platNote) {
      if (os === 'android') platNote.textContent = '检测到你在用 Android，已把安卓版排在最前面。';
      else if (os === 'windows') platNote.textContent = '检测到你在用 Windows，已把 Windows 安装包排在最前面。';
      else if (os === 'ios' || os === 'mac') platNote.textContent = '当前只提供 Windows 与 Android 版；你在用的系统暂时没有原生版本。';
      else platNote.textContent = '';
    }

    /* 上面的提示说了「已把 X 排在最前面」，那就真的排——原来只写了文案没动卡片，
       用户看到的是「提示说排前面了，可 Android 还在最上面」，自相矛盾（被挑出来过）。
       用 order 排序而不是挪 DOM：卡片里的 <details> 展开状态、已绑的事件都不用重来。 */
    var grid = $('.dl-grid');
    if (grid) {
      var order = { 'android': 0, 'win-setup': 1, 'win-zip': 2 };
      if (recommended === 'android') order = { 'android': 0, 'win-setup': 1, 'win-zip': 2 };
      else if (recommended === 'win-setup') order = { 'win-setup': 0, 'android': 1, 'win-zip': 2 };
      $$('.dl-card', grid).forEach(function (card) {
        var k = card.getAttribute('data-dl');
        card.style.order = (k in order) ? order[k] : 9;
      });
    }
  }

  /* ===================== 数据源 ===================== */
  function normalizeApi(json) {
    return {
      tag: json.tag_name || json.name || '未知版本',
      date: json.published_at || '',
      htmlUrl: json.html_url || RELEASES_PAGE,
      body: json.body || '',
      assets: (json.assets || []).map(function (a) {
        return {
          name: a.name,
          size: a.size,
          count: a.download_count,
          url: a.browser_download_url,
          /* GitHub 的 digest 形如 "sha256:abc…"；老响应里没有这个字段，
             那就等同源快照 mergeHashes 补上 */
          sha256: String(a.digest || '').replace(/^sha256:/, '') || null
        };
      })
    };
  }

  /* API 的资产没有 sha256，用同源快照补上（版本对得上才补） */
  function mergeHashes(release, snapshot) {
    if (!snapshot || !snapshot.assets || snapshot.tag !== release.tag) return release;
    var byName = {};
    snapshot.assets.forEach(function (a) { byName[a.name] = a.sha256; });
    release.assets.forEach(function (a) { if (byName[a.name]) a.sha256 = byName[a.name]; });
    return release;
  }

  function loadSnapshot() {
    return fetch(FALLBACK, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function initDownload() {
    /* 快照和镜像清单并行取。清单只在镜像站上才会真的发请求，
       GitHub Pages 上直接 resolve(null)，不产生一次必然 404 的请求。 */
    Promise.all([loadSnapshot(), loadMirror()]).then(function (res) {
      var snapshot = res[0];
      mirror = res[1];

      // 先拿快照把页面填上，避免网络慢时下载区一直空着
      if (snapshot && snapshot.tag) applyRelease(snapshot, { stale: false });

      return fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (json) {
          var rel = mergeHashes(normalizeApi(json), snapshot);
          applyRelease(rel, { stale: false });
          return rel;
        })
        .catch(function () {
          // API 不通：已经有快照就够了；没有快照就把状态说清楚
          if (snapshot && snapshot.tag) {
            applyRelease(snapshot, { stale: true });
          } else {
            var status = $('[data-rel-status]');
            if (status) {
              status.textContent = '暂时读不到版本信息，';
              status.className = 'rel-status warn';
              status.appendChild(el('a', null, '请直接到 GitHub Releases 下载'));
              status.lastChild.href = RELEASES_PAGE;
              status.lastChild.target = '_blank';
              status.lastChild.rel = 'noopener';
            }
          }
          return null;
        });
    });
  }

  /* ===================== 界面小交互 ===================== */
  function initTopbar() {
    var bar = $('.topbar');
    if (!bar) return;
    var hero = $('.hero');
    if (!hero) return;

    /* 首屏时顶栏透明，压在深色 hero 上；滚过 hero 才切换成深色磨砂条。
       判据：hero 的下沿还在顶栏下面 → 透明；否则 → 实心。

       驱动方式踩过两次坑，最后选了「定时量 + scroll 立即量」：
       - scroll 事件在真实浏览器里够用，但隐藏窗口/后台标签会被整段节流掉
         （拍官网截图的工具就是这么跑页面的：量出来 hero 已经滚到 -237，
          状态却还停在透明）。
       - IntersectionObserver 不依赖事件，但观察区只能按百分比收缩，
         而顶栏本身占着页面最上面 62px，hero 是从 62px 才开始的，
         把观察区钉在 y=0 一带的话 hero 永远不与之相交，判断恒为「已滚过」。
         想精确就得按 px 算 rootMargin，还得跟着窗口尺寸重建观察器，不值当。
       定时量一次 getBoundingClientRect 的开销可以忽略（200ms 一次、只读一个值），
       换来的是任何环境都算得对；真实浏览器里 scroll 事件负责即时响应。 */
    var barH = function () { return bar.offsetHeight || 62; };
    var measure = function () {
      bar.classList.toggle('solid', hero.getBoundingClientRect().bottom <= barH() + 2);
    };

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    setInterval(measure, 200);
  }

  /* ===================== 图片灯箱 =====================
     官网配图缩到 500 多像素宽就再也看不清界面里的字了。
     点一下放大到原尺寸，这是唯一能让人真看到细节的办法。 */
  function initLightbox() {
    var targets = $$('.shot img, .hero-shot-frame img');

    function close() {
      var lb = $('.lightbox');
      if (!lb) return;
      lb.remove();
      document.body.classList.remove('lb-open');
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function open(img) {
      if ($('.lightbox')) return;
      var lb = el('div', 'lightbox');
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', '放大查看界面截图');

      var big = document.createElement('img');
      /* 优先拿 2 倍图，放大后才真的清楚 */
      var srcset = img.getAttribute('srcset') || '';
      var m = srcset.match(/(\S+)\s+2882w|(\S+)\s+782w/);
      big.src = m ? (m[1] || m[2]) : img.currentSrc || img.src;
      big.alt = img.alt || '界面截图';
      lb.appendChild(big);

      var btn = el('button', 'lightbox-close', '×');
      btn.type = 'button';
      btn.setAttribute('aria-label', '关闭');
      btn.addEventListener('click', close);
      lb.appendChild(btn);

      var cap = el('div', 'lightbox-cap', '按 Esc 或点击空白处关闭');
      lb.appendChild(cap);

      lb.addEventListener('click', function (e) {
        if (e.target === lb || e.target === cap) close();
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(lb);
      document.body.classList.add('lb-open');
      btn.focus();
    }

    targets.forEach(function (img) {
      img.addEventListener('click', function () { open(img); });
    });
  }

  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    items.forEach(function (n) { io.observe(n); });
  }

  function initShots() {
    var tabs = $$('.shots-tabs button');
    if (!tabs.length) return;
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (b) {
          var on = b === btn;
          b.setAttribute('aria-selected', on ? 'true' : 'false');
          var panel = document.getElementById(b.getAttribute('aria-controls'));
          if (panel) panel.hidden = !on;
        });
      });
    });
  }

  /* ===================== 数学排版 =====================
     只用 vendor/katex/katex.min.js 的 renderToString，不引 auto-render 插件
     （仓库里本来就没有这个文件）。自己扫一遍文本节点，够用且不多一个依赖。
     只处理「整段都是纯文本 + $公式$」的元素，带 <code>/<strong> 的段落不动，
     否则会把原有标记一起抹掉。 */
  var MATH_TARGETS = '.tex, .compare-eq, .fx';

  function renderTex(tex, display) {
    return window.katex.renderToString(tex, {
      displayMode: !!display, throwOnError: false, strict: false
    });
  }

  /* 把含 $...$ / $$...$$ 的文本切成 [纯文本 | 公式] 序列 */
  function splitMath(text) {
    var out = [];
    var re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ t: text.slice(last, m.index) });
      out.push({ tex: m[1] != null ? m[1] : m[2], display: m[1] != null });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: text.slice(last) });
    return out;
  }

  /* KaTeX 没加载上时的降级：至少别把裸 LaTeX 源码摆给用户看 */
  function plainize(tex) {
    return String(tex)
      .replace(/\\(?:d|t)?frac/g, ' ')
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/\\pm/g, '±')
      .replace(/\\times/g, '×')
      .replace(/\\cdot/g, '·')
      .replace(/\\(?:left|right)\b/g, '')
      .replace(/\\Longleftrightarrow/g, '⇔')
      .replace(/\\Rightarrow/g, '⇒')
      .replace(/\\infty/g, '∞')
      .replace(/\\min/g, 'min')
      .replace(/\\max/g, 'max')
      .replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/[{}$]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function initMath() {
    var hasKatex = typeof window.katex === 'object' &&
      window.katex !== null &&
      typeof window.katex.renderToString === 'function';

    if (!hasKatex) {
      $$('.tex').forEach(function (n) {
        n.textContent = plainize(n.textContent);
        n.classList.add('tex-plain');
      });
      return;
    }

    $$(MATH_TARGETS).forEach(function (node) {
      if (node.getAttribute('data-tex-done')) return;
      var text = node.textContent;
      if (text.indexOf('$') < 0) return;
      var parts = splitMath(text);
      if (parts.length === 1 && parts[0].t != null) return; /* 没有公式 */

      node.setAttribute('data-tex-done', '1');
      var frag = document.createDocumentFragment();
      parts.forEach(function (p) {
        if (p.t != null) {
          frag.appendChild(document.createTextNode(p.t));
        } else {
          var span = document.createElement('span');
          span.innerHTML = renderTex(p.tex, p.display);
          frag.appendChild(span);
        }
      });
      node.textContent = '';
      node.appendChild(frag);
    });
  }

  /* 顶部年份 */
  function initYear() {
    var y = $('[data-year]');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  function boot() {
    initTopbar();
    initReveal();
    initShots();
    initMath();
    initLightbox();
    initYear();
    initDownload();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
