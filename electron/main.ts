import { app, BrowserWindow, dialog } from 'electron';
import { ChildProcess, execSync, fork } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const DEFAULT_PORT = 3333;
let activePort = DEFAULT_PORT;
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
      PORT: String(activePort),
      HOST: '0.0.0.0',
      DATABASE_URL: `file:${DB_PATH}`,
      UPLOADS_DIR: UPLOADS_PATH,
      FRONTEND_PATH: FRONTEND_PATH,
      ELECTRON_USER_DATA: USER_DATA_PATH,
    };

    backendProcess = fork(BACKEND_ENTRY, [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    let settled = false;
    let stdoutOutput = '';
    let stderrOutput = '';

    const settle = (action: 'resolve' | 'reject', error?: Error): void => {
      if (settled) return;
      settled = true;
      if (action === 'resolve') resolve();
      else reject(error);
    };

    const parsePort = (output: string): void => {
      // The backend writes "Server running on <host>:<port>" to stdout
      const match = output.match(/Server running on [^:]+:(\d+)/);
      if (match) {
        activePort = Number(match[1]);
      }
    };

    backendProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      stdoutOutput += output;
      if (output.includes('Server running')) {
        parsePort(output);
        settle('resolve');
      }
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      stderrOutput += output;
      if (output.includes('Server running')) {
        parsePort(output);
        settle('resolve');
      }
    });

    backendProcess.on('error', (err: Error) => {
      settle('reject', new Error(
        `Backend process error: ${err.message}\nstdout: ${stdoutOutput.slice(0, 300)}\nstderr: ${stderrOutput.slice(0, 500)}`
      ));
    });

    backendProcess.on('exit', (code: number | null) => {
      // Small delay to allow stdio buffers to flush before reading them
      setTimeout(() => {
        settle('reject', new Error(
          `Backend exited with code ${code}\nstdout: ${stdoutOutput.slice(0, 300)}\nstderr: ${stderrOutput.slice(0, 500)}`
        ));
      }, 200);
    });

    // Fallback: do NOT resolve blindly — reject after 30s so the error is visible
    setTimeout(() => {
      settle('reject', new Error(
        `Backend did not start within 30 seconds.\nstdout: ${stdoutOutput.slice(0, 300)}\nstderr: ${stderrOutput.slice(0, 500)}`
      ));
    }, 30000);
  });
};

/** Polls the backend /health endpoint until it responds 200. */
const waitForBackend = (port: number, maxMs: number = 15000): Promise<void> => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = (): void => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (Date.now() - start > maxMs) {
          reject(new Error(`Backend /health returned ${res.statusCode}`));
        } else {
          setTimeout(check, 300);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > maxMs) {
          reject(new Error('Backend /health not reachable'));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    };
    check();
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
      `netstat -ano | findstr :${activePort} | findstr LISTENING`,
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
    show: false,
    backgroundColor: '#f9fafb',
  });

  let loadRetries = 0;
  const MAX_LOAD_RETRIES = 5;

  // Show window once content is painted
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Retry on load failures (e.g., backend not ready yet)
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _errorDescription) => {
    if (errorCode === -3) return; // Navigation aborted — ignore
    if (loadRetries < MAX_LOAD_RETRIES) {
      loadRetries++;
      setTimeout(() => {
        mainWindow?.loadURL(`http://127.0.0.1:${activePort}`);
      }, 1000);
    }
  });

  // Open DevTools in dev builds for debugging
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // Use 127.0.0.1 to avoid IPv6 resolution issues on Windows
  mainWindow.loadURL(`http://127.0.0.1:${activePort}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const findAvailablePort = (startPort: number): number => {
  if (os.platform() !== 'win32') return startPort;

  // Check Windows TCP excluded port ranges to avoid EACCES
  try {
    const result = execSync(
      'netsh int ipv4 show excludedportrange protocol=tcp',
      { stdio: 'pipe', encoding: 'utf-8' }
    );
    const lines = result.split('\n');
    const excludedRanges: Array<{ start: number; end: number }> = [];
    for (const line of lines) {
      const match = line.match(/^\s*(\d+)\s+(\d+)/);
      if (match) {
        excludedRanges.push({ start: Number(match[1]), end: Number(match[2]) });
      }
    }

    let port = startPort;
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      const isExcluded = excludedRanges.some(
        (range) => port >= range.start && port <= range.end
      );
      if (!isExcluded) return port;
      port++;
    }
  } catch {
    // If check fails, proceed with the original port
  }
  return startPort;
};

const ensureFirewallRule = (port: number): void => {
  if (os.platform() !== 'win32') return;

  try {
    // Check if rule already exists
    const checkResult = execSync(
      `netsh advfirewall firewall show rule name="${FIREWALL_RULE_NAME}"`,
      { stdio: 'pipe', encoding: 'utf-8' }
    );
    if (checkResult.includes(FIREWALL_RULE_NAME)) return;
  } catch {
    // Rule doesn't exist — installer should have created it.
    // Without admin we cannot add it here, so just return.
  }
};

app.on('ready', async () => {
  try {
    ensureDirectories();
    ensureDatabase();
    activePort = findAvailablePort(DEFAULT_PORT);
    killProcessOnPort();
    ensureFirewallRule(activePort);
    await startBackend();
    await waitForBackend(activePort);
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
