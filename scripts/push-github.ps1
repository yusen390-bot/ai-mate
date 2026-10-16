# 一键：提交 → 关联远程 → 推送到 GitHub（全程写日志 logs\git-push.log）
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log = Join-Path $logs 'git-push.log'

# 你的仓库地址（已确认存在、公开、初始为空）
$knownUrl = 'https://github.com/yusen390-bot/ai-mate.git'

$git = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'
if (-not (Test-Path -LiteralPath $git)) { $git = 'git' }

function Say([string]$text) { $text | Tee-Object -FilePath $log -Append | Out-Null; Write-Host $text }
function Git([string[]]$cmdArgs) { & $git -C $repo @cmdArgs 2>&1 | Tee-Object -FilePath $log -Append }

Say '=============================================='
Say " 推送到 GitHub   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Say '=============================================='
Say "  仓库    : $repo"
Say "  目标    : $knownUrl"

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
Say '  最近提交：'
Git @('log', '--oneline', '-n', '3')

Say ''
Say '[2] 关联远程仓库（无条件纠正为你的地址，修复各种写错的地址）'
$current = (& $git -C $repo remote get-url origin 2>$null) -as [string]
if ($current) { Say "  原 origin = $current" }
& $git -C $repo remote remove origin 2>$null | Out-Null
Git @('remote', 'add', 'origin', $knownUrl)
Git @('remote', '-v')

Say ''
Say '[3] 推送（首次会弹出 GitHub 登录窗口，请在浏览器里授权）'
Git @('branch', '-M', 'main')
Git @('push', '-u', 'origin', 'main')
$code = $LASTEXITCODE

Say ''
if ($code -eq 0) {
  Say '[OK] 推送成功！打开 https://github.com/yusen390-bot/ai-mate 即可看到代码。'
} else {
  Say "[X] 推送失败（退出码 $code）。按顺序排查："
  Say '    1) 网络超时 → 先打开 v2rayN 代理，再运行一次'
  Say '    2) 登录窗口没弹 / 授权失败 → 再运行一次'
  Say '    3) Authentication failed → 凭据管理器里删除 github.com 后重试'
  Say '    4) 其他 → 把本日志交给 Codex'
}
Say "日志：$log"
if ($code -eq 0) { exit 0 } else { exit 1 }
