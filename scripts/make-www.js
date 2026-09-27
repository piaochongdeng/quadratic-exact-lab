/*!
 * quadratic-exact-lab · scripts/make-www.js
 * ------------------------------------------------------------------
 * 把「网页运行时需要的文件」挑出来放进 www/，供 Android 工程打包进 assets。
 *
 *   node scripts/make-www.js
 *
 * 只拷贝运行时文件：desktop/（Electron 专用）、tests/、node_modules/ 一律不要，
 * 否则 APK 会被 Electron 依赖撑到上百 MB。
 * ------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');

/** 与 package.json 的 build.files 里「网页部分」保持一致，去掉 desktop/* 与 package.json */
const FILES = [
  'index.html',
  'styles.css',
  'engine.js',
  'report.js',
  'markdown.js',
  'help.js',
  'ui.js',
  'trig.js',
  'trig-report.js',
  'trig-ui.js'
];

const DIRS = [
  'vendor'   /* 离线 KaTeX（MIT），必须随包携带，否则公式排版全废 */
];

function copyFile(rel) {
  const src = path.join(ROOT, rel);
  const dst = path.join(OUT, rel);
  if (!fs.existsSync(src)) throw new Error('缺少文件：' + rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return fs.statSync(dst).size;
}

function copyDir(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) throw new Error('缺少目录：' + rel);
  fs.cpSync(src, path.join(OUT, rel), { recursive: true });
}

/* ---------- 开始 ---------- */

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let total = 0;
FILES.forEach(function (f) { total += copyFile(f); });
DIRS.forEach(function (d) { copyDir(d); });

/* 递归统计目录大小，做个体积体检 */
function dirSize(p) {
  let n = 0;
  fs.readdirSync(p, { withFileTypes: true }).forEach(function (e) {
    const full = path.join(p, e.name);
    n += e.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  });
  return n;
}

const size = dirSize(OUT);
const files = (function walk(p, acc) {
  fs.readdirSync(p, { withFileTypes: true }).forEach(function (e) {
    const full = path.join(p, e.name);
    if (e.isDirectory()) walk(full, acc); else acc.push(full);
  });
  return acc;
})(OUT, []);

/* 兜底体检：绝不允许把 Electron / node_modules 混进来 */
const BAD = /(^|[\\/])(node_modules|desktop|tests|dist-desktop|android|scripts)([\\/]|$)/;
const leaked = files.filter(function (f) { return BAD.test(path.relative(OUT, f)); });
if (leaked.length) {
  console.error('!! www/ 里混进了不该有的文件：');
  leaked.forEach(function (f) { console.error('   ' + path.relative(ROOT, f)); });
  process.exit(1);
}

console.log('www/ 生成完毕');
console.log('  文件数：' + files.length);
console.log('  体积：' + (size / 1024 / 1024).toFixed(2) + ' MB');
files
  .map(function (f) { return { rel: path.relative(OUT, f).split(path.sep).join('/'), size: fs.statSync(f).size }; })
  .sort(function (a, b) { return b.size - a.size; })
  .slice(0, 10)
  .forEach(function (f) { console.log('    ' + (f.size / 1024).toFixed(1).padStart(8) + ' KB  ' + f.rel); });
