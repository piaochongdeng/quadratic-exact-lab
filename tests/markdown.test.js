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
// 换行符不能落进公式的 HTML 里（回归：KaTeX 输出的 SVG 自带换行，
// 先还原公式再替换换行符，会把 <br> 塞进 <path d="...">，SVG 直接报错）
{
  const NL = String.fromCharCode(10);
  const cases = [
    '第一行带公式 $' + '\\' + 'sqrt{2}$，' + NL + '第二行还有 $' + '\\' + 'frac{1}{2}$。',
    '长根号 $' + '\\' + 'sqrt{x^{2}-4x+13}$ 单独占一段。' + NL + '下一行继续。',
    '段落第一行有 $' + '\\' + 'frac{-b ' + '\\' + 'pm ' + '\\' + 'sqrt{b^{2}-4ac}}{2a}$，' + NL + '第二行是 $' + '\\' + 'dfrac{1}{3}$，第三行收尾。'
  ];
  let bad = 0;
  cases.forEach(function (src) {
    const out = r.render(src);
    // <path ... d="..."> 里出现 <br> 就是坏的
    const broken = /<path[^>]*d="[^"]*<br>/.test(out);
    // 段落里该有的换行还得有
    const lines = (src.match(new RegExp(NL, 'g')) || []).length;
    const brs = (out.match(/<br>/g) || []).length;
    if (broken || brs < lines) {
      bad++;
      console.log('  FAIL 公式段落换行（<br> 未落到 <path> 里）: ' + JSON.stringify(src));
    }
  });
  if (!bad) console.log('  ok  公式段落换行（<br> 未落到 <path> 里）');
  fail += bad;
}
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
