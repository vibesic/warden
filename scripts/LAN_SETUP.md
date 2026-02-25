# LAN Setup

## Build (requires internet)

### WSL Terminal

```bash
cd ~/proctor-app
bash scripts/lan-wsl.sh build
```

## Start (no internet needed)

### 1. WSL Terminal

```bash
cd ~/proctor-app
bash scripts/lan-wsl.sh
```

### 2. PowerShell (Run as Administrator)

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd \\wsl$\Ubuntu\home\kazawa\proctor-app
.\scripts\lan-win.ps1
```

---

## Stop

### 1. WSL Terminal

```bash
cd ~/proctor-app
bash scripts/lan-wsl.sh stop
```

### 2. PowerShell (Run as Administrator)

```powershell
cd \\wsl$\Ubuntu\home\kazawa\proctor-app
.\scripts\lan-win.ps1 -Stop
```
