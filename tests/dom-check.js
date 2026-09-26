const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('ui.js', 'utf8');
const htmlIds = new Set((html.match(/id="([^"]+)"/g) || []).map(m => m.slice(4, -1)));
const used = new Set((js.match(/\$\('([^']+)'\)/g) || []).map(m => m.slice(3, -2)));
const missing = [...used].filter(id => !htmlIds.has(id));
console.log('index.html 中的 id 数量: ' + htmlIds.size);
console.log('ui.js 引用的 id 数量: ' + used.size);
console.log(missing.length ? ('!! 缺少: ' + missing.join(', ')) : 'ok  所有引用的 id 都存在');
// 检查 ui.js 里用到的 el.xxx
const elRefs = new Set((js.match(/(?<![A-Za-z_$])el\.([A-Za-z]+)/g) || []).map(m => m.slice(3)));
const assigned = new Set((js.match(/(?<![A-Za-z_$])el\.([A-Za-z]+)\s*=/g) || []).map(m => m.replace(/^el\./, '').replace(/\s*=$/, '').trim()));
const notAssigned = [...elRefs].filter(x => !assigned.has(x));
console.log(notAssigned.length ? ('!! el.* 未赋值: ' + notAssigned.join(', ')) : 'ok  el.* 全部已赋值');
// 检查 HTML 里引用的脚本与样式是否存在
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(p => !/^https?:/.test(p));
assets.forEach(p => {
  console.log((fs.existsSync(p) ? 'ok  ' : '!! 缺失 ') + p);
});
process.exit(missing.length || notAssigned.length ? 1 : 0);
