/* 版本号一致性自检：node tests/version.test.js
 *
 * 为什么需要这个文件：版本号散落在好几个地方（package.json、四个源码文件的
 * version 字段、横幅注释、Android 的 versionName / versionCode、文档），
 * 全靠人记得一起改。实际就漏过 —— 发版时 make-help.js 里的版本写死了，
 * 结果 help.js 的横幅一直停在 (v1.0.0)，App 里「使用说明」显示的版本号
 * 落后了好几个版本，页脚写着旧版本号，看起来像没更新。
 *
 * 这个测试把「所有地方必须一致」变成硬约束：以后只改 package.json
 * 而忘了别处，测试会直接失败并指出是哪个文件。
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const V = pkg.version;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (err) { fail++; console.log('  FAIL ' + name + '\n       ' + (err && err.message)); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n?/g, '\n');

/* 任何 x.y.z 形式的版本号，别的都可能是历史注释（如「v1.4.1 起」），不在此列 */
const SEMVER = /^\d+\.\d+\.\d+$/;

console.log('\n[1] package.json 是版本的唯一来源');

t('package.json 的 version 是合法的 x.y.z', () => {
  assert.ok(SEMVER.test(V), 'package.json 的 version 不是 x.y.z 形式：' + V);
});

/* 每个源码文件里「声明自己是哪一版」的地方。
   注意只认版本字段和文件头横幅，不认代码注释里提到的历史版本 ——
   desktop/smoke-*.js 里就有「v1.4.1 起」这种说明功能何时加入的注释，
   那是历史事实，不该跟着版本号走。 */
const DECLARERS = ['ui.js', 'trig.js', 'trig-report.js', 'trig-ui.js', 'help.js'];

console.log('\n[2] 源码里的版本字段与 package.json 一致');

DECLARERS.forEach((file) => {
  t(file + ' 的 version 字段', () => {
    const src = read(file);
    /* 不锚定行首：trig-report.js 是 return { build: build, version: '1.4.2', ... }
       这种行内写法，锚了行首就找不到，测试会误报「字段被改名了」。 */
    const found = src.match(/version:\s*['"]([^'"]+)['"]/g) || [];
    assert.ok(found.length > 0, file + ' 里找不到 version 字段 —— 是不是被改名了？');
    found.forEach((decl) => {
      const v = decl.match(/['"]([^'"]+)['"]/)[1];
      assert.strictEqual(v, V,
        file + ' 写的是 ' + v + '，package.json 是 ' + V + '（发版时漏改了）');
    });
  });
});

console.log('\n[3] 文件头横幅也要跟着走');

/* 横幅形如 * quadratic-exact-lab · ui.js  (v1.4.2)
   这里是漏改的重灾区：实测 ui.js / engine.js / report.js / markdown.js
   四个文件全都停在 v1.0.0，help.js 停在同一处。
   横幅上写着项目名，读者自然理解成「我装的这版」，写着 1.0.0 会让人
   以为拿到的是旧版本，所以统一按 package.json 走。 */
const BANNERED = ['ui.js', 'engine.js', 'report.js', 'markdown.js',
                  'trig.js', 'trig-report.js', 'trig-ui.js', 'help.js'];

BANNERED.forEach((file) => {
  t(file + ' 的横幅版本', () => {
    const m = read(file).match(/^ \* quadratic-exact-lab · [\w.-]+  \(v(\d+\.\d+\.\d+)\)/m);
    assert.ok(m, file + ' 没有版本横幅（这类文件都应该有，否则无从判断手上是哪一版）');
    assert.strictEqual(m[1], V,
      file + ' 横幅写的是 v' + m[1] + '，package.json 是 v' + V);
  });
});

console.log('\n[4] help.js 的版本必须来自 package.json');

/* 这一条原来的写法是去 grep scripts/make-help.js 的源码文本，
   结果变异测试里把 JSON.stringify(VERSION) 改成 JSON.stringify('1.0.0')
   完全查不出来 —— 检查代码长相而不是行为，就是假测试。
   现在真的跑一遍生成器，看产物版本号对不对。 */
t('重新跑生成器，产物的版本号跟着 package.json', () => {
  const out = path.join(ROOT, 'help.js');
  const before = fs.readFileSync(out, 'utf8');
  try {
    const r = spawnSync(process.execPath,
      [path.join(ROOT, 'scripts', 'make-help.js')], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0,
      'make-help.js 跑失败：' + ((r.stderr || '') + (r.stdout || '')).trim());
    const m = fs.readFileSync(out, 'utf8').match(/version:\s*"([^"]+)"/);
    assert.ok(m, '生成的 help.js 里找不到 version 字段');
    assert.strictEqual(m[1], V,
      '生成器里的版本没跟着 package.json 走：产物是 ' + m[1] + '，应为 ' + V);
  } finally {
    /* 无论通过与否都还原：生成器坏掉时不该顺手把仓库里的 help.js 写脏 */
    fs.writeFileSync(out, before, 'utf8');
  }
});

console.log('\n[5] Android 版本号');

function gradleVersion() {
  const g = read('android/app/build.gradle');
  const name = g.match(/versionName\s+'([^']+)'/);
  const code = g.match(/versionCode\s+(\d+)/);
  assert.ok(name && code, 'android/app/build.gradle 里读不到 versionName / versionCode');
  return { name: name[1], code: Number(code[1]) };
}

t('versionName 与 package.json 一致', () => {
  assert.strictEqual(gradleVersion().name, V,
    'build.gradle 的 versionName 是 ' + gradleVersion().name + '，package.json 是 ' + V);
});

/* versionCode 是整数，用来判断「哪个包更新」。约定 major*10000 + minor*100 + patch，
   所以 1.4.1 → 10401、1.4.2 → 10402。必须严格递增，否则手机不认新包。 */
t('versionCode 按 major*10000 + minor*100 + patch 递增', () => {
  const [ma, mi, pa] = V.split('.').map(Number);
  const want = ma * 10000 + mi * 100 + pa;
  assert.strictEqual(gradleVersion().code, want,
    'versionCode 是 ' + gradleVersion().code + '，按 ' + V + ' 应该是 ' + want +
    '（不能重复或倒退，否则覆盖安装时系统不认为是升级）');
});

console.log('\n[6] 线上试用版是同步过的');

/* docs/app/ 是 make-site.js 从源码拷过去的（会被提交并部署）。
   改了源码没重跑生成，两个站点上的试用版就会和源码不一致。 */
const crypto = require('crypto');
const sha = (p) => crypto.createHash('sha256').update(read(p)).digest('hex').slice(0, 12);

[['ui.js', 'docs/app/ui.js'], ['trig.js', 'docs/app/trig.js'],
 ['help.js', 'docs/app/help.js']].forEach(([src, dst]) => {
  t(dst + ' 与源码同步', () => {
    /* 比哈希而不是直接比字符串：文件是几千字的正文，
       直接 strictEqual 失败时会把整份文档打到终端上，反而看不见问题在哪。 */
    assert.strictEqual(sha(dst), sha(src),
      dst + ' 与 ' + src + ' 内容不同（' + sha(dst) + ' vs ' + sha(src) + '），' +
      '请跑 node scripts/make-www.js && node scripts/make-site.js');
  });
});

console.log('\n  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
