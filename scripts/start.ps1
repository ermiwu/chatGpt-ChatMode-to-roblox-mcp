[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib.ps1')

$robloxMcp = Join-Path $env:LOCALAPPDATA 'Roblox\mcp.bat'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20 or newer is required.' }
if (-not (Test-Path -LiteralPath $robloxMcp)) { throw "Roblox built-in MCP was not found: $robloxMcp" }

$toolsDir = Join-Path $projectRoot '.tools'
$logsDir = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Force -Path $toolsDir, $logsDir | Out-Null
$cloudflared = Join-Path $toolsDir 'cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflared)) {
    Write-Host 'Downloading the official Cloudflare cloudflared binary...'
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared
}

Push-Location $projectRoot
$tunnel = $null
try {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) { & npm install }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'The project build failed.' }

    $tunnelLog = Join-Path $logsDir 'cloudflared.log'
    Set-Content -LiteralPath $tunnelLog -Value '' -Encoding UTF8
    $quotedTunnelLog = '"' + $tunnelLog + '"'
    $tunnel = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:58742', '--no-autoupdate', '--logfile', $quotedTunnelLog) -WindowStyle Hidden -PassThru

    $publicBaseUrl = $null
    for ($attempt = 0; $attempt -lt 60 -and -not $publicBaseUrl; $attempt++) {
        Start-Sleep -Milliseconds 500
        if ($tunnel.HasExited) { throw 'cloudflared exited early. Check logs\cloudflared.log.' }
        $publicBaseUrl = Get-TryCloudflareUrl -LogPath $tunnelLog
    }
    if (-not $publicBaseUrl) { throw 'Timed out waiting for the Cloudflare URL. Check logs\cloudflared.log.' }

    $password = New-SecureValue -Bytes 24
    $tokenSecret = New-SecureValue -Bytes 48
    Write-LocalEnvironment -ProjectRoot $projectRoot -PublicBaseUrl $publicBaseUrl -Password $password -TokenSecret $tokenSecret | Out-Null
    $env:PUBLIC_BASE_URL = $publicBaseUrl
    $env:MCP_AUTH_PASSWORD = $password
    $env:MCP_TOKEN_SECRET = $tokenSecret

    Write-Host ''
    Write-Host "ChatGPT MCP URL: $publicBaseUrl/mcp" -ForegroundColor Green
    Write-Host "OAuth approval password: $password" -ForegroundColor Yellow
    Write-Host 'The token secret is stored only in the ignored .env.local file.'
    Write-Host ''
    & npm run doctor
    if ($LASTEXITCODE -ne 0) { throw 'Roblox MCP diagnostics failed. Follow the message above.' }
    Write-Host 'Gateway is running. Press Ctrl+C to stop the gateway and tunnel.'
    & npm start
} finally {
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
    Pop-Location
}
