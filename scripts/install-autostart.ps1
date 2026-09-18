[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdministrator = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdministrator) {
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
    $elevated = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    exit $elevated.ExitCode
}
$taskName = 'WebToRobloxMcp'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$fixedLauncher = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'start-fixed.ps1')).Path
$powerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source

# Register one interactive-user task so it can reach the same Roblox Studio session.
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $fixedLauncher + '"'
$action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0) -StartWhenAvailable

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $taskName
    for ($attempt = 0; $attempt -lt 20 -and (Get-ScheduledTask -TaskName $taskName).State -eq 'Running'; $attempt++) { Start-Sleep -Milliseconds 250 }
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Starts the stable Tailscale-to-Roblox MCP gateway at user logon.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started scheduled task: $taskName"
Write-Output "Inspect: Get-ScheduledTask -TaskName $taskName"
Write-Output "Remove: powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-autostart.ps1"
