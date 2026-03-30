interface ElectronAPI {
  loadAppData: () => Promise<import('./types').AppData>
  saveAppData: (data: import('./types').AppData) => Promise<void>
  openFile: () => Promise<string | null>
  getPathForFile: (file: File) => string
  getVideoMetadata: (path: string) => Promise<{
    width: number
    height: number
    duration: number
    fps: number
  }>
  exportVideo: (args: any) => Promise<string | null>
  onExportProgress: (cb: (pct: number) => void) => void
  onExportDone: (cb: (path: string) => void) => void
  showInFolder: (path: string) => void
  selectDirectory: () => Promise<string | null>
  ensureDirectory: (path: string) => Promise<void>
  removeDirectory: (path: string) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export {}
