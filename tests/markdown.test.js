const Md = require('../markdown.js');
const Report = require('../report.js');
const katex = require('../vendor/katex/katex.min.js');
const r = Md.createRenderer(katex);
const rep = Report.build({ form: 'factored', a: '1/3', r1: '-1', r2: '5' });
const html = r.render(rep.markdown);
const check = [
  ['<h1', '一级标题'], ['<h2', '二级标题'], ['<table class="md-table"', '表格'],
  ['<div class="md-table-wrap"', '表格容器'], ['<ul>', '无序列表'], ['<ol>', '有序列表'],
  ['<blockquote', '引用'], ['<hr class="md-hr"', '分隔线'], ['katex', 'KaTeX 输出']
];
let fail = 0;
check.forEach(function (c) {
  const ok = html.indexOf(c[0]) >= 0;
  if (!ok) fail++;
  console.log((ok ? '  ok  ' : '  FAIL ') + c[1]);
});
// 不允许出现未渲染的 $ 或占位符
const strayDollar = /\$/.test(html.replace(/\$\$/g, ''));
console.log((strayDollar ? '  FAIL ' : '  ok  ') + '没有残留的 $ 符号');
if (strayDollar) fail++;
const strayPH = html.indexOf('\u0001') >= 0;
console.log((strayPH ? '  FAIL ' : '  ok  ') + '没有残留占位符');
if (strayPH) fail++;
// 表格列数
const tables = html.match(/<thead><tr>[\s\S]*?<\/tr><\/thead>/g) || [];
console.log('  表格数量: ' + tables.length);
// 输出一段片段检查
const i = html.indexOf('<table');
console.log('\n--- 表格片段 ---');
console.log(html.slice(i, i + 420));
console.log('\n--- 列表片段 ---');
const j = html.indexOf('<ul>');
console.log(html.slice(j, j + 300));
console.log('\n失败项: ' + fail);
process.exit(fail ? 1 : 0);
