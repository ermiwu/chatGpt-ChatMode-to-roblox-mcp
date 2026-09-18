Set-StrictMode -Version Latest

# Extract the HTTPS Quick Tunnel URL from cloudflared logs.
function Get-TryCloudflareUrl {
    param([Parameter(Mandatory = $true)][string]$LogPath)
    if (-not (Test-Path -LiteralPath $LogPath)) { return $null }
    $text = Get-Content -LiteralPath $LogPath -Raw -ErrorAction SilentlyContinue
    $match = [regex]::Match($text, 'https://[a-z0-9-]+[.]trycloudflare.com')
    if ($match.Success) { return $match.Value }
    return $null
}

# Generate a cryptographically secure password or signing secret.
function New-SecureValue {
    param([int]$Bytes = 32)
    $buffer = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

# Write runtime settings only to the Git-ignored .env.local file.
function Write-LocalEnvironment {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRoot,
        [Parameter(Mandatory = $true)][string]$PublicBaseUrl,
        [Parameter(Mandatory = $true)][string]$Password,
        [Parameter(Mandatory = $true)][string]$TokenSecret
    )
    $target = Join-Path $ProjectRoot '.env.local'
    $lines = @(
        "PUBLIC_BASE_URL=$PublicBaseUrl"
        'REMOTE_HOST=127.0.0.1'
        'REMOTE_PORT=58742'
        "MCP_AUTH_PASSWORD=$Password"
        "MCP_TOKEN_SECRET=$TokenSecret"
        "ALLOWED_ORIGINS=$PublicBaseUrl"
    )
    $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllLines($target, $lines, $utf8WithoutBom)
    return $target
}

# Parse a dotenv file without evaluating its contents as PowerShell code.
function Read-LocalEnvironment {
    param([Parameter(Mandatory = $true)][string]$Path)
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if (-not $line -or $line.TrimStart().StartsWith('#')) { continue }
        $pair = $line -split '=', 2
        if ($pair.Count -eq 2) { $values[$pair[0].Trim()] = $pair[1] }
    }
    return $values
}

# Validate that local settings and the active Funnel describe one fixed, loopback-only gateway.
function Test-FixedGatewayEnvironment {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Values,
        [Parameter(Mandatory = $true)][string]$TailscaleState,
        [Parameter(Mandatory = $true)][string]$FunnelStatus
    )
    $required = @('PUBLIC_BASE_URL', 'MCP_AUTH_PASSWORD', 'MCP_TOKEN_SECRET', 'ALLOWED_ORIGINS')
    foreach ($name in $required) { if (-not $Values[$name]) { throw "$name is missing from .env.local" } }
    $publicUrl = [Uri]$Values.PUBLIC_BASE_URL
    if ($publicUrl.Scheme -ne 'https') { throw 'PUBLIC_BASE_URL must use HTTPS.' }
    if ($Values.ALLOWED_ORIGINS.TrimEnd('/') -ne $Values.PUBLIC_BASE_URL.TrimEnd('/')) { throw 'ALLOWED_ORIGINS must match PUBLIC_BASE_URL.' }
    if (($Values.REMOTE_HOST -and $Values.REMOTE_HOST -ne '127.0.0.1') -or ($Values.REMOTE_PORT -and $Values.REMOTE_PORT -ne '58742')) { throw 'The fixed gateway must use 127.0.0.1:58742.' }
    if ($TailscaleState -ne 'Running') { throw 'Tailscale is not connected.' }
    if ($FunnelStatus -notmatch [regex]::Escape($publicUrl.Host) -or $FunnelStatus -notmatch '127[.]0[.]0[.]1:58742') { throw 'Tailscale Funnel does not match the fixed gateway URL and port.' }
}
