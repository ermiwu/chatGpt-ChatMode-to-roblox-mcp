Set-StrictMode -Version Latest

# 从 cloudflared 日志中提取唯一的 HTTPS Quick Tunnel 地址。
function Get-TryCloudflareUrl {
    param([Parameter(Mandatory = $true)][string]$LogPath)
    if (-not (Test-Path -LiteralPath $LogPath)) { return $null }
    $text = Get-Content -LiteralPath $LogPath -Raw -ErrorAction SilentlyContinue
    $match = [regex]::Match($text, 'https://[a-z0-9-]+[.]trycloudflare.com')
    if ($match.Success) { return $match.Value }
    return $null
}

# 生成适合密码和令牌签名的加密随机字符串。
function New-SecureValue {
    param([int]$Bytes = 32)
    $buffer = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

# 只向被 Git 忽略的 .env.local 写入本次运行配置。
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
    Set-Content -LiteralPath $target -Value $lines -Encoding UTF8
    return $target
}
