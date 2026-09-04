import { randomUUID } from 'node:crypto'
import { net } from 'electron'
import { createWriteStream } from 'node:fs'
import { open, stat, mkdir, rm, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { formatBytes, sanitizeFileName } from '../../shared/format'
import {
  statusCanPlay,
  type DownloadItemDTO,
  type DownloadStatus
} from '../../shared/types'
import { PikPakError, type PendingDownload, type PikPakShareClient } from './client'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fileSize(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size
  } catch {
    return 0
  }
}

async function declaredEnd(filePath: string): Promise<number | null> {
  let handle: FileHandle | undefined
  try {
    handle = await open(filePath, 'r')
    const size = (await handle.stat()).size
    if (size < 8) return null
    let offset = 0
    let sawMedia = false
    let declared = 0
    const header = Buffer.alloc(16)
    for (let i = 0; i < 32; i += 1) {
      if (offset + 8 > size) break
      const { bytesRead } = await handle.read(header, 0, 8, offset)
      if (bytesRead < 8) break
      const boxSize = header.readUInt32BE(0)
      const type = header.subarray(4, 8).toString('ascii')
      let headerLen = 8
      let real = boxSize
      if (boxSize === 1) {
        const large = await handle.read(header, 0, 8, offset + 8)
        if (large.bytesRead < 8) break
        real = Number(header.readBigUInt64BE(0))
        headerLen = 16
      } else if (boxSize === 0) {
        real = size - offset
      }
      if (real < headerLen) return size + 1
      declared = Math.max(declared, offset + real)
      if (type === 'mdat' || type === 'moov') sawMedia = true
      if (real === 0) break
      offset += real
    }
    return sawMedia ? declared : null
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

export async function isComplete(filePath: string, expectedSize: number): Promise<boolean> {
  const size = await fileSize(filePath)
  if (size <= 0) return false
  if (expectedSize > 1024 && size < expectedSize) return false
  const declared = await declaredEnd(filePath)
  if (declared != null && size < declared) return false
  return true
}

export async function isPlayable(filePath: string): Promise<boolean> {
  const size = await fileSize(filePath)
  if (size < 64 * 1024) return false
  if ((await declaredEnd(filePath)) != null) return true
  return size >= 1024 * 1024
}

class Gate {
  private running = 0
  private waiters: Array<() => void> = []

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    while (this.running >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    this.running += 1
  }

  release(): void {
    this.running = Math.max(0, this.running - 1)
    this.waiters.shift()?.()
  }
}

function httpErrorMessage(code: number): string {
  if (code === 416) return '这条下载链接无法续传，正在换新地址接着下'
  return `HTTP ${code}`
}

async function transfer(
  remote: string,
  destination: string,
  expectedSize: number,
  userAgent: string,
  signal: AbortSignal,
  onProgress: (written: number, expected: number) => void
): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true })
  const existing = await fileSize(destination)
  if (existing > 0 && (await isComplete(destination, expectedSize))) {
    onProgress(existing, Math.max(existing, expectedSize))
    return
  }

  let startedAt = existing
  let received = existing

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve()
    }

    const visit = (current: URL, remaining: number): void => {
      if (signal.aborted) {
        finish(new PikPakError('已取消'))
        return
      }
      const rangeHeader = startedAt > 0 ? `bytes=${startedAt}-` : undefined
      const req = net.request({
        method: 'GET',
        url: current.toString(),
        redirect: 'manual'
      })
      req.setHeader('User-Agent', userAgent)
      req.setHeader('Referer', 'https://mypikpak.com/')
      if (rangeHeader) req.setHeader('Range', rangeHeader)

      let redirecting = false
      req.on('redirect', (_status, _method, redirectUrl) => {
        redirecting = true
        req.abort()
        if (remaining <= 0) {
          finish(new PikPakError('重定向过多'))
          return
        }
        visit(new URL(redirectUrl, current), remaining - 1)
      })

      req.on('response', (res) => {
        const status = res.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          const location = Array.isArray(res.headers.location) ? res.headers.location[0] : res.headers.location
          res.resume()
          if (remaining <= 0 || !location) {
            finish(new PikPakError('重定向过多'))
            return
          }
          visit(new URL(location, current), remaining - 1)
          return
        }
        if (status < 200 || status > 206) {
          res.resume()
          finish(new PikPakError(httpErrorMessage(status)))
          return
        }

        const lengthHeader = res.headers['content-length']
        const remoteSize = Number(Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader ?? 0)
        const openAndPipe = async (): Promise<void> => {
          if (status === 206) {
            try {
              await stat(destination)
            } catch {
              await mkdir(path.dirname(destination), { recursive: true })
              await (await open(destination, 'w')).close()
            }
          } else if (startedAt > 0) {
            const isFullFile = remoteSize > startedAt && (expectedSize <= 0 || remoteSize >= expectedSize)
            if (!isFullFile) {
              res.resume()
              throw new PikPakError(httpErrorMessage(416))
            }
            await rm(destination, { force: true })
            startedAt = 0
            received = 0
          } else {
            await rm(destination, { force: true })
            startedAt = 0
            received = 0
          }

          const flags = status === 206 ? 'a' : 'w'
          const stream = createWriteStream(destination, { flags })
          const expected =
            status === 206 ? startedAt + Math.max(0, remoteSize) : Math.max(expectedSize, remoteSize)
          onProgress(received, expected)

          const counter = new Transform({
            transform(chunk, _encoding, callback) {
              received += chunk.length
              onProgress(received, expected)
              callback(null, chunk)
            }
          })

          const abort = (): void => {
            req.abort()
            stream.destroy()
          }
          signal.addEventListener('abort', abort, { once: true })
          try {
            await pipeline(res as unknown as Readable, counter, stream)
            finish()
          } catch (error) {
            finish(signal.aborted ? new PikPakError('已取消') : (error as Error))
          } finally {
            signal.removeEventListener('abort', abort)
          }
        }

        openAndPipe().catch((error) => finish(error instanceof Error ? error : new Error(String(error))))
      })

      req.on('error', (error) => {
        if (redirecting) return
        finish(error)
      })
      signal.addEventListener(
        'abort',
        () => {
          req.abort()
          finish(new PikPakError('已取消'))
        },
        { once: true }
      )
      req.end()
    }

    visit(new URL(remote), 8)
  })

  const finalSize = await fileSize(destination)
  const declared = (await declaredEnd(destination)) ?? 0
  const needed = Math.max(expectedSize, declared)
  if (needed > 1024 && finalSize < needed) {
    throw new PikPakError(`源站下不完（${formatBytes(finalSize)} / ${formatBytes(needed)}）`)
  }
}

export type DownloadItem = {
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

export function toDTO(item: DownloadItem): DownloadItemDTO {
  return { ...item }
}

export function makeDestination(item: DownloadItem, saveRoot: string): string {
  const relative = item.relativePath
    .split('/')
    .filter(Boolean)
    .map((part) => sanitizeFileName(part))
    .join(path.sep)
  const folder = relative ? path.join(saveRoot, relative) : saveRoot
  return path.join(folder, sanitizeFileName(item.fileName))
}

export class DownloadManager {
  items: DownloadItem[] = []
  preferTranscoding = false
  private readonly gate = new Gate(2)
  private readonly controllers = new Map<string, AbortController>()
  private readonly workers = new Map<string, Promise<void>>()

  constructor(
    private readonly client: PikPakShareClient,
    private readonly onChange: () => void
  ) {}

  get activeCount(): number {
    return this.items.filter((item) => item.status === 'downloading' || item.status === 'resolving').length
  }

  get queuedCount(): number {
    return this.items.filter((item) => item.status === 'queued').length
  }

  enqueue(pending: PendingDownload[], saveRoot: string): void {
    const existing = new Set(
      this.items
        .filter((item) => item.status !== 'failed' && item.status !== 'cancelled' && !statusCanPlay(item.status))
        .map((item) => item.fileId)
    )
    for (const file of pending) {
      const current = this.items.find((item) => item.fileId === file.fileId)
      if (current) {
        if (statusCanPlay(current.status)) {
          const dest = makeDestination(current, saveRoot)
          void isPlayable(dest).then((playable) => {
            if (playable) return
            this.retry(current.id, saveRoot)
          })
          continue
        }
        if (existing.has(file.fileId)) continue
      }
      const item: DownloadItem = {
        id: randomUUID(),
        fileId: file.fileId,
        fileName: file.fileName,
        relativePath: file.relativePath,
        expectedSize: file.expectedSize,
        status: 'queued',
        receivedBytes: 0,
        totalBytes: file.expectedSize,
        bytesPerSecond: 0,
        retryCount: 0
      }
      this.items.unshift(item)
      this.start(item, saveRoot)
    }
    this.onChange()
  }

  retry(id: string, saveRoot: string): void {
    const item = this.items.find((entry) => entry.id === id)
    if (!item) return
    this.controllers.get(id)?.abort()
    item.status = 'queued'
    item.errorMessage = null
    item.bytesPerSecond = 0
    this.start(item, saveRoot)
    this.onChange()
  }

  cancel(id: string): void {
    const item = this.items.find((entry) => entry.id === id)
    if (!item) return
    this.controllers.get(id)?.abort()
    this.controllers.delete(id)
    if (!statusCanPlay(item.status)) {
      item.status = 'cancelled'
      item.errorMessage = '已取消'
      this.onChange()
    }
  }

  cancelAll(): void {
    for (const item of this.items) {
      if (!statusCanPlay(item.status)) this.cancel(item.id)
    }
  }

  clearFinished(): void {
    this.items = this.items.filter((item) => item.status !== 'completed' && item.status !== 'partial' && item.status !== 'cancelled')
    this.onChange()
  }

  private start(item: DownloadItem, saveRoot: string): void {
    this.controllers.get(item.id)?.abort()
    const controller = new AbortController()
    this.controllers.set(item.id, controller)
    const worker = (async () => {
      await this.gate.acquire()
      try {
        if (controller.signal.aborted) {
          item.status = 'cancelled'
          this.onChange()
          return
        }
        await this.perform(item, saveRoot, controller.signal)
      } finally {
        this.gate.release()
        this.workers.delete(item.id)
        this.controllers.delete(item.id)
      }
    })()
    this.workers.set(item.id, worker)
  }

  private async perform(item: DownloadItem, saveRoot: string, signal: AbortSignal): Promise<void> {
    item.status = 'resolving'
    this.onChange()
    try {
      const destination = makeDestination(item, saveRoot)
      await mkdir(path.dirname(destination), { recursive: true })
      const existing = await fileSize(destination)
      if (await isComplete(destination, item.expectedSize)) {
        item.localPath = destination
        item.receivedBytes = existing
        item.totalBytes = Math.max(existing, item.expectedSize)
        item.status = 'completed'
        this.onChange()
        return
      }
      item.status = 'downloading'
      item.receivedBytes = existing
      item.totalBytes = Math.max(item.expectedSize, existing)
      this.onChange()

      let attempt = 0
      let delay = 400
      let lastError: Error = new PikPakError(`源站下不完（${formatBytes(existing)} / ${formatBytes(item.expectedSize)}）`)
      let finished = false
      let lastSize = existing
      let stagnantRounds = 0

      while (attempt < 6) {
        if (signal.aborted) throw new PikPakError('已取消')
        const startedAt = Date.now()
        const startBytes = await fileSize(destination)
        try {
          const remote = await this.client.downloadURL(item.fileId, this.preferTranscoding)
          await transfer(
            remote,
            destination,
            item.expectedSize,
            this.client.userAgent,
            signal,
            (written, expected) => {
              item.receivedBytes = written
              if (expected > 0) item.totalBytes = Math.max(expected, item.expectedSize)
              const elapsed = (Date.now() - startedAt) / 1000
              if (elapsed > 0.25) {
                item.bytesPerSecond = Math.max(0, written - startBytes) / elapsed
              }
              this.onChange()
            }
          )
          finished = true
          break
        } catch (error) {
          if (error instanceof PikPakError && error.message === '已取消') throw error
          lastError = error instanceof Error ? error : new Error(String(error))
          attempt += 1
          const now = await fileSize(destination)
          if (now > lastSize + 64 * 1024) {
            lastSize = now
            stagnantRounds = 0
          } else {
            stagnantRounds += 1
          }
          if (stagnantRounds >= 2 && (await isPlayable(destination))) break
          if (attempt >= 6) break
          await sleep(delay)
          delay = Math.min(delay * 2, 8000)
        }
      }

      const finalSize = await fileSize(destination)
      item.receivedBytes = finalSize
      item.bytesPerSecond = 0
      item.localPath = destination
      if (finished && (await isComplete(destination, item.expectedSize))) {
        item.status = 'completed'
        item.totalBytes = Math.max(finalSize, item.expectedSize)
        item.errorMessage = null
      } else if (await isPlayable(destination)) {
        item.status = 'partial'
        item.totalBytes = Math.max(finalSize, item.expectedSize)
        item.errorMessage = `源站下不完，已保留 ${formatBytes(finalSize)} / ${formatBytes(Math.max(item.expectedSize, finalSize))}，可先播放`
      } else {
        throw lastError
      }
      this.onChange()
    } catch (error) {
      if (error instanceof PikPakError && error.message === '已取消') {
        item.status = 'cancelled'
      } else {
        item.status = 'failed'
        item.errorMessage = error instanceof Error ? error.message : String(error)
        item.retryCount += 1
      }
      this.onChange()
    }
  }
}
