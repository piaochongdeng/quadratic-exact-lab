/* 一键跑完所有自测：node tests/run-all.js */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['engine.test.js', '精确计算引擎'],
  ['report.test.js', '报告生成 + KaTeX 排版校验'],
  ['edge.test.js', '边界用例'],
  ['markdown.test.js', 'Markdown 渲染器'],
  ['help.test.js', '使用说明（文档同源 / 渲染 / 功能对齐）'],
  ['trig.test.js', '三角函数与直角三角形（精确值 / 反推 / 报告排版）'],
  ['dom-check.js', '页面与脚本 id 一致性'],
  ['site.test.js', '官网（发布目录完整性 / 下载链接 / 引用可达）'],
  ['desktop.test.js', '桌面版（Electron）端到端'],
  ['android.test.js', 'Android（真机 / 模拟器）端到端']
];

let failed = [];
console.log('\n========== quadratic-exact-lab 自测 ==========\n');
SUITES.forEach(function (s) {
  const file = path.join(__dirname, s[0]);
  console.log('▶ ' + s[1] + '  (' + s[0] + ')');
  const res = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  const out = (res.stdout || '') + (res.stderr || '');
  out.split('\n').forEach(function (line) {
    if (/FAIL|通过|失败|ok |!!/.test(line) && line.trim()) console.log('   ' + line.trim());
  });
  if (res.status !== 0) failed.push(s[0]);
  console.log('');
});

console.log('=============================================');
if (failed.length) {
  console.log('有 ' + failed.length + ' 个测试文件未通过：' + failed.join(', '));
  process.exit(1);
}
console.log('全部测试通过 ✓');
console.log('=============================================\n');
