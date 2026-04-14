import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  // App data persistence
  loadAppData: () => ipcRenderer.invoke('load-app-data'),
  saveAppData: (data: any) => ipcRenderer.invoke('save-app-data', data),

  // File operations
  openFile: () => ipcRenderer.invoke('open-file'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getVideoMetadata: (path: string) => ipcRenderer.invoke('get-video-metadata', path),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-file', { oldPath, newPath }),

  // Export
  exportVideo: (args: any) => ipcRenderer.invoke('export-video', args),
  cancelExport: (jobId: string, sliceId?: string) => ipcRenderer.invoke('cancel-export', { jobId, sliceId }),
  // Capture support
  onCaptureRequest: (cb: (payload: any) => void) => {
    ipcRenderer.on('capture:request', (_: any, payload: any) => cb(payload))
  },
  respondCapture: (channel: string, data: any) => ipcRenderer.send(channel, data),
  respondCaptureProgress: (channel: string, data: any) => ipcRenderer.send(channel, data),
  saveTempBlob: (data: Uint8Array, ext: string) => ipcRenderer.invoke('save-temp-blob', data, ext),
  createFrameDir: () => ipcRenderer.invoke('create-frame-dir'),
  saveFrame: (data: Uint8Array, dir: string, index: number) => ipcRenderer.invoke('save-frame', data, dir, index),
  onExportProgress: (cb: (payload: any) => void) => {
    const listener = (_: any, payload: any) => cb(payload)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },
  onExportDone: (cb: (payload: any) => void) => {
    const listener = (_: any, payload: any) => cb(payload)
    ipcRenderer.on('export:done', listener)
    return () => ipcRenderer.removeListener('export:done', listener)
  },
  showInFolder: (path: string) => ipcRenderer.invoke('show-in-folder', path),

  // Directory operations
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  ensureDirectory: (path: string) => ipcRenderer.invoke('ensure-directory', path),
  removeDirectory: (path: string) => ipcRenderer.invoke('remove-directory', path),
})
