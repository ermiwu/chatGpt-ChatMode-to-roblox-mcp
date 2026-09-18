[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib.ps1')

$robloxMcp = Join-Path $env:LOCALAPPDATA 'Roblox\mcp.bat'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '未找到 Node.js，请先安装 Node.js 20 或更高版本。' }
if (-not (Test-Path -LiteralPath $robloxMcp)) { throw "未找到 Roblox 自带 MCP：$robloxMcp。请安装或更新 Roblox Studio。" }

$toolsDir = Join-Path $projectRoot '.tools'
$logsDir = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Force -Path $toolsDir, $logsDir | Out-Null
$cloudflared = Join-Path $toolsDir 'cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflared)) {
    Write-Host '正在下载 Cloudflare 官方 cloudflared...'
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared
}

Push-Location $projectRoot
$tunnel = $null
try {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) { & npm install }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw '项目构建失败。' }

    $tunnelLog = Join-Path $logsDir 'cloudflared.log'
    Set-Content -LiteralPath $tunnelLog -Value '' -Encoding UTF8
    $tunnel = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:58742', '--no-autoupdate', '--logfile', $tunnelLog) -WindowStyle Hidden -PassThru

    $publicBaseUrl = $null
    for ($attempt = 0; $attempt -lt 60 -and -not $publicBaseUrl; $attempt++) {
        Start-Sleep -Milliseconds 500
        if ($tunnel.HasExited) { throw 'cloudflared 提前退出，请查看 logs\cloudflared.log。' }
        $publicBaseUrl = Get-TryCloudflareUrl -LogPath $tunnelLog
    }
    if (-not $publicBaseUrl) { throw '等待 Cloudflare HTTPS 地址超时，请查看 logs\cloudflared.log。' }

    $password = New-SecureValue -Bytes 24
    $tokenSecret = New-SecureValue -Bytes 48
    Write-LocalEnvironment -ProjectRoot $projectRoot -PublicBaseUrl $publicBaseUrl -Password $password -TokenSecret $tokenSecret | Out-Null
    $env:PUBLIC_BASE_URL = $publicBaseUrl
    $env:MCP_AUTH_PASSWORD = $password
    $env:MCP_TOKEN_SECRET = $tokenSecret

    Write-Host ''
    Write-Host "ChatGPT MCP 地址：$publicBaseUrl/mcp" -ForegroundColor Green
    Write-Host "OAuth 批准密码：$password" -ForegroundColor Yellow
    Write-Host '签名密钥已安全写入 .env.local，不会显示或提交。'
    Write-Host ''
    & npm run doctor
    if ($LASTEXITCODE -ne 0) { throw 'Roblox MCP 自检失败，请按上方提示处理。' }
    Write-Host '服务运行中；按 Ctrl+C 停止服务和隧道。'
    & npm start
} finally {
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
    Pop-Location
}
