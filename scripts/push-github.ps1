# 一键：提交 → 关联远程 → 自动选网络通道 → 配置凭据助手 → 推送（必要时强制覆盖）
# 日志：logs\git-push.log
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log = Join-Path $logs 'git-push.log'

$knownUrl = 'https://github.com/yusen390-bot/ai-mate.git'

$git = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'
if (-not (Test-Path -LiteralPath $git)) { $git = 'git' }

function Say([string]$text) { $text | Tee-Object -FilePath $log -Append | Out-Null; Write-Host $text }
function Git([string[]]$cmdArgs) { & $git -C $repo @cmdArgs 2>&1 | Tee-Object -FilePath $log -Append }

Say '=============================================='
Say " 推送到 GitHub   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Say '=============================================='
Say "  仓库 : $repo"
Say "  目标 : $knownUrl"

Say ''
Say '[1] 提交本地改动'
Git @('add', '-A')
$staged = (& $git -C $repo diff --cached --name-only 2>$null | Measure-Object).Count
if ($staged -gt 0) {
  Say "  暂存 $staged 个文件，正在提交 ..."
  Git @('commit', '-m', 'feat: AI Mate 更新')
} else {
  Say '  没有需要提交的改动（已是最新）'
}
Git @('log', '--oneline', '-n', '3')

Say ''
Say '[2] 关联远程仓库（无条件纠正为你的地址）'
$current = (& $git -C $repo remote get-url origin 2>$null) -as [string]
if ($current) { Say "  原 origin = $current" }
& $git -C $repo remote remove origin 2>$null | Out-Null
Git @('remote', 'add', 'origin', $knownUrl)
Git @('remote', '-v')

Say ''
Say '[3] 自动测试网络通道（选一个能连上 GitHub 的）'
$candidates = @(
  @{ name = 'SOCKS5  127.0.0.1:10808'; value = 'socks5h://127.0.0.1:10808' },
  @{ name = 'HTTP    127.0.0.1:10813'; value = 'http://127.0.0.1:10813' },
  @{ name = 'HTTP    127.0.0.1:10809'; value = 'http://127.0.0.1:10809' },
  @{ name = '直连（不经过代理）'; value = $null }
)
$chosen = $null
foreach ($c in $candidates) {
  if ($c.value) {
    & $git config --global http.proxy $c.value 2>$null | Out-Null
    & $git config --global https.proxy $c.value 2>$null | Out-Null
  } else {
    & $git config --global --unset http.proxy 2>$null | Out-Null
    & $git config --global --unset https.proxy 2>$null | Out-Null
  }
  $null = & $git -C $repo ls-remote $knownUrl 2>&1
  if ($LASTEXITCODE -eq 0) { Say "  [OK] $($c.name) 可用"; $chosen = $c; break }
  else { Say "  [--] $($c.name) 不通" }
}
if (-not $chosen) {
  Say ''
  Say '[X] 所有通道都不通：请确认 v2rayN 已打开且选中可用节点，然后重试。'
  exit 1
}

Say ''
Say '[4] 配置凭据管理器（GCM）'
$gitRoot = Split-Path -Parent (Split-Path -Parent $git)
$gcm = @(
  (Join-Path $gitRoot 'ucrt64\bin\git-credential-manager.exe'),
  (Join-Path $gitRoot 'mingw64\bin\git-credential-manager.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($gcm) {
  $gcmPath = $gcm -replace '\\', '/'
  & $git config --global credential.helper $gcmPath
  Say "  credential.helper = $gcmPath"
  # 设备码方式：纯终端显示验证码 + 浏览器输码，不依赖图形弹窗（弹窗在脚本窗口里易被判为取消）
  & $git config --global credential.gitHubAuthModes device
  Say '  credential.gitHubAuthModes = device（会显示一次性验证码）'
} else {
  Say '  未找到 GCM，将使用默认凭据方式'
}

Say ''
Say "[5] 推送（通道：$($chosen.name)）"
Say '    首次会弹出授权（浏览器打开 GitHub 点 Authorize，或按提示输入一次性验证码）'
Git @('branch', '-M', 'main')
Git @('push', '-u', 'origin', 'main')
$code = $LASTEXITCODE

if ($code -ne 0) {
  Say ''
  Say '  普通推送被拒绝（远程仓库里有本地没有的文件，例如自动生成的 README）'
  Say '  改用强制覆盖 —— 远程那个自动生成的 README 会被本项目文件替换'
  Git @('push', '-u', 'origin', 'main', '--force')
  $code = $LASTEXITCODE
}

Say ''
if ($code -eq 0) {
  Say '[OK] 推送成功！打开 https://github.com/yusen390-bot/ai-mate 查看'
} else {
  Say "[X] 推送失败（退出码 $code）。按顺序排查："
  Say '    1) 授权窗口没弹 → 再运行一次，注意看屏幕和浏览器'
  Say '    2) 强制设备码登录：git config --global credential.gitHubAuthModes device 后再运行'
  Say '    3) 换个 v2rayN 节点重试'
  Say '    4) 凭据管理器里删除 github.com 条目后重试'
  Say "    日志：$log"
}
if ($code -eq 0) { exit 0 } else { exit 1 }