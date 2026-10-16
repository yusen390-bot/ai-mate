# AI Mate 后端：启动 Express(3001)，输出同时写入 logs\backend.log
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log = Join-Path $logs 'backend.log'

$node = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = 'node' }

Set-Location (Join-Path $repo 'server')
"===== 后端启动 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Out-File -FilePath $log -Encoding utf8
& $node --env-file-if-exists=..\.env --watch src\index.ts 2>&1 | Tee-Object -FilePath $log -Append
"===== 后端进程已退出（退出码 $LASTEXITCODE）=====" | Out-File -FilePath $log -Append -Encoding utf8