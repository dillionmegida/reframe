import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  // App data persistence
  loadAppData: () => ipcRenderer.invoke('load-app-data'),
  saveAppData: (data: any) => ipcRenderer.invoke('save-app-data', data),

  // File operations
  openFile: () => ipcRenderer.invoke('open-file'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getVideoMetadata: (path: string) => ipcRenderer.invoke('get-video-metadata', path),

  // Export
  exportVideo: (args: any) => ipcRenderer.invoke('export-video', args),
  // Capture support
  onCaptureRequest: (cb: (payload: any) => void) => {
    ipcRenderer.on('capture:request', (_: any, payload: any) => cb(payload))
  },
  respondCapture: (channel: string, data: any) => ipcRenderer.send(channel, data),
  respondCaptureProgress: (channel: string, data: any) => ipcRenderer.send(channel, data),
  saveTempBlob: (data: Uint8Array, ext: string) => ipcRenderer.invoke('save-temp-blob', data, ext),
  onExportProgress: (cb: (payload: any) => void) => {
    ipcRenderer.on('export:progress', (_: any, payload: any) => cb(payload))
  },
  onExportDone: (cb: (payload: any) => void) => {
    ipcRenderer.on('export:done', (_: any, payload: any) => cb(payload))
  },
  showInFolder: (path: string) => ipcRenderer.invoke('show-in-folder', path),

  // Directory operations
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  ensureDirectory: (path: string) => ipcRenderer.invoke('ensure-directory', path),
  removeDirectory: (path: string) => ipcRenderer.invoke('remove-directory', path),
})
