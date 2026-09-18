[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib.ps1')

$envFile = Join-Path $projectRoot '.env.local'
$robloxMcp = Join-Path $env:LOCALAPPDATA 'Roblox\mcp.bat'
$tailscaleExe = 'C:\Program Files\Tailscale\tailscale.exe'
$logsDir = Join-Path $projectRoot 'logs'
$gatewayLog = Join-Path $logsDir 'fixed-gateway.log'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20 or newer is required.' }
if (-not (Test-Path -LiteralPath $robloxMcp)) { throw "Roblox built-in MCP was not found: $robloxMcp" }
if (-not (Test-Path -LiteralPath $tailscaleExe)) { throw "tailscale.exe was not found: $tailscaleExe" }
if (-not (Test-Path -LiteralPath $envFile)) { throw '.env.local is required for fixed mode.' }

$values = Read-LocalEnvironment -Path $envFile
$tailscaleState = (& $tailscaleExe status --json | ConvertFrom-Json).BackendState
$funnelStatus = (& $tailscaleExe funnel status | Out-String)
Test-FixedGatewayEnvironment -Values $values -TailscaleState $tailscaleState -FunnelStatus $funnelStatus

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
Push-Location $projectRoot
try {
    & npm run build *>> $gatewayLog
    if ($LASTEXITCODE -ne 0) { throw "Build failed. Check $gatewayLog" }
    & npm run doctor *>> $gatewayLog
    if ($LASTEXITCODE -ne 0) { Add-Content -LiteralPath $gatewayLog -Value "$(Get-Date -Format o) Studio is not ready; the gateway will still start." }

    $fastFailures = 0
    while ($fastFailures -lt 5) {
        $startedAt = Get-Date
        Add-Content -LiteralPath $gatewayLog -Value "$(Get-Date -Format o) Starting fixed gateway."
        & npm start *>> $gatewayLog
        $runtime = ((Get-Date) - $startedAt).TotalSeconds
        if ($LASTEXITCODE -eq 0) { break }
        if ($runtime -ge 60) { $fastFailures = 0 } else { $fastFailures++ }
        Add-Content -LiteralPath $gatewayLog -Value "$(Get-Date -Format o) Gateway exited with code $LASTEXITCODE; retry $fastFailures of 5."
        Start-Sleep -Seconds 5
    }
    if ($fastFailures -ge 5) { throw "Gateway stopped after repeated failures. Check $gatewayLog" }
} finally {
    Pop-Location
}
