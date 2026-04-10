import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { registerIpcHandlers } from './ipc-handlers.js'

// Load .env from repo root so all subprojects share one config file.
// Works in both dev (process.cwd() = apps/desktop) and packaged app
// (resolve up from __dirname which is apps/desktop/out/main/).
loadEnv({ path: join(__dirname, '../../../../.env'), override: false })
loadEnv({ path: join(process.cwd(), '../../.env'), override: false })

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Register all IPC handlers, passing webContents for push events
  registerIpcHandlers(mainWindow.webContents)

  // Load renderer: dev URL in development, built HTML in production
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    // On macOS re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
