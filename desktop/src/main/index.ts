import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { attachStreamProtocol, openStreamPlayer, registerStreamScheme, videoContentType } from './player'
import { PikPakError } from './pikpak/client'
import { AppStore } from './store'
import { loadSettings } from './settings'

registerStreamScheme()

app.setName('黄果下载')

if (process.platform === 'win32') {
  app.setAppUserModelId('com.huangguo.desktop')
}

let mainWindow: BrowserWindow | null = null
let store: AppStore | null = null

async function createWindow(): Promise<void> {
  const settings = await loadSettings()
  store = new AppStore(settings)

  const preloadMjs = join(__dirname, '../preload/index.mjs')
  const preloadJs = join(__dirname, '../preload/index.js')

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#FFF1F3',
    title: '黄果下载',
    autoHideMenuBar: true,
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 18 } } : {}),
    webPreferences: {
      preload: existsSync(preloadMjs) ? preloadMjs : preloadJs,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  store.attach(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function bindIpc(): void {
  ipcMain.handle('download:locate', (_event, fileId: string) => store?.locateDownload(fileId))
  ipcMain.handle('download:watch', (_event, fileId: string) => store?.openWatchPage(fileId))
  ipcMain.handle('state:get', () => store?.snapshot() ?? null)
  ipcMain.handle('share:url', (_event, value: string) => store?.setShareURL(value))
  ipcMain.handle('share:password', (_event, value: string) => store?.setSharePassword(value))
  ipcMain.handle('share:search', (_event, value: string) => store?.setSearchText(value))
  ipcMain.handle('share:viewMode', (_event, value: 'list' | 'icons') => store?.setViewMode(value))
  ipcMain.handle('share:transcoding', (_event, value: boolean) => store?.setPreferTranscoding(value))
  ipcMain.handle('share:open', () => store?.openShare())
  ipcMain.handle('share:enter', (_event, id: string) => store?.enterFolder(id))
  ipcMain.handle('share:breadcrumb', (_event, id: string) => store?.goToBreadcrumb(id))
  ipcMain.handle('share:toggle', (_event, id: string) => store?.toggleSelection(id))
  ipcMain.handle('share:selectAll', () => store?.selectAllCurrent())
  ipcMain.handle('share:selectVideos', () => store?.selectAllVideos())
  ipcMain.handle('share:download', () => store?.downloadSelected())
  ipcMain.handle('share:downloadItem', (_event, id: string) => store?.downloadItem(id))
  ipcMain.handle('share:play', (_event, fileId: string) => {
    const item = store?.items.find((entry) => entry.id === fileId)
    openStreamPlayer(fileId, item?.name ?? '播放')
  })
  ipcMain.handle('share:chooseDir', () => store?.chooseSaveDirectory())
  ipcMain.handle('share:dismissError', () => store?.dismissError())
  ipcMain.handle('download:retry', (_event, id: string) => {
    if (!store) return
    store.downloads.retry(id, store.saveDirectory)
  })
  ipcMain.handle('download:cancel', (_event, id: string) => store?.downloads.cancel(id))
  ipcMain.handle('download:cancelAll', () => store?.downloads.cancelAll())
  ipcMain.handle('download:clearFinished', () => store?.downloads.clearFinished())
  ipcMain.handle('download:remove', (_event, id: string) => {
    if (!store) return
    return store.downloads.remove(id, store.saveDirectory)
  })
  ipcMain.handle('download:openDir', () => store?.openSaveDirectory())
  ipcMain.handle('download:openPath', (_event, filePath: string) => store?.openPath(filePath))
  ipcMain.handle('download:showInFolder', (_event, filePath: string) => store?.showInFolder(filePath))
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
}

app.whenReady().then(async () => {
  await session.defaultSession.setProxy({ mode: 'system' })
  await attachStreamProtocol(async (fileId) => {
    if (!store) throw new PikPakError('播放器还没准备好')
    const item = store.items.find((entry) => entry.id === fileId)
    const playback = await store.client.streamingURL(fileId)
    return {
      ...playback,
      userAgent: store.client.userAgent,
      contentType: videoContentType(item?.name ?? ''),
      saveDirectory: store.saveDirectory,
      fileName: item?.name ?? fileId
    }
  })
  bindIpc()
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
