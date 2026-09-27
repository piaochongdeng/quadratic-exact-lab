/*
 * 把 docs/USAGE.md 打包成 help.js。
 * 使用说明只维护一份源文件（docs/USAGE.md），App 里的「使用说明」弹窗读的是生成出来的 help.js，
 * tests/help.test.js 会检查两者一致，因此不会出现「文档改了、App 里还是旧的」。
 *
 *   node scripts/make-help.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'USAGE.md');
const OUT = path.join(ROOT, 'help.js');

const md = fs.readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n');

const banner = [
  '/*!',
  ' * quadratic-exact-lab · help.js  (v1.0.0)',
  ' * ------------------------------------------------------------------',
  ' * 使用说明正文。由 scripts/make-help.js 从 docs/USAGE.md 生成，请勿手改本文件。',
  ' * 改文档请编辑 docs/USAGE.md，然后跑：node scripts/make-help.js',
  ' * ------------------------------------------------------------------',
  ' */',
  ''
].join('\n');

const body = [
  '(function (global) {',
  "  'use strict';",
  '  var api = {',
  '    title: ' + JSON.stringify('使用说明 · 二次函数精确解析器') + ',',
  '    markdown: ' + JSON.stringify(md) + ',',
  '    version: ' + JSON.stringify('1.4.1'),
  '  };',
  "  if (typeof module === 'object' && module.exports) module.exports = api;",
  '  if (global) global.QuadHelp = api;',
  "})(typeof globalThis !== 'undefined' ? globalThis : this);",
  ''
].join('\n');

fs.writeFileSync(OUT, banner + body, 'utf8');
console.log('已生成 ' + path.relative(ROOT, OUT) + '（' + md.length + ' 字符，来自 ' + path.relative(ROOT, SRC) + '）');
