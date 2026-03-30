import { useState } from 'react'
import { useAppStore } from '../store/appStore'

export default function BasePathSetup() {
  const setBasePath = useAppStore((s) => s.setBasePath)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelectDirectory = async () => {
    setError(null)
    try {
      const path = await window.electron.selectDirectory()
      if (path) {
        setSelectedPath(path)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to select directory')
    }
  }

  const handleConfirm = async () => {
    if (!selectedPath) return
    setError(null)
    try {
      await window.electron.ensureDirectory(selectedPath)
      setBasePath(selectedPath)
    } catch (err: any) {
      setError(err.message || 'Failed to create directory')
    }
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-background">
      <div className="w-[480px] panel-bg border border-border rounded-xl p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Welcome to Reframe</h1>
        <p className="text-sm text-text-muted mb-6">
          Choose a base folder where all your projects will be stored.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-xs font-medium text-text-muted mb-2">Base Folder</label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 rounded bg-white/5 border border-border text-sm text-text-primary font-mono truncate">
              {selectedPath || 'No folder selected'}
            </div>
            <button
              onClick={handleSelectDirectory}
              className="px-4 py-2 text-xs font-medium rounded bg-white/10 text-text-primary hover:bg-white/15 transition-colors"
            >
              Browse
            </button>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Projects will be organized as: <span className="font-mono">base-folder/project-name/</span>
          </p>
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selectedPath}
          className={`w-full px-4 py-2.5 text-sm font-medium rounded transition-colors ${
            selectedPath
              ? 'bg-accent text-black hover:bg-accent/90'
              : 'bg-white/5 text-text-muted/40 cursor-not-allowed'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
