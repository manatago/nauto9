import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerMediaProtocol, registerMediaSchemePrivileges } from './protocol'
import { registerIpc } from './ipc'
import { getDb, closeDb } from './db'

registerMediaSchemePrivileges()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0e14',
    title: 'nauto9',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Forward renderer console + crashes to the main-process terminal so a blank
  // screen always leaves a diagnosable trace.
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details.reason, 'exit', details.exitCode)
  })
  win.webContents.on('unresponsive', () => console.error('[renderer] unresponsive'))

  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerMediaProtocol()
  getDb() // open + migrate + seed eagerly so first IPC call is fast
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => closeDb())
