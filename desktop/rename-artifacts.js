/*!
 * quadratic-exact-lab · desktop/rename-artifacts.js
 * ------------------------------------------------------------------
 * electron-builder 26 只支持给 nsis 单独设置 artifactName，
 * 免安装 ZIP 会沿用 win.artifactName。这里在打包后把 ZIP 重命名成
 * 「…-免安装版-…」，让两个产物一眼可区分。由 `npm run dist` 自动调用。
 * ------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'dist-desktop');
if (!fs.existsSync(OUT)) {
  console.log('dist-desktop 不存在，跳过重命名');
  process.exit(0);
}

const version = require('../package.json').version;
let renamed = 0;

fs.readdirSync(OUT).forEach(function (name) {
  /* 只处理形如 xxx-1.2.0-x64.zip 的免安装包，跳过已重命名与 blockmap */
  const m = /^(.*)-(\d+\.\d+\.\d+)-([A-Za-z0-9_]+)\.zip$/.exec(name);
  if (!m) return;
  const target = m[1] + '-' + m[2] + '-免安装版-' + m[3] + '.zip';
  if (target === name) return;
  fs.renameSync(path.join(OUT, name), path.join(OUT, target));
  console.log('renamed ' + name + ' -> ' + target);
  renamed++;
});

if (!renamed) console.log('没有需要重命名的 ZIP（版本 ' + version + '）');
