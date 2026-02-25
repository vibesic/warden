# ──────────────────────────────────────────────────────────────
# lan-win.ps1 — Run from Windows PowerShell (as Administrator)
#
# Sets up port forwarding from the Windows host to WSL so that
# other computers on the LAN can reach the Docker containers.
# Also creates the required firewall rules.
#
# Usage (PowerShell as Admin):
#   .\scripts\lan-win.ps1            # set up forwarding
#   .\scripts\lan-win.ps1 -Stop      # remove forwarding
# ──────────────────────────────────────────────────────────────
param(
    [switch]$Stop
)

$ErrorActionPreference = "Stop"

$Ports = @(5174, 4444)
$FwPrefix = "Proctor App LAN"

# ── Stop / cleanup mode ──────────────────────────────────────
if ($Stop) {
    Write-Host "`n[lan-win] Removing port forwarding and firewall rules...`n" -ForegroundColor Yellow

    foreach ($port in $Ports) {
        netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
        Write-Host "  Removed portproxy for port $port"
    }

    Get-NetFirewallRule -DisplayName "$FwPrefix*" -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Write-Host "  Removed firewall rules"

    Write-Host "`n[lan-win] Cleanup complete.`n" -ForegroundColor Green
    exit 0
}

# ── Check admin privileges ───────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "`n[lan-win] ERROR: This script must be run as Administrator." -ForegroundColor Red
    Write-Host "  Right-click PowerShell -> Run as Administrator`n"
    exit 1
}

# ── Detect WSL IP ─────────────────────────────────────────────
Write-Host "`n[lan-win] Detecting WSL IP..." -ForegroundColor Cyan

$wslIp = (wsl hostname -I).Trim().Split(" ")[0]

if ([string]::IsNullOrWhiteSpace($wslIp)) {
    Write-Host "[lan-win] ERROR: Could not detect WSL IP. Is WSL running?" -ForegroundColor Red
    exit 1
}

Write-Host "[lan-win] WSL IP: $wslIp" -ForegroundColor Cyan

# ── Detect Windows host LAN IP ───────────────────────────────
$hostIp = (Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -ne $null } |
    Select-Object -First 1
).IPv4Address.IPAddress

Write-Host "[lan-win] Host LAN IP: $hostIp`n" -ForegroundColor Cyan

# ── Set up port forwarding ───────────────────────────────────
Write-Host "[lan-win] Configuring port forwarding..." -ForegroundColor Yellow

foreach ($port in $Ports) {
    # Remove existing rule if any
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null

    # Add new rule
    netsh interface portproxy add v4tov4 `
        listenport=$port listenaddress=0.0.0.0 `
        connectport=$port connectaddress=$wslIp

    Write-Host "  Port $port -> ${wslIp}:${port}"
}

Write-Host ""

# ── Set up firewall rules ────────────────────────────────────
Write-Host "[lan-win] Configuring firewall rules..." -ForegroundColor Yellow

# Remove old rules
Get-NetFirewallRule -DisplayName "$FwPrefix*" -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue

foreach ($port in $Ports) {
    New-NetFirewallRule `
        -DisplayName "$FwPrefix - Port $port" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $port `
        -Action Allow `
        -Profile Any | Out-Null

    Write-Host "  Firewall rule added for port $port (All profiles)"
}

# ── Show summary ─────────────────────────────────────────────
Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  Port forwarding is active" -ForegroundColor Green
Write-Host "  Frontend: http://${hostIp}:5174" -ForegroundColor Green
Write-Host "  Backend:  http://${hostIp}:4444" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Current portproxy rules:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4
Write-Host ""
Write-Host "To remove:  .\scripts\lan-win.ps1 -Stop" -ForegroundColor DarkGray
Write-Host ""
