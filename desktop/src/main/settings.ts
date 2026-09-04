import { homedir } from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { app } from 'electron'

export const DEFAULT_SHARE_URL =
  'https://mypikpak.com/s/VP0D6es97vgNquS_avxUCiOIo2/ABEOncidTpkZZZFFWu0AE3mmo2_VOw'

export type PersistedSettings = {
  shareURL: string
  sharePassword: string
  saveDirectory: string
  preferTranscoding: boolean
  deviceIDs: Record<string, string>
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
      preferTranscoding: Boolean(parsed.preferTranscoding),
      deviceIDs: parsed.deviceIDs ?? {}
    }
  } catch {
    return {
      shareURL: DEFAULT_SHARE_URL,
      sharePassword: '',
      saveDirectory: defaultSaveDirectory(),
      preferTranscoding: false,
      deviceIDs: {}
    }
  }
}

export async function saveSettings(settings: PersistedSettings): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}
