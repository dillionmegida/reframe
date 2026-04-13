import { app, BrowserWindow, ipcMain, dialog, shell, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { exportVideo, cancelExport, cancelExportBySliceId } from './export'
import { randomUUID } from 'crypto'
import os from 'os'

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
let dataDirInitialized = false

async function getDataPath(): Promise<string> {
  const dir = path.join(os.homedir(), '.reframe')
  if (!dataDirInitialized) {
    try {
      await fs.promises.access(dir)
    } catch {
      await fs.promises.mkdir(dir, { recursive: true })
    }
    dataDirInitialized = true
  }
  return path.join(dir, 'data.json')
}

async function loadAppData(): Promise<any> {
  const p = await getDataPath()
  try {
    await fs.promises.access(p)
    const data = JSON.parse(await fs.promises.readFile(p, 'utf-8'))
    // Ensure basePath exists for legacy data
    if (!data.hasOwnProperty('basePath')) {
      data.basePath = null
    }
    return data
  } catch {
    return { basePath: null, projects: [], videos: [] }
  }
}

async function saveAppData(data: any): Promise<void> {
  const p = await getDataPath()
  await fs.promises.writeFile(p, JSON.stringify(data, null, 2), 'utf-8')
}

function createWindow() {
  const isHeadless = process.env.HEADLESS_E2E === '1'
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: screenW,
    height: screenH,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0e0e0e',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: !isHeadless,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  if (isHeadless) {
    mainWindow.once('ready-to-show', () => {
      if (mainWindow) mainWindow.hide()
    })
  }

  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:8000')
    // mainWindow.webContents.openDevTools();
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
  return await loadAppData()
})

ipcMain.handle('save-app-data', async (_event, data: any) => {
  await saveAppData(data)
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

// Helper to format time for filenames (e.g., 50.5s -> "50s" or 125.3s -> "2m5s")
function formatTimeForFilename(seconds: number): string {
  const roundedSeconds = Math.round(seconds)
  if (roundedSeconds < 60) {
    return `${roundedSeconds}s`
  }
  const mins = Math.floor(roundedSeconds / 60)
  const secs = roundedSeconds % 60
  return secs > 0 ? `${mins}m${secs}s` : `${mins}m`
}

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
    const isQuickExport = slices && slices.length === 1
    
    if (isQuickExport) {
      // Quick export: only remove matching timestamp files
      await fs.promises.mkdir(exportsDir, { recursive: true })
      
      const slice = slices[0]
      const startTime = formatTimeForFilename(slice.start)
      const endTime = formatTimeForFilename(slice.end)
      const timestampPattern = `${startTime}-to-${endTime}`
      
      // Find and remove existing files with matching timestamps
      try {
        await fs.promises.access(exportsDir)
        const files = await fs.promises.readdir(exportsDir)
        for (const file of files) {
          if (file.includes(timestampPattern)) {
            const filePath = path.join(exportsDir, file)
            await fs.promises.unlink(filePath)
          }
        }
      } catch {
        // Directory doesn't exist yet
      }
    } else {
      // Full export: clear entire exports directory
      try {
        await fs.promises.access(exportsDir)
        await fs.promises.rm(exportsDir, { recursive: true, force: true })
      } catch {
        // Directory doesn't exist
      }
      await fs.promises.mkdir(exportsDir, { recursive: true })
    }
    
    // Generate filename with timestamps
    const baseFileName = path.join(exportsDir, sanitizeName(videoId))
    
    const paths = await exportVideo(args, baseFileName + '.mp4', mainWindow)
    return paths.join(', ')
  } catch (err: any) {
    throw new Error(err.message || 'Export failed')
  }
})

ipcMain.handle('cancel-export', async (_event, { jobId, sliceId }: { jobId?: string; sliceId?: string }) => {
  if (jobId) {
    return await cancelExport(jobId)
  }
  if (sliceId) {
    return await cancelExportBySliceId(sliceId)
  }
  return false
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
  try {
    await fs.promises.access(dirPath)
  } catch {
    await fs.promises.mkdir(dirPath, { recursive: true })
  }
})

ipcMain.handle('rename-file', async (_event, { oldPath, newPath }: { oldPath: string; newPath: string }) => {
  try {
    // Check if destination already exists
    try {
      await fs.promises.access(newPath)
      throw new Error('A file with that name already exists')
    } catch (err: any) {
      if (err.message === 'A file with that name already exists') throw err
      // File doesn't exist, proceed with rename
    }
    await fs.promises.rename(oldPath, newPath)
    return { success: true, newPath }
  } catch (err: any) {
    throw new Error(err.message || 'Failed to rename file')
  }
})

ipcMain.handle('remove-directory', async (_event, dirPath: string) => {
  try {
    await fs.promises.access(dirPath)
    await fs.promises.rm(dirPath, { recursive: true, force: true })
  } catch {
    // Directory doesn't exist or already removed
  }
})

// Save blob data to a temp file (renderer can't write to disk)
ipcMain.handle('save-temp-blob', async (_event, data: Uint8Array, ext: string) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reframe-cap-'))
  const filePath = path.join(dir, `${randomUUID()}.${ext.replace(/^\./, '')}`)
  await fs.promises.writeFile(filePath, Buffer.from(data))
  return filePath
})

// Frame-by-frame capture: create a temp directory to hold JPEG frames
ipcMain.handle('create-frame-dir', async () => {
  const dir = path.join(os.tmpdir(), `reframe-frames-${randomUUID()}`)
  await fs.promises.mkdir(dir, { recursive: true })
  return dir
})

// Frame-by-frame capture: save a single JPEG frame into an existing frame dir
ipcMain.handle('save-frame', async (_event, data: Uint8Array, dir: string, index: number) => {
  const name = `frame_${String(index).padStart(6, '0')}.jpg`
  const filePath = path.join(dir, name)
  await fs.promises.writeFile(filePath, Buffer.from(data))
  return filePath
})

export function requestPreviewCapture(payload: any): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!mainWindow) return reject(new Error('No window'))
    const replyChannel = `capture:reply:${randomUUID()}`
    payload.replyChannel = replyChannel

    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      reject(new Error('Capture timed out'))
    }, 60_000)

    ipcMain.once(replyChannel, (_ev, data) => {
      clearTimeout(timeout)
      if (data?.error) return reject(new Error(data.error))
      if (!data?.path) return reject(new Error('No capture path'))
      resolve(data.path)
    })

    mainWindow.webContents.send('capture:request', payload)
  })
}
