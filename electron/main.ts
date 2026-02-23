import { app, BrowserWindow, dialog } from 'electron';
import { ChildProcess, fork } from 'child_process';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const PORT = 3000;
const BACKEND_ENTRY = path.join(__dirname, '..', 'backend', 'dist', 'server.js');
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend', 'dist');
const USER_DATA_PATH = app.getPath('userData');
const DB_PATH = path.join(USER_DATA_PATH, 'proctor.db');
const UPLOADS_PATH = path.join(USER_DATA_PATH, 'uploads');

const ensureDirectories = (): void => {
  for (const dir of [USER_DATA_PATH, UPLOADS_PATH]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
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

    backendProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (!started && output.includes('Server running')) {
        started = true;
        resolve();
      }
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (!started && output.includes('Server running')) {
        started = true;
        resolve();
      }
    });

    backendProcess.on('error', (err: Error) => {
      if (!started) {
        reject(err);
      }
    });

    backendProcess.on('exit', (code: number | null) => {
      if (!started) {
        reject(new Error(`Backend exited with code ${code}`));
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
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
};

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Proctor App',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
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

app.on('ready', async () => {
  try {
    ensureDirectories();

    // Run Prisma migrations before starting backend
    const prismaPath = path.join(__dirname, '..', 'backend', 'node_modules', '.bin', 'prisma');
    const schemaPath = path.join(__dirname, '..', 'backend', 'prisma', 'schema.prisma');

    if (fs.existsSync(prismaPath)) {
      const { execSync } = await import('child_process');
      execSync(`"${prismaPath}" db push --schema="${schemaPath}" --accept-data-loss`, {
        env: {
          ...process.env,
          DATABASE_URL: `file:${DB_PATH}`,
        },
        stdio: 'pipe',
      });
    }

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
  app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
