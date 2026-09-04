import { randomUUID } from 'node:crypto'
import { net } from 'electron'
import { isFolder, isVideo, type ShareItem } from '../../shared/types'
import { sanitizeFileName } from '../../shared/format'
import {
  allProfiles,
  androidProfile,
  androidUserAgent,
  captchaSign,
  type PikPakClientProfile
} from './crypto'

export class PikPakError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PikPakError'
  }
}

export type PendingDownload = {
  fileId: string
  fileName: string
  relativePath: string
  expectedSize: number
}

export type ParsedShareLink = {
  shareId: string
  parentId: string
}

export type OpenedShare = {
  shareId: string
  startParentId: string
  title: string
}

type ShareMediaDTO = {
  link?: { url?: string }
  is_origin?: boolean
  resolution_name?: string
}

type ShareFileDTO = {
  id?: string
  kind?: string
  name?: string
  size?: string | number
  thumbnail_link?: string
  web_content_link?: string
  medias?: ShareMediaDTO[]
}

type ShareAPIResponse = {
  share_status?: string
  share_status_text?: string
  file_info?: ShareFileDTO
  files?: ShareFileDTO[]
  next_page_token?: string
  pass_code_token?: string
  title?: string
  error_code?: number
  error?: string
  error_description?: string
}

type CaptchaInitResponse = {
  captcha_token?: string
  url?: string
  error_code?: number
  error?: string
  error_description?: string
}

function asInt64(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
  }
  return 0
}

const HOSTS = [
  { drive: 'api-drive.mypikpak.net', user: 'user.mypikpak.net' },
  { drive: 'api-drive.mypikpak.com', user: 'user.mypikpak.com' }
]

function isRegionBlocked(response: ShareAPIResponse): boolean {
  const status = (response.share_status ?? '').toUpperCase()
  const text = (response.share_status_text ?? '').toLowerCase()
  return (
    status.includes('REGION') ||
    text.includes('current region') ||
    text.includes('not available in the current region')
  )
}

function regionError(): PikPakError {
  return new PikPakError(
    '当前网络所在地区打不开这个 PikPak 分享（不是电脑没网）。换一个能访问 PikPak 国际节点的网络后再试。'
  )
}

function asItem(file: ShareFileDTO): ShareItem | null {
  if (!file.id || !file.name) return null
  return {
    id: file.id,
    name: file.name,
    kind: file.kind ?? 'drive#file',
    size: asInt64(file.size),
    thumbnailLink: file.thumbnail_link
  }
}

export function parseShareLink(raw: string): ParsedShareLink {
  const trimmed = raw.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new PikPakError('不是合法的 PikPak 分享链接')
  }
  const host = url.host.toLowerCase()
  if (!host.includes('mypikpak')) {
    throw new PikPakError('不是合法的 PikPak 分享链接')
  }
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2 || parts[0] !== 's') {
    throw new PikPakError('不是合法的 PikPak 分享链接')
  }
  return {
    shareId: parts[1],
    parentId: parts.length >= 3 ? parts[2] : ''
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class PikPakShareClient {
  private profile: PikPakClientProfile = androidProfile
  private deviceID = randomUUID().replaceAll('-', '').toLowerCase()
  private captchaToken = ''
  private passCodeToken = ''
  private shareId = ''
  private driveHost = 'api-drive.mypikpak.net'
  private userHost = 'user.mypikpak.net'
  userAgent = ''
  private deviceIDs: Record<string, string>

  constructor(deviceIDs: Record<string, string> = {}) {
    this.deviceIDs = deviceIDs
    this.userAgent = androidUserAgent(this.deviceID, this.profile)
  }

  getDeviceIDs(): Record<string, string> {
    return { ...this.deviceIDs }
  }

  async openShare(shareId: string, password: string, preferredParentId: string): Promise<OpenedShare> {
    this.shareId = shareId
    this.deviceID = this.persistentDeviceID(shareId)

    let lastError: Error = new PikPakError('无法打开分享')
    for (const host of HOSTS) {
      this.driveHost = host.drive
      this.userHost = host.user
      for (const profile of allProfiles) {
        this.applyProfile(profile)
        this.captchaToken = ''
        this.passCodeToken = ''
        try {
          await this.refreshCaptcha('GET:/drive/v1/share')
          const info = await this.getShareInfo(password)
          if (isRegionBlocked(info)) {
            lastError = regionError()
            continue
          }
          const status = info.share_status
          if (status && status !== 'OK' && status !== 'PASS_CODE_EMPTY' && status !== 'PASS_CODE_ERROR') {
            lastError = new PikPakError(info.share_status_text ?? status)
            continue
          }
          if (info.pass_code_token) {
            this.passCodeToken = info.pass_code_token
          }

          const shareTitle = info.title?.trim()
          const roots = info.files ?? []
          let opened: OpenedShare

          if (preferredParentId && (await this.isValidFolder(preferredParentId))) {
            opened = {
              shareId,
              startParentId: preferredParentId,
              title: shareTitle || '分享'
            }
          } else if (roots.length === 1 && roots[0]?.kind === 'drive#folder' && roots[0].id) {
            opened = {
              shareId,
              startParentId: roots[0].id,
              title: roots[0].name || shareTitle || '分享'
            }
          } else {
            opened = {
              shareId,
              startParentId: '',
              title: shareTitle || '分享'
            }
          }

          const probe = await this.getShareDetail(opened.startParentId, '')
          if (isRegionBlocked(probe)) {
            lastError = regionError()
            continue
          }
          return opened
        } catch (error) {
          lastError = error instanceof Error ? error : new PikPakError(String(error))
        }
      }
    }
    throw lastError
  }

  async list(parentId: string): Promise<ShareItem[]> {
    const items: ShareItem[] = []
    let pageToken = ''
    do {
      const response = await this.getShareDetail(parentId, pageToken)
      const status = response.share_status
      if (status && status !== 'OK') {
        if (status === 'PASS_CODE_EMPTY' || status === 'PASS_CODE_ERROR') {
          const info = await this.getShareInfo('')
          this.passCodeToken = info.pass_code_token ?? ''
          if (status === 'PASS_CODE_ERROR') {
            throw new PikPakError(response.share_status_text ?? '分享密码错误')
          }
          continue
        }
        throw isRegionBlocked(response) ? regionError() : new PikPakError(response.share_status_text ?? status)
      }
      for (const file of response.files ?? []) {
        const item = asItem(file)
        if (item) items.push(item)
      }
      pageToken = response.next_page_token ?? ''
    } while (pageToken)
    return items
  }

  async collectVideos(folderId: string, pathPrefix: string): Promise<PendingDownload[]> {
    const listing = await this.list(folderId)
    const result: PendingDownload[] = []
    for (const item of listing) {
      const safeName = sanitizeFileName(item.name)
      if (isFolder(item)) {
        const nestedPath = pathPrefix ? `${pathPrefix}/${safeName}` : safeName
        result.push(...(await this.collectVideos(item.id, nestedPath)))
      } else if (isVideo(item)) {
        result.push({
          fileId: item.id,
          fileName: safeName,
          relativePath: pathPrefix,
          expectedSize: item.size
        })
      }
    }
    return result
  }

  async downloadURL(fileId: string, preferTranscoding: boolean): Promise<string> {
    const response = await this.getFileInfo(fileId)
    const info = response.file_info
    const direct = info?.web_content_link ?? ''
    const medias = info?.medias ?? []

    let candidate = ''
    if (preferTranscoding && medias.length > 1 && medias[1]?.link?.url) {
      candidate = medias[1].link.url
    } else if (direct) {
      candidate = direct
    } else {
      const origin = medias.find((media) => media.is_origin)?.link?.url
      candidate = origin || medias[0]?.link?.url || ''
    }

    if (!candidate) {
      throw new PikPakError('没有拿到下载地址（该文件可能不是可直链视频）')
    }
    return candidate
  }

  private async isValidFolder(parentId: string): Promise<boolean> {
    try {
      await this.getShareDetail(parentId, '')
      return true
    } catch (error) {
      if (error instanceof PikPakError && error.message.includes('接口错误 5')) {
        return false
      }
      return false
    }
  }

  private applyProfile(profile: PikPakClientProfile): void {
    this.profile = profile
    this.userAgent = profile.staticUserAgent ?? androidUserAgent(this.deviceID, profile)
  }

  private async refreshCaptcha(action: string): Promise<void> {
    const timestamp = String(Date.now())
    const sign = captchaSign(this.profile, this.deviceID, timestamp)
    const body = {
      action,
      captcha_token: this.captchaToken,
      client_id: this.profile.clientID,
      device_id: this.deviceID,
      meta: {
        captcha_sign: sign,
        client_version: this.profile.clientVersion,
        package_name: this.profile.packageName,
        timestamp,
        user_id: ''
      },
      redirect_uri: ''
    }
    const response = await this.send(
      `https://${this.userHost}/v1/shield/captcha/init`,
      {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      }
    )
    const decoded = (await response.json()) as CaptchaInitResponse
    if (decoded.error_code && decoded.error_code !== 0) {
      throw new PikPakError(
        `验证初始化失败：${decoded.error_description ?? decoded.error ?? `HTTP ${response.status}`}`
      )
    }
    if (!decoded.captcha_token) {
      throw new PikPakError(`验证初始化失败：${decoded.error_description ?? decoded.url ?? '未返回 captcha_token'}`)
    }
    this.captchaToken = decoded.captcha_token
  }

  private getShareInfo(passCode: string): Promise<ShareAPIResponse> {
    return this.apiGET('/drive/v1/share', {
      share_id: this.shareId,
      pass_code: passCode,
      thumbnail_size: 'SIZE_LARGE',
      limit: '100'
    })
  }

  private getShareDetail(parentId: string, pageToken: string): Promise<ShareAPIResponse> {
    return this.apiGET('/drive/v1/share/detail', {
      parent_id: parentId,
      share_id: this.shareId,
      thumbnail_size: 'SIZE_LARGE',
      with_audit: 'true',
      limit: '100',
      filters: '{"phase":{"eq":"PHASE_TYPE_COMPLETE"},"trashed":{"eq":false}}',
      page_token: pageToken,
      pass_code_token: this.passCodeToken
    })
  }

  private getFileInfo(fileId: string): Promise<ShareAPIResponse> {
    return this.apiGET('/drive/v1/share/file_info', {
      share_id: this.shareId,
      file_id: fileId,
      pass_code_token: this.passCodeToken
    })
  }

  private async apiGET(path: string, query: Record<string, string>): Promise<ShareAPIResponse> {
    const action = `GET:${path}`
    const makeURL = (): string => {
      const url = new URL(`https://${this.driveHost}${path}`)
      for (const [key, value] of Object.entries(query)) {
        if (value || key === 'parent_id' || key === 'page_token' || key === 'pass_code') {
          url.searchParams.set(key, value)
        }
      }
      return url.toString()
    }

    if (!this.captchaToken) {
      await this.refreshCaptcha(action)
    }

    let response = await this.send(makeURL(), { headers: this.headers() })
    let decoded = (await response.json()) as ShareAPIResponse
    if (decoded.error_code === 9) {
      await this.refreshCaptcha(action)
      response = await this.send(makeURL(), { headers: this.headers() })
      decoded = (await response.json()) as ShareAPIResponse
    }
    if (decoded.error_code && decoded.error_code !== 0) {
      throw new PikPakError(
        `PikPak 接口错误 ${decoded.error_code}：${decoded.error_description ?? decoded.error ?? '未知错误'}`
      )
    }
    return decoded
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      'X-Client-ID': this.profile.clientID,
      'X-Device-ID': this.deviceID,
      'X-Captcha-Token': this.captchaToken,
      Accept: 'application/json',
      ...extra
    }
  }

  private async send(url: string, init: RequestInit, retry = 5): Promise<Response> {
    let attempt = 0
    let delay = 400
    let lastError: unknown = new PikPakError('HTTP -1')
    while (attempt <= retry) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 30_000)
        const response = await net.fetch(url, { ...init, signal: controller.signal })
        clearTimeout(timer)
        if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
          lastError = new PikPakError(`HTTP ${response.status}`)
          attempt += 1
          if (attempt > retry) break
          await sleep(delay)
          delay = Math.min(delay * 2, 8000)
          continue
        }
        return response
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = new PikPakError('请求超时')
        } else {
          lastError = error
        }
        attempt += 1
        if (attempt > retry) break
        await sleep(delay)
        delay = Math.min(delay * 2, 8000)
      }
    }
    throw lastError instanceof Error ? lastError : new PikPakError('请求失败')
  }

  private persistentDeviceID(shareId: string): string {
    const existing = this.deviceIDs[shareId]
    if (existing && existing.length === 32) return existing
    const generated = randomUUID().replaceAll('-', '').toLowerCase()
    this.deviceIDs[shareId] = generated
    return generated
  }
}
