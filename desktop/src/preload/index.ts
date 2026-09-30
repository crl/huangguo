import { contextBridge, ipcRenderer } from 'electron'
import type { HuangguoAPI } from '../shared/api'
import type { AppState } from '../shared/types'

const api: HuangguoAPI = {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (callback) => {
    const listener = (_event: unknown, state: AppState): void => callback(state)
    ipcRenderer.on('state', listener)
    return () => {
      ipcRenderer.removeListener('state', listener)
    }
  },
  setShareURL: (value) => ipcRenderer.invoke('share:url', value),
  setSharePassword: (value) => ipcRenderer.invoke('share:password', value),
  setSearchText: (value) => ipcRenderer.invoke('share:search', value),
  setViewMode: (value) => ipcRenderer.invoke('share:viewMode', value),
  setPreferTranscoding: (value) => ipcRenderer.invoke('share:transcoding', value),
  openShare: () => ipcRenderer.invoke('share:open'),
  enterFolder: (id) => ipcRenderer.invoke('share:enter', id),
  goToBreadcrumb: (id) => ipcRenderer.invoke('share:breadcrumb', id),
  toggleSelection: (id) => ipcRenderer.invoke('share:toggle', id),
  selectAllCurrent: () => ipcRenderer.invoke('share:selectAll'),
  selectAllVideos: () => ipcRenderer.invoke('share:selectVideos'),
  downloadSelected: () => ipcRenderer.invoke('share:download'),
  downloadItem: (id) => ipcRenderer.invoke('share:downloadItem', id),
  chooseSaveDirectory: () => ipcRenderer.invoke('share:chooseDir'),
  dismissError: () => ipcRenderer.invoke('share:dismissError'),
  retry: (id) => ipcRenderer.invoke('download:retry', id),
  cancel: (id) => ipcRenderer.invoke('download:cancel', id),
  cancelAll: () => ipcRenderer.invoke('download:cancelAll'),
  clearFinished: () => ipcRenderer.invoke('download:clearFinished'),
  remove: (id) => ipcRenderer.invoke('download:remove', id),
  openSaveDirectory: () => ipcRenderer.invoke('download:openDir'),
  openPath: (filePath) => ipcRenderer.invoke('download:openPath', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('download:showInFolder', filePath),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close')
}

contextBridge.exposeInMainWorld('huangguo', api)
