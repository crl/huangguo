import { homedir } from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { app } from 'electron'
import type { ViewMode } from '../shared/types'

export const DEFAULT_SHARE_URL =
  'https://mypikpak.com/s/VP3KH3E7ppAzZZ4DNMYrc-ioo2/AAAAEIoPCqtcutnuNj8op4Ylo2_VP3'

export type PersistedSettings = {
  shareURL: string
  sharePassword: string
  saveDirectory: string
  viewMode: ViewMode
  preferTranscoding: boolean
  deviceIDs: Record<string, string>
}

export function asViewMode(value: unknown): ViewMode {
  return value === 'icons' ? 'icons' : 'list'
}

export function defaultSaveDirectory(): string {
  return path.join(homedir(), 'Videos', 'PikPak')
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<PersistedSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>
    return {
      shareURL: parsed.shareURL || DEFAULT_SHARE_URL,
      sharePassword: parsed.sharePassword ?? '',
      saveDirectory: parsed.saveDirectory || defaultSaveDirectory(),
      viewMode: asViewMode(parsed.viewMode),
      preferTranscoding: Boolean(parsed.preferTranscoding),
      deviceIDs: parsed.deviceIDs ?? {}
    }
  } catch {
    return {
      shareURL: DEFAULT_SHARE_URL,
      sharePassword: '',
      saveDirectory: defaultSaveDirectory(),
      viewMode: 'list',
      preferTranscoding: false,
      deviceIDs: {}
    }
  }
}

export async function saveSettings(settings: PersistedSettings): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}
