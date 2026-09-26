# 一键把本仓库推送到 Gitee。
#
# 前置条件（只需做一次）：
#   1. 在 https://gitee.com/projects/new 建一个空仓库
#      - 仓库名：quadratic-exact-lab
#      - 归属：piaochong1
#      - 公开 / 私有随意，但【不要】勾选「使用 Readme 初始化仓库」等任何初始化选项
#   2. 本机已有可用的 Gitee SSH 密钥（本机为 ~/.ssh/id_ed25519_gitee）
#
# 用法：  powershell -ExecutionPolicy Bypass -File scripts\push-gitee.ps1

# 注意：原生命令（git）把诊断信息写到 stderr，在 $ErrorActionPreference='Stop'
# 下会被当成终止性错误。这里统一用 Continue + 显式检查 $LASTEXITCODE。
$ErrorActionPreference = 'Continue'

$repo = 'git@gitee.com:piaochong1/quadratic-exact-lab.git'
$remoteName = 'gitee'

# 1. 确保 remote 存在且指向正确
$existing = @(git remote)
if ($existing -contains $remoteName) {
    $current = (git remote get-url $remoteName).Trim()
    if ($current -ne $repo) {
        Write-Host "remote '$remoteName' 原指向 $current，改写为 $repo"
        git remote set-url $remoteName $repo
    }
} else {
    Write-Host "添加 remote '$remoteName' -> $repo"
    git remote add $remoteName $repo
}

# 2. 探测 Gitee 上仓库是否已经创建（静默，仅看退出码）
Write-Host '检查 Gitee 仓库是否已创建 ...'
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
git ls-remote --heads $remoteName 2>&1 | Out-Null
$probe = $LASTEXITCODE
$ErrorActionPreference = $prevEap

if ($probe -ne 0) {
    Write-Host ''
    Write-Host 'Gitee 上还没有这个仓库（或当前密钥无权访问）。请先完成：' -ForegroundColor Yellow
    Write-Host '  1) 打开 https://gitee.com/projects/new'
    Write-Host '  2) 仓库名填 quadratic-exact-lab，归属选 piaochong1'
    Write-Host '  3) 不要勾选任何「初始化仓库」选项（不建 README / 不建 .gitignore / 不选开源许可证）'
    Write-Host '  4) 建好后重新运行本脚本'
    Write-Host ''
    Write-Host '若怀疑是密钥问题，可先自测： ssh -T git@gitee.com'
    exit 1
}

# 3. 推送分支与标签
Write-Host '推送 main 分支 ...'
git push $remoteName main
if ($LASTEXITCODE -ne 0) { Write-Host '推送 main 失败' -ForegroundColor Red; exit 1 }

Write-Host '推送全部标签 ...'
git push $remoteName --tags
if ($LASTEXITCODE -ne 0) { Write-Host '推送标签失败' -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host '完成。仓库地址： https://gitee.com/piaochong1/quadratic-exact-lab' -ForegroundColor Green
Write-Host '如需发布安装包，可在 Gitee「发行版」页面上传 dist-desktop 下的产物。'
Write-Host '注意 Gitee 单个附件上限 100 MB：免安装版 zip 约 126 MB 会超限，请分卷或只传安装版 exe。'
