# 启动后自检：探测端口与 HTTP，写报告到 logs\启动报告.txt
# 退出码：0 = 前后端都正常；1 = 有服务没起来
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$report = Join-Path $logs '启动报告.txt'
$lines = New-Object System.Collections.Generic.List[string]

function Add-Line([string]$text) { $lines.Add($text) | Out-Null; Write-Host $text }
function Probe([string]$url) {
  $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 5 $url 2>&1
  "$url -> HTTP $code"
}

$node = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'

Add-Line '=============================================='
Add-Line " AI Mate 启动自检报告   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-Line '=============================================='
Add-Line ''
Add-Line '[1] 环境'
Add-Line "  用户      : $env:USERNAME"
Add-Line "  node.exe  : $node   存在=$(Test-Path -LiteralPath $node)"
Add-Line "  node -v   : $(& $node -v 2>&1)"
Add-Line "  项目      : $repo"
foreach ($f in @('server\src\index.ts', 'client\node_modules\vite\bin\vite.js', '.env', 'server\node_modules', 'client\node_modules')) {
  Add-Line ("  {0,-42} {1}" -f $f, (Test-Path -LiteralPath (Join-Path $repo $f)))
}

Add-Line ''
Add-Line '[2] 等待 15 秒让服务启动 ...'
Start-Sleep -Seconds 15

Add-Line ''
Add-Line '[3] 端口监听（LISTENING）'
$listen = netstat -ano | Select-String -Pattern 'LISTENING' | Select-String -Pattern ':(3001|5173)\s'
if ($listen) { $listen | ForEach-Object { Add-Line ('  ' + $_.Line.Trim()) } } else { Add-Line '  3001/5173 均未监听（服务没起来）' }

Add-Line ''
Add-Line '[4] HTTP 探测'
$backend = Probe 'http://127.0.0.1:3001/health'
$frontend = Probe 'http://127.0.0.1:5173/'
Add-Line "  后端 $backend"
Add-Line "  前端 $frontend"

Add-Line ''
Add-Line '[5] 日志尾部（logs 目录）'
foreach ($name in @('backend.log', 'frontend.log')) {
  Add-Line "  ---- $name ----"
  $p = Join-Path $logs $name
  if (Test-Path -LiteralPath $p) {
    Get-Content -LiteralPath $p -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Add-Line ('    ' + $_) }
  } else {
    Add-Line '    （未生成）'
  }
}

Add-Line ''
Add-Line '=============================================='
$ok = ($backend -match 'HTTP 200') -and ($frontend -match 'HTTP 200')
if ($ok) {
  Add-Line ' 结果：两个服务都正常，接下来浏览器会自动打开 http://localhost:5173'
} else {
  Add-Line ' 结果：有服务没起来 —— 请把本报告（logs\启动报告.txt）交给 Codex'
  Add-Line ' 提示：若端口显示被占用，多半是上一次的窗口还开着，先全部关掉再重试'
}
Add-Line '=============================================='

$lines -join "`r`n" | Out-File -FilePath $report -Encoding utf8
Write-Host ''
Write-Host "自检报告：$report"
if ($ok) { exit 0 } else { exit 1 }