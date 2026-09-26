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

console.log('▶ 桌面版自测  (desktop/smoke.js + smoke-export.js + smoke-domain.js + smoke-trig.js)');

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

const r4 = runElectron('smoke-trig.js', path.join('desktop', 'smoke-trig-result.json'));
t('工作区切换（二次函数 ↔ 三角函数）', () => {
  assert(r4.quadVisible === true, '初始应停在二次函数工作区');
  assert(r4.trigHidden === true, '初始不应显示三角函数工作区');
  assert(r4.quadCanvasWidth > 100, '二次函数画布宽度异常：' + r4.quadCanvasWidth);
  assert(r4.switchOk && r4.modeAfterSwitch === 'trig', '未能切到三角函数工作区');
  assert(r4.trigVisible === true && r4.quadHidden === true, '切换后可见性不对');
  assert(r4.modeBarSelected === 'true', '切换条未同步选中态');
});
t('三角函数：30° 默认输入给出精确值', () => {
  assert(r4.ready === true && r4.readyAfter === true, '默认输入下报告不可用');
  assert(r4.defExact === true, '30° 应为精确值');
  assert(r4.defSin === '1/2' && r4.defCos === '√3/2' && r4.defTan === '√3/3', '特殊角精确值错误：' + JSON.stringify([r4.defSin, r4.defCos, r4.defTan]));
  assert(r4.defO === '3' && r4.defA === '3√3' && r4.defH === '6', '三边错误：' + JSON.stringify([r4.defO, r4.defA, r4.defH]));
  assert(r4.defArea === '9√3/2' && r4.defPerim === '9 + 3√3', '面积 / 周长错误');
  assert(r4.mdHasSqrt3Over3 === true, '报告缺少 √3/3');
  assert(r4.mdHasSimplest === true, '报告里出现了未化简的 √12');
});
t('三角函数：两张画布都有内容且尺寸正常', () => {
  assert(r4.triCanvas.w > 200 && r4.triCanvas.h > 150, '三角形画布尺寸异常：' + JSON.stringify(r4.triCanvas));
  assert(r4.unitCanvas.w > 200 && r4.unitCanvas.h > 150, '单位圆画布尺寸异常：' + JSON.stringify(r4.unitCanvas));
  assert(r4.triNonBlank === true, '三角形画布是空白的');
  assert(r4.unitNonBlank === true, '单位圆画布是空白的');
});
t('三角函数：非特殊角按精度给近似值', () => {
  assert(r4.angleTyped && r4.angleTyped.focused === true, '角度输入框拿不到焦点');
  assert(r4.sideTyped && r4.sideTyped.focused === true, '边长输入框拿不到焦点');
  assert(r4.ready37 === true, '37° 下报告不可用');
  assert(r4.d37Exact === false, '37° 不该声称精确');
  assert(r4.md37HasApprox === true, '缺少近似值说明');
  assert(r4.md37HasNoExactClaim === true, '不该声称全部精确');
  assert(Math.abs(r4.d37H - 5) < 1e-9 && r4.d37O > 3 && r4.d37O < 3.1, '37° 的三边数值异常');
});
t('三角函数：用户输入函数值反推（精确 + 近似）', () => {
  assert(r4.valueRowVisible === true, '切到「我输入函数值」后输入框未显示');
  assert(r4.valueTyped && r4.valueTyped.focused === true, '函数值输入框拿不到焦点');
  assert(r4.ready06 === true && r4.d6Exact === true, 'sinθ=0.6 应为精确值');
  assert(r4.d6Cos === '4/5' && r4.d6Tan === '3/4', '反推结果错误：' + JSON.stringify([r4.d6Cos, r4.d6Tan]));
  assert(r4.d6O === '6' && r4.d6A === '8' && r4.d6H === '10', '3-4-5 三角形错误');
  assert(r4.md06HasFraction === true, '报告缺少 4/5');
  assert(r4.d7Exact === false && r4.d7Source === 'user-numeric', '无理数应走近似');
});
t('三角函数：小数精度可自定义', () => {
  assert(r4.digits2 === 2 && r4.digits10 === 10 && r4.digitsBack === 4, '精度设置未生效：' + JSON.stringify([r4.digits2, r4.digits10, r4.digitsBack]));
  assert(r4.mdDigits2 === true, '报告未反映精度设置');
});
t('三角函数：数值再大也等比缩放（画布尺寸不变）', () => {
  assert(r4.scaleRatioConsistent === true, '缩放后三边比例失真');
  assert(r4.canvasSizeStable === true, '画布尺寸被数值撑大了');
  assert(r4.bigValuesFinite === true, '超大数值出现非有限值');
  assert(r4.tinyFinite === true, '极小数值出现非有限值');
  assert(r4.noOverflowAfterBig === 0, '页面出现横向溢出：' + r4.noOverflowAfterBig);
});
t('三角函数：特殊角 / 非特殊角判定表', () => {
  const st = r4.specialTable;
  assert(st['30'].exact && st['30'].sin === '1/2', '30° 判定错误');
  assert(st['45'].exact && st['45'].tan === '1', '45° 判定错误');
  assert(st['60'].exact && st['60'].tan === '√3', '60° 判定错误');
  assert(st['90'].exact && st['90'].tan === 'NONE', '90° 的 tan 应不存在');
  assert(st['120'].exact && st['120'].cos === '-1/2', '120° 判定错误');
  assert(st['390'].exact && st['390'].sin === '1/2', '390° 应等价于 30°');
});
t('三角函数：非法输入给出明确提示并可恢复', () => {
  assert(r4.sin2Ready === false, 'sin = 2 不该给出结果');
  assert(/不能大于 1/.test(r4.sin2Error), '提示不明确：' + r4.sin2Error);
  assert(r4.recoverReady === true, '改回合法值后未恢复');
  assert(r4.emptyAngleReady === false, '清空角度后不该给出结果');
  assert(/请填写角度/.test(r4.emptyAngleError), '空角度提示不明确：' + r4.emptyAngleError);
  assert(r4.canvasStillSized === true, '无结果时画布尺寸被破坏');
});
t('三角函数：hash 前缀与工作区互不干扰', () => {
  assert(r4.stepOk === true, '示例步进失败');
  assert(r4.hashIsTrig === true, '三角函数工作区的 hash 缺少 trig: 前缀');
  assert(r4.hashRoundTrip === true, '存档还原失败');
  assert(r4.hashAfterBackToQuad === 'ok', '切回二次函数后 hash 仍被三角函数占用');
  assert(r4.quadReadyAfterBack === true && r4.quadCanvasOk === true, '切回二次函数后不可用');
  assert(r4.trigReadyAfterReturn === true, '切回三角函数后不可用');
});
t('三角函数：报告结构完整、无排版错误、可导出', () => {
  assert(r4.mdSections === 8, '报告章节不全，只有 ' + r4.mdSections + ' 节');
  assert(r4.mdDollarEven === true, '美元符号不成对');
  assert(r4.katexErrors === 0, 'KaTeX 报错 ' + r4.katexErrors + ' 处');
  assert(r4.mdPlaceholderLeft === false, '报告里有未替换的占位符');
  assert(r4.docOverflow === 0, '页面横向溢出 ' + r4.docOverflow + 'px');
  assert(r4.canvasExport === true, '两张画布无法合成为 PNG');
  assert((r4.consoleErrors || []).length === 0, '控制台报错：' + JSON.stringify(r4.consoleErrors));
});

/* ---------------- 移动端 / 吸顶回归 ---------------- */

const r5 = runElectron('smoke-mobile.js', path.join('desktop', 'smoke-mobile-result.json'));
const PHONES = ['phone-portrait', 'phone-small'];

t('吸顶回归：滚动后切换条不被页头盖住（多尺寸）', () => {
  Object.keys(r5.sizes).forEach((k) => {
    const s = r5.sizes[k];
    assert(s.scrollY > 0, k + '：没有真的滚动，测试无效');
    assert(s.overlap === 0, k + '：页头与切换条重叠 ' + s.overlap + 'px');
    assert(s.barRect && s.barRect.height > 0, k + '：切换条高度为 0');
    assert(s.barWithinViewport === true, k + '：切换条不在视口内（top=' + (s.barRect && s.barRect.top) + '）');
    assert(s.barHitInsideBar === true, k + '：切换条中心点被 ' + s.barHitTag + ' 挡住，点不到');
    assert(s.trigBtnReachable === true, k + '：滚动后「三角函数」按钮点不到');
    assert(s.modeAfterClick === 'trig', k + '：滚动后点击切换条没有切换工作区');
  });
});

t('手机竖屏：触控目标 ≥ 44px、输入框 ≥ 16px', () => {
  PHONES.forEach((k) => {
    const s = r5.sizes[k];
    assert(s.smallestTargetH >= 44, k + '：最小的触控目标只有 ' + s.smallestTargetH + 'px');
    assert(s.smallTargets.length === 0, k + '：以下控件不足 44px → ' + s.smallTargets.join(', '));
    assert(s.inputFontSize >= 16, k + '：输入框字号 ' + s.inputFontSize + 'px，聚焦会被自动放大');
    assert(s.selectFontSize >= 16, k + '：下拉框字号 ' + s.selectFontSize + 'px');
    assert(s.inputHeight >= 44, k + '：输入框高度只有 ' + s.inputHeight + 'px');
  });
});

t('手机竖屏：页头瘦身且切换条不用横向滚动', () => {
  PHONES.forEach((k) => {
    const s = r5.sizes[k];
    /* 修复前手机页头 209px（副标题 + 5 个按钮换行），现在压到两行 */
    assert(s.headerHeight <= 130, k + '：页头仍然过高 ' + s.headerHeight + 'px');
    assert(s.modeBarLabel === 'short', k + '：窄屏没有改用短标签');
    assert(s.modeBarScroll === 0, k + '：切换条还要横向滚动 ' + s.modeBarScroll + 'px');
  });
});

t('多宽度无横向溢出（含 320px 超窄屏）', () => {
  Object.keys(r5.sizes).forEach((k) => {
    const s = r5.sizes[k];
    assert(s.overflow === 0, k + '（' + s.innerWidth + 'px）：页面横向溢出 ' + s.overflow + 'px');
    assert(s.trigOverflow === 0, k + '（' + s.innerWidth + 'px）：三角函数工作区横向溢出 ' + s.trigOverflow + 'px');
  });
});

t('两个工作区在手机尺寸下都能正常渲染', () => {
  PHONES.forEach((k) => {
    const s = r5.sizes[k];
    assert(s.quadCanvasNonBlank === true, k + '：二次函数画布空白');
    assert(s.triNonBlank === true && s.unitNonBlank === true, k + '：三角函数画布空白');
    assert(s.triCanvas.w > 200 && s.triCanvas.h > 150, k + '：三角形画布尺寸异常 ' + JSON.stringify(s.triCanvas));
    assert(s.unitCanvas.w > 200 && s.unitCanvas.h > 150, k + '：单位圆画布尺寸异常 ' + JSON.stringify(s.unitCanvas));
  });
});

t('二次函数画布支持双指捏合缩放', () => {
  PHONES.forEach((k) => {
    const s = r5.sizes[k];
    assert(s.pinchZoomedIn === true, k + '：两指张开没有放大（' + s.pinchOutSpanBefore + ' → ' + s.pinchOutSpanAfter + '）');
    assert(s.pinchZoomedOut === true, k + '：两指靠拢没有缩小（' + s.pinchSpanBefore + ' → ' + s.pinchSpanAfter + '）');
    assert(s.singleTouchKeepsView === true, k + '：单指触摸被误当成捏合，视野被改掉了');
  });
  assert((r5.consoleErrors || []).length === 0, '控制台报错：' + JSON.stringify(r5.consoleErrors));
});

/* 清理测试产物目录 */
try { fs.rmSync(path.join(ROOT, 'desktop', 'smoke-out'), { recursive: true, force: true }); } catch (e) {}
try { fs.rmSync(path.join(ROOT, 'desktop', 'smoke-mobile-result.json'), { force: true }); } catch (e) {}

console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) process.exit(1);
