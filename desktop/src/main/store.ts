import { BrowserWindow, dialog, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { sanitizeFileName } from '../shared/format'
import { isFolder, isVideo, type AppState, type Breadcrumb, type ShareItem } from '../shared/types'
import { parseShareLink, PikPakShareClient, type PendingDownload } from './pikpak/client'
import { DownloadManager, toDTO } from './pikpak/download'
import { loadSettings, saveSettings, type PersistedSettings } from './settings'

export class AppStore {
  shareURL = ''
  sharePassword = ''
  saveDirectory = ''
  isLoading = false
  isScanning = false
  statusText = ''
  errorMessage: string | null = null
  items: ShareItem[] = []
  breadcrumbs: Breadcrumb[] = []
  selectedIDs = new Set<string>()
  searchText = ''
  preferTranscoding = false

  readonly client: PikPakShareClient
  readonly downloads: DownloadManager

  private rootParentId = ''
  private currentParentId = ''
  private persistTimer: NodeJS.Timeout | null = null
  private emitTimer: NodeJS.Timeout | null = null
  private window: BrowserWindow | null = null

  constructor(settings: PersistedSettings, onImmediateChange?: () => void) {
    this.shareURL = settings.shareURL
    this.sharePassword = settings.sharePassword
    this.saveDirectory = settings.saveDirectory
    this.preferTranscoding = settings.preferTranscoding
    this.client = new PikPakShareClient(settings.deviceIDs)
    this.downloads = new DownloadManager(this.client, () => {
      this.emit()
      onImmediateChange?.()
    })
    this.downloads.preferTranscoding = settings.preferTranscoding
  }

  attach(window: BrowserWindow): void {
    this.window = window
    this.emit(true)
  }

  snapshot(): AppState {
    return {
      shareURL: this.shareURL,
      sharePassword: this.sharePassword,
      saveDirectory: this.saveDirectory,
      isLoading: this.isLoading,
      isScanning: this.isScanning,
      statusText: this.statusText,
      errorMessage: this.errorMessage,
      items: this.items,
      breadcrumbs: this.breadcrumbs,
      selectedIDs: [...this.selectedIDs],
      searchText: this.searchText,
      preferTranscoding: this.preferTranscoding,
      downloads: this.downloads.items.map(toDTO),
      activeCount: this.downloads.activeCount,
      queuedCount: this.downloads.queuedCount
    }
  }

  emit(immediate = false): void {
    const send = (): void => {
      this.window?.webContents.send('state', this.snapshot())
    }
    if (immediate) {
      if (this.emitTimer) clearTimeout(this.emitTimer)
      send()
      return
    }
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      send()
    }, 80)
  }

  persist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      void saveSettings({
        shareURL: this.shareURL,
        sharePassword: this.sharePassword,
        saveDirectory: this.saveDirectory,
        preferTranscoding: this.preferTranscoding,
        deviceIDs: this.client.getDeviceIDs()
      })
    }, 200)
    this.downloads.preferTranscoding = this.preferTranscoding
  }

  setShareURL(value: string): void {
    this.shareURL = value
    this.persist()
    this.emit()
  }

  setSharePassword(value: string): void {
    this.sharePassword = value
    this.persist()
    this.emit()
  }

  setSearchText(value: string): void {
    this.searchText = value
    this.emit(true)
  }

  setPreferTranscoding(value: boolean): void {
    this.preferTranscoding = value
    this.downloads.preferTranscoding = value
    this.persist()
    this.emit(true)
  }

  dismissError(): void {
    this.errorMessage = null
    this.emit(true)
  }

  async openShare(): Promise<void> {
    this.persist()
    this.isLoading = true
    this.errorMessage = null
    this.statusText = '正在打开分享…'
    this.emit(true)
    try {
      const parsed = parseShareLink(this.shareURL)
      const opened = await this.client.openShare(parsed.shareId, this.sharePassword, parsed.parentId)
      this.rootParentId = opened.startParentId
      this.currentParentId = opened.startParentId
      this.breadcrumbs = [{ id: opened.startParentId, name: opened.title }]
      this.selectedIDs.clear()
      await this.reloadCurrent()
      this.statusText = `已加载 ${this.items.length} 项`
      this.persist()
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error)
      this.statusText = '打开失败'
    }
    this.isLoading = false
    this.emit(true)
  }

  async enterFolder(itemId: string): Promise<void> {
    const item = this.items.find((entry) => entry.id === itemId)
    if (!item || !isFolder(item)) return
    this.isLoading = true
    this.errorMessage = null
    this.breadcrumbs.push({ id: item.id, name: item.name })
    this.currentParentId = item.id
    this.selectedIDs.clear()
    this.searchText = ''
    this.emit(true)
    try {
      await this.reloadCurrent()
      this.statusText = `已加载 ${this.items.length} 项`
    } catch (error) {
      this.breadcrumbs.pop()
      this.currentParentId = this.breadcrumbs.at(-1)?.id ?? this.rootParentId
      this.errorMessage = error instanceof Error ? error.message : String(error)
    }
    this.isLoading = false
    this.emit(true)
  }

  async goToBreadcrumb(crumbId: string): Promise<void> {
    const index = this.breadcrumbs.findIndex((crumb) => crumb.id === crumbId)
    if (index < 0) return
    this.breadcrumbs = this.breadcrumbs.slice(0, index + 1)
    this.currentParentId = crumbId
    this.selectedIDs.clear()
    this.searchText = ''
    this.isLoading = true
    this.emit(true)
    try {
      await this.reloadCurrent()
      this.statusText = `已加载 ${this.items.length} 项`
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error)
    }
    this.isLoading = false
    this.emit(true)
  }

  toggleSelection(itemId: string): void {
    if (this.selectedIDs.has(itemId)) this.selectedIDs.delete(itemId)
    else this.selectedIDs.add(itemId)
    this.emit(true)
  }

  private visibleItems(): ShareItem[] {
    const keyword = this.searchText.trim().toLowerCase()
    if (!keyword) return this.items
    return this.items.filter((item) => item.name.toLowerCase().includes(keyword))
  }

  selectAllCurrent(): void {
    const ids = this.visibleItems().map((item) => item.id)
    if (ids.length > 0 && ids.every((id) => this.selectedIDs.has(id))) {
      this.selectedIDs.clear()
    } else {
      for (const id of ids) this.selectedIDs.add(id)
    }
    this.emit(true)
  }

  selectAllVideos(): void {
    const videos = this.visibleItems().filter(isVideo).map((item) => item.id)
    if (videos.length > 0 && videos.every((id) => this.selectedIDs.has(id))) {
      for (const id of videos) this.selectedIDs.delete(id)
    } else {
      for (const id of videos) this.selectedIDs.add(id)
    }
    this.emit(true)
  }

  async downloadSelected(): Promise<void> {
    this.persist()
    if (this.selectedIDs.size === 0) return
    this.isScanning = true
    this.errorMessage = null
    this.statusText = '正在准备下载…'
    this.emit(true)
    try {
      await fs.mkdir(this.saveDirectory, { recursive: true })
      const pending: PendingDownload[] = []
      const currentPath = this.breadcrumbs
        .slice(1)
        .map((crumb) => crumb.name)
        .join('/')
      for (const item of this.items) {
        if (!this.selectedIDs.has(item.id)) continue
        const safeName = sanitizeFileName(item.name)
        if (isFolder(item)) {
          this.statusText = `正在扫描 ${item.name}…`
          this.emit(true)
          const nestedPath = currentPath ? `${currentPath}/${safeName}` : safeName
          pending.push(...(await this.client.collectVideos(item.id, nestedPath)))
        } else {
          pending.push({
            fileId: item.id,
            fileName: safeName,
            relativePath: currentPath,
            expectedSize: item.size
          })
        }
      }
      this.downloads.preferTranscoding = this.preferTranscoding
      this.downloads.enqueue(pending, this.saveDirectory)
      this.statusText = `已加入 ${pending.length} 个文件`
      this.selectedIDs.clear()
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error)
      this.statusText = '准备下载失败'
    }
    this.isScanning = false
    this.emit(true)
  }

  async chooseSaveDirectory(): Promise<void> {
    const parent = this.window ?? undefined
    const options = {
      title: '选择保存目录',
      defaultPath: this.saveDirectory,
      properties: ['openDirectory', 'createDirectory'] as Array<
        'openDirectory' | 'createDirectory'
      >
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return
    this.saveDirectory = result.filePaths[0]
    this.persist()
    this.emit(true)
  }

  async openSaveDirectory(): Promise<void> {
    await fs.mkdir(this.saveDirectory, { recursive: true })
    await shell.openPath(this.saveDirectory)
  }

  async openPath(filePath: string): Promise<void> {
    await shell.openPath(filePath)
  }

  showInFolder(filePath: string): void {
    shell.showItemInFolder(filePath)
  }

  private async reloadCurrent(): Promise<void> {
    this.items = await this.client.list(this.currentParentId)
  }
}
