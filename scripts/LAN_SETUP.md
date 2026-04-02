# LAN Setup (Production Optimized)

The LAN setup now strictly uses the **production-grade Docker containers** (`docker-compose.prod.yml`). This is critical to ensure that a classroom of 100 students does not crash your laptop's CPU.

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
