const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

/* 两个界面脚本都要检查：ui.js（二次函数）与 trig-ui.js（三角函数） */
const SCRIPTS = ['ui.js', 'trig-ui.js'];
const htmlIds = new Set((html.match(/id="([^"]+)"/g) || []).map(m => m.slice(4, -1)));
console.log('index.html 中的 id 数量: ' + htmlIds.size);

let bad = 0;

SCRIPTS.forEach(name => {
  const js = fs.readFileSync(name, 'utf8');
  const used = new Set((js.match(/\$\('([^']+)'\)/g) || []).map(m => m.slice(3, -2)));
  const missing = [...used].filter(id => !htmlIds.has(id));
  console.log('[' + name + '] 引用的 id 数量: ' + used.size);
  console.log(missing.length ? ('!! ' + name + ' 缺少 id: ' + missing.join(', ')) : 'ok  ' + name + ' 引用的 id 都存在');
  if (missing.length) bad++;

  /* ui.js 里用到的 el.xxx 必须在同一文件里被赋值 */
  const elRefs = new Set((js.match(/(?<![A-Za-z_$])el\.([A-Za-z]+)/g) || []).map(m => m.slice(3)));
  const assigned = new Set((js.match(/(?<![A-Za-z_$])el\.([A-Za-z]+)\s*=/g) || []).map(m => m.replace(/^el\./, '').replace(/\s*=$/, '').trim()));
  const notAssigned = [...elRefs].filter(x => !assigned.has(x));
  console.log(notAssigned.length ? ('!! ' + name + ' 的 el.* 未赋值: ' + notAssigned.join(', ')) : 'ok  ' + name + ' 的 el.* 全部已赋值');
  if (notAssigned.length) bad++;
});

/* 检查 HTML 里引用的脚本与样式是否存在 */
/* 只匹配真正的 src / href 属性，避免把 data-src="..." 当成资源路径 */
/* 只匹配真正的资源路径：跳过 http(s) 外链与页内锚点（href="#" 不是文件） */
const assets = [...html.matchAll(/(?:^|\s)(?:src|href)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(p => !/^(https?:|#|mailto:)/.test(p));
assets.forEach(p => {
  const ok = fs.existsSync(p);
  if (!ok) bad++;
  console.log((ok ? 'ok  ' : '!! 缺失 ') + p);
});

/* 三角函数工作区要求脚本按顺序加载：trig.js 在 trig-report.js 之前，两者都在 trig-ui.js 之前 */
const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
['trig.js', 'trig-report.js', 'trig-ui.js'].forEach((f, i, arr) => {
  const idx = order.indexOf(f);
  const ok = idx >= 0 && (i === 0 || order.indexOf(arr[i - 1]) < idx);
  if (!ok) bad++;
  console.log((ok ? 'ok  ' : '!! 顺序错误 ') + '脚本加载顺序 ' + f);
});

process.exit(bad ? 1 : 0);