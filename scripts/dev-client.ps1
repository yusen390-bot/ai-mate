# AI Mate 前端：启动 Vite(5173)，输出同时写入 logs\frontend.log
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log = Join-Path $logs 'frontend.log'

$node = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = 'node' }

Set-Location (Join-Path $repo 'client')
"===== 前端启动 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Out-File -FilePath $log -Encoding utf8
& $node 'node_modules\vite\bin\vite.js' --port 5173 2>&1 | Tee-Object -FilePath $log -Append
"===== 前端进程已退出（退出码 $LASTEXITCODE）=====" | Out-File -FilePath $log -Append -Encoding utf8