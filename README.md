# Reframe

A macOS desktop app for converting landscape videos to portrait format using a keyframe-based pan/zoom editor.

## Tech Stack

- **Electron** — main process, file I/O, ffmpeg, window management
- **React + TypeScript** — renderer
- **Tailwind CSS** — dark theme styling
- **Zustand** — editor state with undo/redo
- **fluent-ffmpeg + ffmpeg-static** — video export
- **better-sqlite3** — project persistence (future)

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run package
```

## Keyboard Shortcuts

| Key | Action |
|---|---|
| Space | Play / Pause |
| ← | Step back 1 frame |
| → | Step forward 1 frame |
| Shift+← | Step back 5 seconds |
| Shift+→ | Step forward 5 seconds |
| K | Add keyframe at playhead |
| Backspace | Delete selected keyframe |
| C | Clone selected keyframe to -1s |
| Escape | Deselect / close inspector |
| Cmd+Z | Undo |
| Cmd+Shift+Z | Redo |
| Cmd+E | Export |
