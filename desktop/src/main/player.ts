import { BrowserWindow, net, protocol, app } from 'electron'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
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
const bufferedSeconds = new Map<string, number>()
const localBuffers = new Map<string, { path: string; written: number; done: boolean; contentType: string }>()
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
    #controls { position: absolute; bottom: 0; left: 0; right: 0; padding: 10px 16px 14px; background: linear-gradient(transparent, #000e); }
    #timeline { color: white; font-size: 13px; margin-left: auto; text-align: right; white-space: nowrap; }
    #buffer-track { position: relative; height: 18px; display: flex; align-items: center; }
    #buffer-track::before { content: ''; position: absolute; width: 100%; height: 6px; background: #ffffff45; border-radius: 4px; }
    #buffer-fill, #played-fill { position: absolute; height: 6px; width: 0; border-radius: 4px; pointer-events: none; }
    #buffer-fill { background: #ffffff80; }
    #played-fill { background: #ff789e; }
    #seek { position: relative; width: 100%; height: 18px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
    #seek::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #fff; }
    #seek:disabled { cursor: default; opacity: .5; }
    #buttons { display: flex; align-items: center; gap: 12px; margin-top: 4px; color: white; }
    #buttons button { display: grid; place-items: center; width: 32px; height: 32px; background: transparent; border: 0; color: white; cursor: pointer; padding: 4px; }
    #buttons button:hover { color: #ffd6e0; }
    #buttons svg { width: 20px; height: 20px; fill: currentColor; }
    #volume-wrap { position: relative; display: flex; align-items: center; }
    #volume { width: 72px; accent-color: white; }
    #volume[hidden] { display: none; }
    #fullscreen { flex-shrink: 0; }
    #msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; font-size: 14px; }
  </style>
</head>
<body>
  <video id="v" autoplay playsinline src="${src}"></video>
  <div id="controls">
  <div id="buttons"><button id="play" type="button" aria-label="播放"></button><span id="clock">00:00 / --:--</span><div id="volume-wrap"><button id="mute" type="button" aria-label="调节音量" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm12-1v8c1.8-.6 3-2.2 3-4s-1.2-3.4-3-4zm0-4v2c2.9.8 5 3.2 5 6s-2.1 5.2-5 6v2c4-1 7-4.2 7-8s-3-7-7-8z"/></svg></button><input id="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="音量" hidden></div><span id="timeline" role="status">正在获取缓冲信息…</span><button id="fullscreen" type="button" aria-label="全屏"><svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg></button></div>
  <div id="buffer-track"><div id="buffer-fill"></div><div id="played-fill"></div><input id="seek" type="range" min="0" max="1000" value="0" aria-label="播放进度" disabled></div>
  </div>
  <div id="msg">正在缓冲…</div>
  <script>
    const video = document.getElementById('v')
    const msg = document.getElementById('msg')
    const timeline = document.getElementById('timeline')
    const bufferFill = document.getElementById('buffer-fill')
    const playedFill = document.getElementById('played-fill')
    const seek = document.getElementById('seek')
    const play = document.getElementById('play')
    const mute = document.getElementById('mute')
    const volume = document.getElementById('volume')
    play.addEventListener('click', () => { if (video.paused) void video.play().catch(() => {}); else video.pause() })
    video.addEventListener('click', () => { if (video.paused) void video.play().catch(() => {}); else video.pause() })
    const updatePlay = () => { play.setAttribute('aria-label', video.paused ? '播放' : '暂停'); play.innerHTML = video.paused ? '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>' }
    updatePlay()
    video.addEventListener('play', updatePlay)
    video.addEventListener('pause', updatePlay)
    mute.addEventListener('click', () => { volume.hidden = !volume.hidden; mute.setAttribute('aria-expanded', String(!volume.hidden)) })
    volume.addEventListener('input', () => { video.volume = Number(volume.value); video.muted = false; mute.style.opacity = video.volume === 0 ? '0.45' : '1' })
    document.addEventListener('click', (event) => { if (!document.getElementById('volume-wrap').contains(event.target)) { volume.hidden = true; mute.setAttribute('aria-expanded', 'false') } })
    document.getElementById('fullscreen').addEventListener('click', () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen() })
    let seeking = false
    let pendingTarget = null
    let seekGeneration = 0
    let totalDuration = 0
    let diskBuffered = 0
    let diskBytes = 0
    const clock = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
      const n = Math.floor(seconds)
      return (n >= 3600 ? Math.floor(n / 3600) + ':' : '') + String(Math.floor(n / 60) % 60).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')
    }
    const progressDuration = () => {
      const mediaDuration = Number.isFinite(video.duration) ? video.duration : 0
      return Math.max(totalDuration, diskBuffered, mediaDuration)
    }
    const updateTimeline = () => {
      const buffered = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0
      const duration = progressDuration()
      bufferFill.style.width = Number.isFinite(duration) && duration > 0 ? Math.min(100, Math.max(0, diskBuffered / duration * 100)) + '%' : '0%'
      const displayTime = pendingTarget === null ? video.currentTime : pendingTarget
      const fraction = Number.isFinite(duration) && duration > 0 ? Math.min(1, Math.max(0, displayTime / duration)) : 0
      playedFill.style.width = (seeking ? Number(seek.value) / 10 : fraction * 100) + '%'
      seek.disabled = !(Number.isFinite(duration) && duration > 0)
      if (!seeking) seek.value = String(Math.round(fraction * 1000))
      timeline.textContent = '后台已缓冲到 ' + clock(diskBuffered) + (diskBytes ? '（' + (diskBytes / 1048576).toFixed(1) + ' MB）' : '')
      const knownTotal = totalDuration > 0 && totalDuration >= diskBuffered ? clock(totalDuration) : '总时长未知'
      document.getElementById('clock').textContent = clock(displayTime) + ' / ' + knownTotal
    }
    seek.addEventListener('input', () => { seeking = true; playedFill.style.width = (Number(seek.value) / 10) + '%' })
    seek.addEventListener('change', () => {
      const duration = progressDuration()
      if (Number.isFinite(duration) && duration > 0) {
        const target = Number(seek.value) / 1000 * duration
        const generation = ++seekGeneration
        pendingTarget = target
        if (diskBytes > 0 && target <= diskBuffered) {
          const resume = !video.paused
          video.addEventListener('loadedmetadata', () => {
            if (generation !== seekGeneration) return
            video.currentTime = target
            if (resume) void video.play().catch(() => {})
          }, { once: true })
          video.src = '/buffer' + location.search + '&snapshot=' + diskBytes
          video.load()
        } else video.currentTime = target
      }
      seeking = false
      updateTimeline()
    })
    video.addEventListener('seeked', () => { pendingTarget = null; updateTimeline() })
    video.addEventListener('error', () => { pendingTarget = null; updateTimeline() })
    let infoPending = false
    const refreshInfo = async () => {
      if (infoPending) return
      infoPending = true
      try {
        const info = await fetch('/info' + location.search).then(r => r.json())
        totalDuration = info.duration || 0
        diskBuffered = info.bufferedSeconds || 0
        diskBytes = info.bytes || 0
        updateTimeline()
      } catch { updateTimeline() }
      finally { infoPending = false }
    }
    refreshInfo()
    const infoTimer = setInterval(refreshInfo, 1000)
    window.addEventListener('pagehide', () => clearInterval(infoTimer))
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
  extension: string, complete: boolean, finished?: Promise<boolean>, fileId?: string
): Promise<ReadableStream<Uint8Array>> {
  await mkdir(stream.saveDirectory, { recursive: true })
  const stem = sanitizeFileName(stream.fileName).replace(/\.[^.]+$/, '')
  const destination = join(stream.saveDirectory, `${stem}.播放缓冲-${randomUUID().slice(0, 8)}.${extension}`)
  const partial = `${destination.slice(0, -(extension.length + 1))}.part.${extension}`
  const file = await open(partial, 'wx')
  const saved = { path: partial, written: 0, done: false, contentType: extension === 'mp4' ? 'video/mp4' : stream.contentType }
  if (fileId) localBuffers.set(fileId, saved)
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
        saved.written = written
        notify()
      }
      if (complete && (!finished || await finished)) {
        await rename(partial, destination)
        saved.path = destination
      }
    } catch (error) {
      failure = error
      await reader.cancel().catch(() => undefined)
    } finally {
      await file.close()
      done = true
      saved.done = true
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
  const local = localBuffers.get(fileId)
  const range = request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/)
  if (local && local.done && range && local.written > 0 && !local.path.includes('.part.')) {
    const start = Number(range[1])
    const end = Math.min(range[2] ? Number(range[2]) : local.written - 1, local.written - 1)
    const total = String(local.written)
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } })
    const input = request.method === 'HEAD' ? null : createReadStream(local.path, { start, end })
    return new Response(input ? Readable.toWeb(input) as ReadableStream<Uint8Array> : null, {
      status: 206,
      headers: { 'content-type': local.contentType, 'accept-ranges': 'bytes',
        'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${total}` }
    })
  }
  const stream = await resolveStream(fileId, refresh)
  const signal = playbackControllers.get(fileId)?.signal ?? request.signal
  const response = await net.fetch(stream.remote, {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: forwardHeaders(request, stream.userAgent),
    signal
  })
  console.info('播放器上游响应', { status: response.status, range: request.headers.get('range'), contentType: response.headers.get('content-type'), contentRange: response.headers.get('content-range') })
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
    console.info('播放器数据头', { signature: bytes ? Buffer.from(bytes.subarray(0, 16)).toString('hex') : 'empty', transportStream: Boolean(transportStream) })
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
        join(process.resourcesPath, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
        join(app.getAppPath(), 'build', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
        join(homedir(), '.local/bin/ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'
      ].find(existsSync)
      const converter = spawn(binary ?? 'ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:3', '-stats_period', '1',
        '-fflags', '+genpts+discardcorrupt', '-i', 'pipe:0',
        '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p', '-g', '48',
        '-af', 'aresample=async=1:first_pts=0',
        '-c:a', 'aac', '-profile:a', 'aac_low', '-ar', '48000', '-ac', '2', '-b:a', '128k',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-frag_duration', '1000000', '-f', 'mp4', 'pipe:1'
      ], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] })
      let progressText = ''
      converter.stdio[3]?.on('data', (chunk: Buffer) => {
        progressText += chunk.toString()
        const lines = progressText.split('\n')
        progressText = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('out_time_us=')) {
            const seconds = Number(line.slice(12)) / 1000000
            if (Number.isFinite(seconds) && seconds >= 0) bufferedSeconds.set(fileId, seconds)
          }
        }
      })
      const converted = new Promise<boolean>((resolve) => {
        converter.once('close', (code) => resolve(code === 0))
        converter.once('error', () => resolve(false))
      })
      converter.stderr.on('data', (data) => console.error('视频转换:', data.toString()))
      const stop = (): void => { converter.kill(); void full.body?.cancel().catch(() => undefined) }
      signal.addEventListener('abort', stop, { once: true })
      converter.once('close', () => signal.removeEventListener('abort', stop))
      void pipeline(Readable.fromWeb(full.body as never), converter.stdin).catch(() => converter.kill())
      return new Response(await saveBuffer(Readable.toWeb(converter.stdout) as ReadableStream<Uint8Array>, stream, 'mp4', true, converted, fileId), {
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
      const fileId = url.searchParams.get('file') ?? ''
      const stream = await resolveStream(fileId)
      const local = localBuffers.get(fileId)
      return Response.json({ duration: stream.duration, bufferedSeconds: bufferedSeconds.get(fileId) ?? 0, bytes: local?.written ?? 0 })
    } catch {
      return Response.json({ duration: 0 })
    }
  }
  if (url.pathname === '/buffer') {
    const local = localBuffers.get(url.searchParams.get('file') ?? '')
    const requestedSize = Number(url.searchParams.get('snapshot'))
    if (!local || !Number.isSafeInteger(requestedSize) || requestedSize <= 0 || requestedSize > local.written) return new Response('缓冲尚未就绪', { status: 404 })
    const match = request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/)
    const start = match ? Number(match[1]) : 0
    const end = Math.min(match?.[2] ? Number(match[2]) : requestedSize - 1, requestedSize - 1)
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${requestedSize}` } })
    const headers: Record<string, string> = { 'content-type': local.contentType, 'accept-ranges': 'bytes', 'content-length': String(end - start + 1), 'cache-control': 'no-store' }
    if (match) headers['content-range'] = `bytes ${start}-${end}/${requestedSize}`
    const input = request.method === 'HEAD' ? null : createReadStream(local.path, { start, end })
    return new Response(input ? Readable.toWeb(input) as ReadableStream<Uint8Array> : null, { status: match ? 206 : 200, headers })
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
    localBuffers.delete(fileId)
    bufferedSeconds.delete(fileId)
  })
  void player.loadURL(`${playerOrigin}/page?token=${accessToken}&file=${encodeURIComponent(fileId)}`)
  player.setTitle(title)
}
