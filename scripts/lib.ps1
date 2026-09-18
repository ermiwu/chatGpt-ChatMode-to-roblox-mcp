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
