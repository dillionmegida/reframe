import { app, BrowserWindow, ipcMain, dialog, shell, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { exportVideo } from './export'

let mainWindow: BrowserWindow | null = null

function parseFps(rate: string | undefined): number {
  if (!rate) return 30
  const parts = rate.split('/')
  if (parts.length === 2) {
    const num = parseFloat(parts[0])
    const den = parseFloat(parts[1])
    if (den > 0) return num / den
  }
  const parsed = parseFloat(rate)
  return isNaN(parsed) ? 30 : parsed
}

function getFFprobePath(): string {
  const ffprobe = require('ffprobe-static')
  return ffprobe.path
}

function getFfmpegPath(): string {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
  return ffmpegInstaller.path
}

// Centralized data store in ~/.reframe/data.json
function getDataPath(): string {
  const os = require('os')
  const dir = path.join(os.homedir(), '.reframe')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'data.json')
}

function loadAppData(): any {
  const p = getDataPath()
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      // Ensure basePath exists for legacy data
      if (!data.hasOwnProperty('basePath')) {
        data.basePath = null
      }
      return data
    } catch { /* corrupt */ }
  }
  return { basePath: null, projects: [], videos: [] }
}

function saveAppData(data: any): void {
  fs.writeFileSync(getDataPath(), JSON.stringify(data, null, 2), 'utf-8')
}

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: screenW,
    height: screenH,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0e0e0e',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173')
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── IPC: App Data ──────────────────────────────────────────

ipcMain.handle('load-app-data', async () => {
  return loadAppData()
})

ipcMain.handle('save-app-data', async (_event, data: any) => {
  saveAppData(data)
})

// ── IPC: File operations ───────────────────────────────────

ipcMain.handle('open-file', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mts', 'm2ts'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('get-video-metadata', async (_event, filePath: string) => {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFFprobePath()
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]
    execFile(ffprobePath, args, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      try {
        const data = JSON.parse(stdout)
        const videoStream = data.streams?.find((s: any) => s.codec_type === 'video')
        if (!videoStream) {
          reject(new Error('No video stream found'))
          return
        }
        resolve({
          width: videoStream.width,
          height: videoStream.height,
          duration: parseFloat(data.format?.duration || videoStream.duration || '0'),
          fps: parseFps(videoStream.r_frame_rate),
        })
      } catch (e) {
        reject(e)
      }
    })
  })
})

ipcMain.handle('export-video', async (_event, args) => {
  if (!mainWindow) return null
  
  const { basePath, projectName, videoId, slices } = args
  
  // If no basePath, fall back to old behavior (ask user)
  if (!basePath) {
    const sliceCount = slices?.length || 0
    const defaultName = sliceCount > 1 ? 'reframe-export.mp4' : 'reframe-export.mp4'
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    })
    if (result.canceled || !result.filePath) return null
    try {
      const paths = await exportVideo(args, result.filePath, mainWindow)
      return paths.join(', ')
    } catch (err: any) {
      throw new Error(err.message || 'Export failed')
    }
  }
  
  // Auto-generate export path: basePath/projectName/exports/
  const sanitizeName = (name: string) => name.replace(/[^a-zA-Z0-9-_]/g, '-')
  const projectDir = path.join(basePath, sanitizeName(projectName))
  const exportsDir = path.join(projectDir, 'exports')
  
  try {
    // Clear exports directory before export
    if (fs.existsSync(exportsDir)) {
      fs.rmSync(exportsDir, { recursive: true, force: true })
    }
    fs.mkdirSync(exportsDir, { recursive: true })
    
    // Generate filename: video-id_slice-1.mp4, video-id_slice-2.mp4, etc.
    const baseFileName = path.join(exportsDir, sanitizeName(videoId))
    
    const paths = await exportVideo(args, baseFileName + '.mp4', mainWindow)
    return paths.join(', ')
  } catch (err: any) {
    throw new Error(err.message || 'Export failed')
  }
})

ipcMain.handle('show-in-folder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('ensure-directory', async (_event, dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
})

ipcMain.handle('remove-directory', async (_event, dirPath: string) => {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true })
  }
})
