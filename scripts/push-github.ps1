# 一键：提交 → 关联远程 → 推送到 GitHub（全程写日志 logs\git-push.log）
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log = Join-Path $logs 'git-push.log'

# 已确认的仓库地址（yusen390-bot/ai-mate，公开且为空）
$knownUrl = 'https://github.com/yusen390-bot/ai-mate.git'

$git = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'
if (-not (Test-Path -LiteralPath $git)) { $git = 'git' }

function Say([string]$text) { $text | Tee-Object -FilePath $log -Append | Out-Null; Write-Host $text }
function Git([string[]]$cmdArgs) { & $git -C $repo @cmdArgs 2>&1 | Tee-Object -FilePath $log -Append }

Say '=============================================='
Say " 推送到 GitHub   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Say '=============================================='
Say "  仓库: $repo"
Say "  目标: $knownUrl"

Say ''
Say '[1] 提交本地改动'
Git @('add', '-A')
$staged = (& $git -C $repo diff --cached --name-only 2>$null | Measure-Object).Count
if ($staged -gt 0) {
  Say "  暂存文件 $staged 个，正在提交 ..."
  Git @('commit', '-m', 'feat: W1 全栈骨架（四表数据模型 + 任务 CRUD API + Tailwind 任务台 + Vitest 测试）')
} else {
  Say '  没有需要提交的改动（或已提交过）'
}
Say '  最近提交：'
Git @('log', '--oneline', '-n', '3')

Say ''
Say '[2] 关联远程仓库'
$url = (& $git -C $repo remote get-url origin 2>$null) -as [string]
if ($url) { Say "  当前 origin = $url" }
if (-not $url -or $url -match '你的用户名' -or $url -match 'USERNAME') {
  $url = $knownUrl
  Say "  使用内置地址：$url"
}
& $git -C $repo remote remove origin 2>$null | Out-Null
Git @('remote', 'add', 'origin', $url)
Say "  origin 已设置为 $url"

Say ''
Say '[3] 推送（首次会弹出 GitHub 登录窗口，请在浏览器里授权）'
Git @('branch', '-M', 'main')
Git @('push', '-u', 'origin', 'main')
$code = $LASTEXITCODE

Say ''
if ($code -eq 0) {
  Say '[OK] 推送成功！打开 https://github.com/yusen390-bot/ai-mate 就能看到代码了。'
} else {
  Say "[X] 推送失败（退出码 $code）。常见原因与处理："
  Say '    1) 网络超时（国内直连 GitHub 不稳）→ 先打开 v2rayN 代理，再运行一次'
  Say '    2) 登录窗口没弹出或授权失败 → 再运行一次，仔细看弹出的窗口'
  Say '    3) 凭据失效 → 打开「凭据管理器」删除 github.com 条目后重试'
  Say '    4) 其他 → 把本日志交给 Codex 分析'
}
Say "日志：$log"
if ($code -eq 0) { exit 0 } else { exit 1 }