export const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mkv',
  'webm',
  'mov',
  'm4v',
  'avi',
  'ts',
  'flv',
  'wmv',
  'mpeg',
  'mpg'
])

export type ShareItem = {
  id: string
  name: string
  kind: string
  size: number
  thumbnailLink?: string | null
}

export type Breadcrumb = {
  id: string
  name: string
}

export type DownloadStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'

export type DownloadItemDTO = {
  id: string
  fileId: string
  fileName: string
  relativePath: string
  expectedSize: number
  status: DownloadStatus
  receivedBytes: number
  totalBytes: number
  bytesPerSecond: number
  errorMessage?: string | null
  localPath?: string | null
  retryCount: number
}

export type AppState = {
  shareURL: string
  sharePassword: string
  saveDirectory: string
  isLoading: boolean
  isScanning: boolean
  statusText: string
  errorMessage: string | null
  items: ShareItem[]
  breadcrumbs: Breadcrumb[]
  selectedIDs: string[]
  searchText: string
  preferTranscoding: boolean
  downloads: DownloadItemDTO[]
  activeCount: number
  queuedCount: number
}

export function isFolder(item: Pick<ShareItem, 'kind'>): boolean {
  return item.kind === 'drive#folder'
}

export function isVideo(item: Pick<ShareItem, 'name'>): boolean {
  const ext = item.name.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTENSIONS.has(ext)
}

export function statusIsFinished(status: DownloadStatus): boolean {
  return status === 'completed' || status === 'partial' || status === 'cancelled'
}

export function statusCanPlay(status: DownloadStatus): boolean {
  return status === 'completed' || status === 'partial'
}
