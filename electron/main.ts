import { app, BrowserWindow, dialog } from 'electron';
import { ChildProcess, execSync, fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const PORT = 3333;
const FIREWALL_RULE_NAME = 'Proctor App Server';

// electron/dist/main.js → go up two levels to reach the app root
const APP_ROOT = path.join(__dirname, '..', '..');
const BACKEND_ENTRY = path.join(APP_ROOT, 'backend', 'dist', 'server.js');
const FRONTEND_PATH = path.join(APP_ROOT, 'frontend', 'dist');
const USER_DATA_PATH = app.getPath('userData');
const DB_PATH = path.join(USER_DATA_PATH, 'proctor.db');
const UPLOADS_PATH = path.join(USER_DATA_PATH, 'uploads');

const getResourcePath = (...segments: string[]): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }
  return path.join(APP_ROOT, ...segments);
};

const ensureDirectories = (): void => {
  for (const dir of [USER_DATA_PATH, UPLOADS_PATH]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

const ensureDatabase = (): void => {
  if (fs.existsSync(DB_PATH)) {
    return;
  }

  // In packaged app: copy template database from resources
  const templatePath = getResourcePath('prisma', 'template.db');
  if (fs.existsSync(templatePath)) {
    fs.copyFileSync(templatePath, DB_PATH);
    return;
  }

  // In development: use prisma db push
  if (!app.isPackaged) {
    const prismaPath = path.join(APP_ROOT, 'backend', 'node_modules', '.bin', 'prisma');
    const schemaPath = path.join(APP_ROOT, 'backend', 'prisma', 'schema.prisma');

    if (fs.existsSync(prismaPath)) {
      execSync(`"${prismaPath}" db push --schema="${schemaPath}" --accept-data-loss`, {
        env: {
          ...process.env,
          DATABASE_URL: `file:${DB_PATH}`,
        },
        stdio: 'pipe',
      });
    }
  }
};

const startBackend = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BACKEND_ENTRY)) {
      reject(new Error(`Backend entry not found: ${BACKEND_ENTRY}`));
      return;
    }

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      NODE_ENV: 'production',
      ELECTRON: 'true',
      PORT: String(PORT),
      HOST: '0.0.0.0',
      DATABASE_URL: `file:${DB_PATH}`,
      UPLOADS_DIR: UPLOADS_PATH,
      FRONTEND_PATH: FRONTEND_PATH,
      ELECTRON_USER_DATA: USER_DATA_PATH,
    };

    backendProcess = fork(BACKEND_ENTRY, [], {
      env,
      stdio: 'pipe',
    });

    let started = false;
    let stderrOutput = '';

    backendProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (!started && output.includes('Server running')) {
        started = true;
        resolve();
      }
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      stderrOutput += output;
      if (!started && output.includes('Server running')) {
        started = true;
        resolve();
      }
    });

    backendProcess.on('error', (err: Error) => {
      if (!started) {
        reject(new Error(`Backend process error: ${err.message}\n${stderrOutput}`));
      }
    });

    backendProcess.on('exit', (code: number | null) => {
      if (!started) {
        reject(new Error(`Backend exited with code ${code}\n${stderrOutput}`));
      }
    });

    // Fallback: resolve after timeout and attempt to connect anyway
    setTimeout(() => {
      if (!started) {
        started = true;
        resolve();
      }
    }, 5000);
  });
};

const stopBackend = (): void => {
  if (backendProcess) {
    const pid = backendProcess.pid;
    backendProcess.kill('SIGTERM');

    // On Windows, SIGTERM may not work for forked processes — force kill
    if (os.platform() === 'win32' && pid) {
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'pipe' });
      } catch {
        // Process may have already exited
      }
    }

    backendProcess = null;
  }
};

const killProcessOnPort = (): void => {
  if (os.platform() !== 'win32') return;
  try {
    const result = execSync(
      `netstat -ano | findstr :${PORT} | findstr LISTENING`,
      { stdio: 'pipe', encoding: 'utf-8' }
    );
    const lines = result.trim().split('\n');
    const pids = new Set<string>();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'pipe' });
      } catch {
        // Process may have already exited
      }
    }
  } catch {
    // No process listening on the port
  }
};

const createWindow = (): void => {
  const iconPath = getResourcePath('assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Proctor App',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const reservePort = (): void => {
  if (os.platform() !== 'win32') return;
  try {
    // Remove existing reservation if any
    execSync(
      `netsh http delete urlacl url=http://+:${PORT}/`,
      { stdio: 'pipe' }
    );
  } catch {
    // May not exist
  }
  try {
    // Reserve port for all users to avoid EACCES
    execSync(
      `netsh http add urlacl url=http://+:${PORT}/ user=Everyone`,
      { stdio: 'pipe' }
    );
  } catch {
    // May fail without admin — firewall rule via installer should suffice
  }
};

const ensureFirewallRule = (): void => {
  if (os.platform() !== 'win32') return;

  try {
    // Check if rule already exists
    const checkResult = execSync(
      `netsh advfirewall firewall show rule name="${FIREWALL_RULE_NAME}"`,
      { stdio: 'pipe', encoding: 'utf-8' }
    );
    if (checkResult.includes(FIREWALL_RULE_NAME)) return;
  } catch {
    // Rule doesn't exist, create it
  }

  try {
    execSync(
      `netsh advfirewall firewall add rule name="${FIREWALL_RULE_NAME}" dir=in action=allow protocol=TCP localport=${PORT}`,
      { stdio: 'pipe' }
    );
  } catch {
    // Non-fatal: firewall rule should be added by installer
  }
};

app.on('ready', async () => {
  try {
    ensureDirectories();
    ensureDatabase();
    killProcessOnPort();
    reservePort();
    ensureFirewallRule();
    await startBackend();
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start the application.\n\n${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopBackend();
  killProcessOnPort();
  app.quit();
});

app.on('before-quit', () => {
  stopBackend();
  killProcessOnPort();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
