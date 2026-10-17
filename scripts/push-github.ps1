# 一键：提交 → 关联远程 → 自动选网络通道 → 配置凭据保存 → 推送
# 说明：不使用 GCM（.NET 版凭据管理器不支持 socks5h 代理），改用 store + 令牌
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log = Join-Path $logs 'git-push.log'
$knownUrl = 'https://github.com/yusen390-bot/ai-mate.git'

$git = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'
if (-not (Test-Path -LiteralPath $git)) { $git = 'git' }

# 用转录记录日志：不劫持 git 的标准输入输出，否则授权提示会失败
try { Start-Transcript -Path $log -Append | Out-Null } catch { }

function Git([string[]]$a) { & $git -C $repo @a }
function GitQuiet([string[]]$a) { $o = & $git -C $repo @a 2>&1; $o }

'=============================================='
" 推送到 GitHub   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
'=============================================='
"  仓库 : $repo"
"  目标 : $knownUrl"

''
'[1] 提交本地改动'
# 若 logs/ 曾被误提交，先从索引移除（本地文件保留）
& $git -C $repo rm -r --cached logs 2>$null | Out-Null
Git @('add', '-A')
$staged = (GitQuiet @('diff', '--cached', '--name-only', '--no-color') | Measure-Object).Count
if ($staged -gt 0) { "  暂存 $staged 个文件，提交中 ..."; Git @('commit', '-m', 'feat: AI Mate 更新') } else { '  没有需要提交的改动' }
Git @('log', '--oneline', '-n', '3')

''
'[2] 关联远程仓库'
& $git -C $repo remote remove origin 2>$null | Out-Null
Git @('remote', 'add', 'origin', $knownUrl)
Git @('remote', '-v')

''
'[3] 自动测试网络通道'
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
  $null = GitQuiet @('ls-remote', $knownUrl)
  if ($LASTEXITCODE -eq 0) { "  [OK] $($c.name) 可用"; $chosen = $c; break } else { "  [--] $($c.name) 不通" }
}
if (-not $chosen) { ''; '[X] 网络通道都不通，请确认 v2rayN 已打开且节点可用'; try { Stop-Transcript | Out-Null } catch {}; exit 1 }

''
'[4] 设置凭据保存方式（避开 GCM）'
& $git config --global credential.helper ''
& $git config --global --add credential.helper store
'  credential.helper = store  → 令牌保存在 %USERPROFILE%\.git-credentials'
'  若还没保存过凭据，推送时会要求输入：'
'     Username: yusen390-bot'
'     Password: 粘贴 GitHub 令牌（PAT，形如 ghp_...）'

''
"[5] 推送（通道：$($chosen.name)）"
Git @('branch', '-M', 'main')
Git @('push', '-u', 'origin', 'main')
$code = $LASTEXITCODE
if ($code -ne 0) {
  ''
  '  普通推送被拒绝（远程有自动生成的 README），改用强制覆盖 ...'
  Git @('push', '-u', 'origin', 'main', '--force')
  $code = $LASTEXITCODE
}

''
if ($code -eq 0) {
  '[OK] 推送成功！打开 https://github.com/yusen390-bot/ai-mate 查看'
} else {
  "[X] 推送失败（退出码 $code）"
  '    若提示 Authentication failed → Password 处粘贴的是 PAT 令牌吗？（不是账号密码）'
  '    若提示 Connection was reset → 换个 v2rayN 节点重试'
  "    日志：$log"
}
try { Stop-Transcript | Out-Null } catch {}
if ($code -eq 0) { exit 0 } else { exit 1 }