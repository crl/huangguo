import type { AppState } from './types'

export type HuangguoAPI = {
  getState: () => Promise<AppState | null>
  onState: (callback: (state: AppState) => void) => () => void
  setShareURL: (value: string) => Promise<void>
  setSharePassword: (value: string) => Promise<void>
  setSearchText: (value: string) => Promise<void>
  setPreferTranscoding: (value: boolean) => Promise<void>
  openShare: () => Promise<void>
  enterFolder: (id: string) => Promise<void>
  goToBreadcrumb: (id: string) => Promise<void>
  toggleSelection: (id: string) => Promise<void>
  selectAllCurrent: () => Promise<void>
  selectAllVideos: () => Promise<void>
  downloadSelected: () => Promise<void>
  chooseSaveDirectory: () => Promise<void>
  dismissError: () => Promise<void>
  retry: (id: string) => Promise<void>
  cancel: (id: string) => Promise<void>
  cancelAll: () => Promise<void>
  clearFinished: () => Promise<void>
  openSaveDirectory: () => Promise<void>
  openPath: (filePath: string) => Promise<void>
  showInFolder: (filePath: string) => Promise<void>
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
}
