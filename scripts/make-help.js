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

/* 版本号从 package.json 读，不写死。
   写死过一次，结果横幅停在 (v1.0.0)、api.version 停在 1.4.1，
   发新版时没人记得回来改这里 —— 页脚写着旧版本号，看起来像没更新。 */
const VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
).version;

const md = fs.readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n');

const banner = [
  '/*!',
  ' * quadratic-exact-lab · help.js  (v' + VERSION + ')',
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
  '    version: ' + JSON.stringify(VERSION),
  '  };',
  "  if (typeof module === 'object' && module.exports) module.exports = api;",
  '  if (global) global.QuadHelp = api;',
  "})(typeof globalThis !== 'undefined' ? globalThis : this);",
  ''
].join('\n');

fs.writeFileSync(OUT, banner + body, 'utf8');
console.log('已生成 ' + path.relative(ROOT, OUT) + '（' + md.length + ' 字符，来自 ' + path.relative(ROOT, SRC) + '）');
