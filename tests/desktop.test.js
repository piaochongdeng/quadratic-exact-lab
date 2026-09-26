/* 桌面版自测（Electron）：node tests/desktop.test.js
 *
 * 需要先安装依赖（npm install）。若本机没有 Electron，本测试会自动跳过，
 * 不影响纯网页版的五个测试套件。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

if (!fs.existsSync(ELECTRON)) {
  console.log('  skip 未安装 Electron（先执行 npm install）');
  process.exit(0);
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (err) { fail++; console.log('  FAIL ' + name + '\n       ' + (err && err.message)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function runElectron(script, outFile) {
  const res = spawnSync(ELECTRON, [path.join('desktop', script)], {
    cwd: ROOT, encoding: 'utf8', timeout: 180000,
    env: Object.assign({}, process.env, { ELECTRON_DISABLE_SECURITY_WARNINGS: '1' })
  });
  const out = (res.stdout || '') + (res.stderr || '');
  if (res.error) throw new Error('启动 Electron 失败：' + res.error.message);
  if (res.status !== 0) throw new Error('Electron 退出码 ' + res.status + '\n' + out.slice(-1200));
  assert(fs.existsSync(outFile), '未生成结果文件 ' + outFile + '\n' + out.slice(-600));
  const json = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  fs.unlinkSync(outFile);
  return json;
}

console.log('▶ 桌面版自测  (desktop/smoke.js + smoke-export.js + smoke-domain.js)');

const r1 = runElectron('smoke.js', path.join('desktop', 'smoke-result.json'));
t('桌面桥与对外 API 就绪', () => {
  assert(r1.hasDesktopBridge, 'preload 未注入 QuadDesktop');
  assert(r1.hasApi, '未暴露 QuadLab');
  assert(r1.isReady, '默认输入下报告不可用');
  assert(r1.isDesktopClass, '未加上 is-desktop 标记');
});
t('渲染无错误且不错版', () => {
  assert(r1.katexErrors === 0, 'KaTeX 报错 ' + r1.katexErrors + ' 处');
  assert(r1.docOverflow === 0, '页面横向溢出 ' + r1.docOverflow + 'px');
  assert((r1.consoleErrors || []).length === 0, '控制台报错：' + JSON.stringify(r1.consoleErrors));
});
t('四种形式切换与三点求解', () => {
  assert(r1.switchPoints, '切换到三点失败');
  assert(r1.pointsReady, '三点输入下报告不可用');
  assert(r1.pointsMdHasCramer, '三点报告缺少克莱姆法则');
});
t('输入还原 / 示例步进 / 主题切换', () => {
  assert(r1.setStateOk, 'setState 失败');
  assert(r1.surdInReport, '无理零点未以根式呈现');
  assert(r1.exampleNext && r1.examplePrev, '示例步进失败');
  assert(r1.themeAfterToggle === 'dark' && r1.themeBack === 'light', '主题切换异常');
});
t('图像可导出为 PNG', () => { assert(r1.canvasUrl && r1.canvasUrlLen > 1000, '画布导出为空'); });

const r2 = runElectron('smoke-export.js', path.join('desktop', 'smoke-export-result.json'));
t('导出 Markdown / PNG / JSON 落盘成功', () => {
  assert(r2.markdownSave && r2.markdownSave.ok, 'Markdown 导出失败');
  assert(r2.pngSave && r2.pngSave.ok, 'PNG 导出失败');
  assert(r2.jsonSave && r2.jsonSave.ok, 'JSON 导出失败');
  const names = (r2.files || []).map((f) => f.name);
  ['report.md', 'plot.png', 'input.json', 'report.pdf'].forEach((n) => assert(names.indexOf(n) >= 0, '缺少导出文件 ' + n));
});
t('导出 PDF 且分页正常', () => {
  assert(r2.pdf && r2.pdf.ok, 'PDF 导出失败');
  assert(r2.pdf.bytes > 20000, 'PDF 体积异常：' + r2.pdf.bytes);
  assert(r2.printCss && r2.printCss.hasPrintMedia, '缺少打印媒体查询');
});
t('原生菜单事件驱动界面', () => {
  assert(r2.menu.before === 'general', '初始形式应为 general');
  assert(r2.menu.afterPoints === 'points', '菜单未切换到三点');
  assert(r2.menu.theme === 'dark', '菜单未切换主题');
  assert(r2.menu.exampleOk, '菜单步进示例后报告不可用');
});
t('桌面版仍支持全角与小数输入', () => {
  assert(r2.tolerantInput.ok, '全角输入后报告不可用');
  assert(r2.tolerantInput.hasFraction, '0.5 未精确换算为 1/2');
});

const r3 = runElectron('smoke-domain.js', path.join('desktop', 'smoke-domain-result.json'));
t('定义域输入框可输入（回归：曾被 ±∞ 自动勾选后禁用）', () => {
  assert(r3.leftDisabledAfterSwitch === false, '切到自定义区间后左输入框仍被禁用');
  assert(r3.leftUnboundedAfterSwitch === false, '左侧被错误地当成 −∞');
  assert(r3.typeLeft.focused === true, '左输入框拿不到焦点（说明仍是 disabled）');
  assert(r3.typeLeft.inserted === true, '左输入框无法插入文本');
  assert(r3.stateLeftValue === '-3/2', '左端点未写入状态：' + r3.stateLeftValue);
});
t('左右端点都能输入并进入报告', () => {
  assert(r3.rightEnabledAfterUncheck === true, '取消 +∞ 后右输入框仍不可用');
  assert(r3.typeRight.focused === true && r3.typeRight.inserted === true, '右输入框无法输入');
  assert(r3.stateRightValue === '7/2', '右端点未写入状态：' + r3.stateRightValue);
  assert(r3.readyAfterRight === true, '输入两个端点后报告不可用');
  assert(r3.mdLeftIsFraction && r3.mdRightIsFraction, '端点未以分数形式出现在报告中');
});
t('±∞ 勾选与取消勾选行为正确', () => {
  assert(r3.rightDisabledWhenInf === true, '勾选 +∞ 后右输入框未禁用');
  assert(r3.rightValueCleared === true, '勾选 +∞ 后端点值未清空');
  assert(r3.leftReEnabled === true, '取消 −∞ 后左输入框未恢复可用');
  assert(r3.readyAfterRecover === true, '重新输入后报告未恢复可用');
});
t('方括号开闭切换与双侧无界报错', () => {
  assert(r3.bracketToggled && r3.bracketRestored, '方括号按钮切换异常');
  assert(r3.bothInfReady === false, '两侧都无界时不应给出报告');
  assert(/有限端点/.test(r3.bothInfError), '双侧无界未给出明确提示：' + r3.bothInfError);
});
t('存档还原与旧分享链接兼容', () => {
  assert(r3.roundTripOk === true, '存档后还原失败');
  assert(r3.roundTripRightUnbounded === true, '还原后 +∞ 标记丢失');
  assert(r3.legacyStateOk === true, '旧格式（空值=无界）无法还原');
  assert(r3.legacyRightUnbounded === true && r3.legacyRightDisabled === true, '旧格式的 +∞ 侧未正确禁用');
  assert(r3.legacyReady === true, '旧格式还原后报告不可用');
});

/* 清理测试产物目录 */
try { fs.rmSync(path.join(ROOT, 'desktop', 'smoke-out'), { recursive: true, force: true }); } catch (e) {}

console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) process.exit(1);
