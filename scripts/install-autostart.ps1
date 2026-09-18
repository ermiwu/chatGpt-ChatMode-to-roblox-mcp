[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskName = 'WebToRobloxMcp'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$fixedLauncher = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'start-fixed.ps1')).Path
$powerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source

# Register one interactive-user task so it can reach the same Roblox Studio session.
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $fixedLauncher + '"'
$action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0) -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Starts the stable Tailscale-to-Roblox MCP gateway at user logon.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started scheduled task: $taskName"
Write-Output "Inspect: Get-ScheduledTask -TaskName $taskName"
Write-Output "Remove: powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-autostart.ps1"
