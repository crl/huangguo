import { BrowserWindow, net, protocol, app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { mkdir, open, rename } from 'node:fs/promises'
import { sanitizeFileName } from '../shared/format'
import { homedir } from 'node:os'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { PikPakError } from './pikpak/client'

type ResolvedStream = {
  remote: string
  duration: number
  userAgent: string
  contentType: string
  saveDirectory: string
  fileName: string
}

type Resolver = (fileId: string) => Promise<ResolvedStream>

const cache = new Map<string, ResolvedStream>()
const inflight = new Map<string, Promise<ResolvedStream>>()
const windows = new Map<string, BrowserWindow>()
const playbackControllers = new Map<string, AbortController>()

let resolver: Resolver | null = null
let playerOrigin = ''
const accessToken = randomUUID()

export function videoContentType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'webm') return 'video/webm'
  if (ext === 'mov' || ext === 'm4v') return 'video/mp4'
  if (ext === 'mkv') return 'video/x-matroska'
  return 'video/mp4'
}

export function registerStreamScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'stream',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
        bypassCSP: true
      }
    }
  ])
}

export async function attachStreamProtocol(resolve: Resolver): Promise<void> {
  resolver = resolve
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url ?? '/', playerOrigin)
      if (url.searchParams.get('token') !== accessToken) {
        outgoing.writeHead(403).end()
        return
      }
      const controller = new AbortController()
      outgoing.on('close', () => controller.abort())
      const headers = new Headers()
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
      const result = await handleStream(new Request(url, {
        method: incoming.method, headers, signal: controller.signal
      }))
      outgoing.writeHead(result.status, Object.fromEntries(result.headers))
      if (result.body) await pipeline(Readable.fromWeb(result.body as never), outgoing)
      else outgoing.end()
    } catch (error) {
      if (!outgoing.headersSent) outgoing.writeHead(502)
      outgoing.end()
      console.error('播放器请求失败', error)
    }
  })
  await new Promise<void>((resolveReady, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address !== 'string') playerOrigin = `http://127.0.0.1:${address.port}`
      resolveReady()
    })
  })
  server.unref()
}

function playerPage(fileId: string): string {
  const src = `${playerOrigin}/media?token=${accessToken}&file=${encodeURIComponent(fileId)}`
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #14080c; color: #ffd6e0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    video { width: 100%; height: 100%; background: #000; }
    #timeline { position: absolute; left: 16px; bottom: 62px; background: #000b; border-radius: 6px; padding: 6px 10px; font-size: 13px; pointer-events: none; }
    #msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; font-size: 14px; }
  </style>
</head>
<body>
  <video id="v" controls autoplay playsinline src="${src}"></video>
  <div id="timeline" role="status">正在获取总时长…</div>
  <div id="msg">正在缓冲…</div>
  <script>
    const video = document.getElementById('v')
    const msg = document.getElementById('msg')
    const timeline = document.getElementById('timeline')
    let totalDuration = 0
    const clock = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
      const n = Math.floor(seconds)
      return (n >= 3600 ? Math.floor(n / 3600) + ':' : '') + String(Math.floor(n / 60) % 60).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')
    }
    const updateTimeline = () => {
      const buffered = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0
      timeline.textContent = clock(video.currentTime) + ' / ' + (totalDuration > 0 ? clock(totalDuration) : '总时长未知') + '　已缓冲到 ' + clock(buffered)
    }
    fetch('/info' + location.search).then(r => r.json()).then(info => {
      totalDuration = info.duration || 0
      updateTimeline()
    }).catch(updateTimeline)
    for (const event of ['timeupdate', 'progress', 'loadedmetadata', 'durationchange']) video.addEventListener(event, updateTimeline)

    video.addEventListener('playing', () => { msg.style.display = 'none' })
    video.addEventListener('waiting', () => { msg.style.display = 'flex'; msg.textContent = '正在缓冲…' })
    video.addEventListener('error', () => { msg.style.display = 'flex'; msg.textContent = '播放失败：' + (video.error?.message || '视频格式不支持或网络请求失败') })
  </script>
</body>
</html>`
}

async function resolveStream(fileId: string, refresh = false): Promise<ResolvedStream> {
  if (!refresh) {
    const cached = cache.get(fileId)
    if (cached) return cached
    const pending = inflight.get(fileId)
    if (pending) return pending
  } else {
    cache.delete(fileId)
  }
  if (!resolver) throw new PikPakError('播放器还没准备好')
  const job = resolver(fileId)
    .then((value) => {
      cache.set(fileId, value)
      return value
    })
    .finally(() => {
      if (inflight.get(fileId) === job) inflight.delete(fileId)
    })
  inflight.set(fileId, job)
  return job
}

function forwardHeaders(request: Request, userAgent: string): Headers {
  const headers = new Headers()
  headers.set('User-Agent', userAgent)
  headers.set('Referer', 'https://mypikpak.com/')
  headers.set('Accept', '*/*')
  const range = request.headers.get('range')
  if (range) headers.set('Range', range)
  return headers
}

function mediaHeaders(response: Response, contentType: string): Headers {
  const headers = new Headers()
  headers.set('content-type', contentType)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'no-store')
  const length = response.headers.get('content-length')
  const contentRange = response.headers.get('content-range')
  if (length) headers.set('content-length', length)
  if (contentRange) headers.set('content-range', contentRange)
  return headers
}

// Each response owns a separate file: seek requests and concurrent playback never overwrite downloads.
async function saveBuffer(
  body: ReadableStream<Uint8Array>, stream: ResolvedStream,
  extension: string, complete: boolean, finished?: Promise<boolean>
): Promise<ReadableStream<Uint8Array>> {
  await mkdir(stream.saveDirectory, { recursive: true })
  const stem = sanitizeFileName(stream.fileName).replace(/\.[^.]+$/, '')
  const destination = join(stream.saveDirectory, `${stem}.播放缓冲-${randomUUID().slice(0, 8)}.${extension}`)
  const partial = `${destination.slice(0, -(extension.length + 1))}.part.${extension}`
  const file = await open(partial, 'wx')
  const reader = body.getReader()
  const playbackFile = await open(partial, 'r')
  let written = 0
  let position = 0
  let done = false
  let failure: unknown
  const waiters = new Set<() => void>()
  const notify = (): void => { for (const wake of waiters) wake(); waiters.clear() }
  // Read upstream continuously into disk, regardless of the browser's playback speed.
  void (async () => {
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        let offset = 0
        while (offset < next.value.length) {
          const result = await file.write(next.value, offset, next.value.length - offset)
          if (!result.bytesWritten) throw new Error('无法写入播放缓冲')
          offset += result.bytesWritten
        }
        written += next.value.length
        notify()
      }
      if (complete && (!finished || await finished)) await rename(partial, destination)
    } catch (error) {
      failure = error
      await reader.cancel().catch(() => undefined)
    } finally {
      await file.close()
      done = true
      notify()
    }
  })()
  let cancelled = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (position >= written && !done && !cancelled) {
          await new Promise<void>((resolve) => waiters.add(resolve))
        }
        if (cancelled) return
        if (position < written) {
          const chunk = Buffer.alloc(Math.min(256 * 1024, written - position))
          const result = await playbackFile.read(chunk, 0, chunk.length, position)
          position += result.bytesRead
          controller.enqueue(chunk.subarray(0, result.bytesRead))
        } else {
          await playbackFile.close()
          if (failure) controller.error(failure)
          else controller.close()
        }
      } catch (error) {
        await playbackFile.close().catch(() => undefined)
        controller.error(error)
      }
    },
    async cancel() {
      cancelled = true
      notify()
      await playbackFile.close().catch(() => undefined)
    }
  })
}

async function fetchMedia(fileId: string, request: Request, refresh = false): Promise<Response> {
  const stream = await resolveStream(fileId, refresh)
  const signal = playbackControllers.get(fileId)?.signal ?? request.signal
  const response = await net.fetch(stream.remote, {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: forwardHeaders(request, stream.userAgent),
    signal
  })
  if (!refresh && (response.status === 401 || response.status === 403)) {
    await response.body?.cancel().catch(() => undefined)
    return fetchMedia(fileId, request, true)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new PikPakError(`视频服务器返回 HTTP ${response.status}`)
  }
  if (response.body && request.method !== 'HEAD') {
    const reader = response.body.getReader()
    const first = await reader.read()
    const bytes = first.value
    const transportStream = bytes && bytes[0] === 0x47 && (bytes.length < 189 || bytes[188] === 0x47)
    const body = new ReadableStream<Uint8Array>({
      start(controller) { if (bytes) controller.enqueue(bytes) },
      async pull(controller) {
        const next = await reader.read()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      },
      cancel() { return reader.cancel() }
    })
    if (transportStream) {
      // A range probe is only used to identify the container. Feed the converter from byte zero.
      await body.cancel()
      const full = await net.fetch(stream.remote, {
        headers: forwardHeaders(new Request(request.url), stream.userAgent),
        signal
      })
      if (!full.ok || !full.body) throw new PikPakError(`视频服务器返回 HTTP ${full.status}`)
      const binary = [
        join(process.resourcesPath, 'ffmpeg'),
        join(app.getAppPath(), 'build', 'ffmpeg'),
        join(homedir(), '.local/bin/ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'
      ].find(existsSync)
      if (!binary) throw new PikPakError('缺少视频转换工具 FFmpeg')
      const converter = spawn(binary, [
        '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
        '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4', 'pipe:1'
      ], { stdio: ['pipe', 'pipe', 'pipe'] })
      const converted = new Promise<boolean>((resolve) => {
        converter.once('close', (code) => resolve(code === 0))
        converter.once('error', () => resolve(false))
      })
      converter.stderr.on('data', (data) => console.error('视频转换:', data.toString()))
      const stop = (): void => { converter.kill(); void full.body?.cancel().catch(() => undefined) }
      signal.addEventListener('abort', stop, { once: true })
      converter.once('close', () => signal.removeEventListener('abort', stop))
      void pipeline(Readable.fromWeb(full.body as never), converter.stdin).catch(() => converter.kill())
      return new Response(await saveBuffer(Readable.toWeb(converter.stdout) as ReadableStream<Uint8Array>, stream, 'mp4', true, converted), {
        headers: { 'content-type': 'video/mp4', 'cache-control': 'no-store' }
      })
    }
    const range = response.headers.get('content-range')
    const bounds = range?.match(/^bytes 0-(\d+)\/(\d+)$/)
    const entire = response.status === 200 || !!(bounds && Number(bounds[1]) + 1 === Number(bounds[2]))
    return new Response(await saveBuffer(body, stream, sanitizeFileName(stream.fileName).split('.').pop() || 'mp4', entire), {
      status: response.status, headers: mediaHeaders(response, stream.contentType)
    })
  }
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: mediaHeaders(response, stream.contentType)
  })
}

async function handleStream(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/page') {
    const fileId = url.searchParams.get('file') ?? ''
    return new Response(playerPage(fileId), {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  }
  if (url.pathname === '/info') {
    try {
      const stream = await resolveStream(url.searchParams.get('file') ?? '')
      return Response.json({ duration: stream.duration })
    } catch {
      return Response.json({ duration: 0 })
    }
  }
  if (url.pathname === '/media') {
    const fileId = url.searchParams.get('file') ?? ''
    if (!fileId) return new Response('缺少文件', { status: 400 })
    try {
      return await fetchMedia(fileId, request)
    } catch (error) {
      const message = error instanceof Error ? error.message : '播放失败'
      return new Response(message, {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      })
    }
  }
  return new Response('找不到', { status: 404 })
}

export function openStreamPlayer(fileId: string, title: string): void {
  const existing = windows.get(fileId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }
  playbackControllers.set(fileId, new AbortController())
  const player = new BrowserWindow({
    width: 1100,
    height: 640,
    minWidth: 640,
    minHeight: 360,
    title,
    backgroundColor: '#14080c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  windows.set(fileId, player)
  player.on('ready-to-show', () => player.show())
  player.on('closed', () => {
    playbackControllers.get(fileId)?.abort()
    playbackControllers.delete(fileId)
    if (windows.get(fileId) === player) windows.delete(fileId)
    cache.delete(fileId)
  })
  void player.loadURL(`${playerOrigin}/page?token=${accessToken}&file=${encodeURIComponent(fileId)}`)
  player.setTitle(title)
}
