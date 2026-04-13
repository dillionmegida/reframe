# Reframe

A macOS desktop app for converting landscape videos to portrait format using a keyframe-based pan/zoom editor. Perfect for repurposing content for social media platforms like Instagram Stories, TikTok, and YouTube Shorts.

[Watch Demo Video Here](https://youtu.be/fZkW333Fob0)

## Features

- 🎬 **Keyframe-based editing** — Precise control over pan and zoom animations
- 🎯 **Visual preview** — Real-time preview of your portrait video

## Prerequisites

Before you begin, ensure you have the following installed on your macOS system:

### 1. Node.js and npm (required)

**Check if installed:**

```bash
node --version
npm --version
```

**If not installed:**

- Download and install from [nodejs.org](https://nodejs.org/) (LTS version recommended)
- Or use Homebrew:

  ```bash
  brew install node
  ```

### 2. Xcode Command Line Tools (optional, only if native build errors)

Most installs succeed without this. If you hit native module errors during `npm install` (e.g., `better-sqlite3`), install:

```bash
xcode-select --install
```

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/dillionmegida/reframe.git
cd reframe
```

### 2. Install dependencies

```bash
npm install
```

**Note:** This will automatically install:

- Electron and all development tools
- FFmpeg binaries (via `@ffmpeg-installer/ffmpeg`)
- All required Node.js packages

### 3. Set up pre-commit hook (optional but recommended)

Use the one-step helper (installs deps if missing, then installs the hook):

```bash
npm run precommit-setup
```

Or run the shell script directly if you already installed dependencies:

```bash
bash setup-pre-commit.sh
```

This installs a Git hook that automatically runs tests before commits when relevant files are changed.

## Development

### Running the app in development mode

```bash
npm run dev
```

This will:

- Start the Electron app with hot-reload enabled
- Open the app window automatically
- Watch for file changes and reload

### Development workflow

1. Make changes to your code
2. The app will automatically reload
3. Test your changes in the running app

### Pre-commit tests

A Git pre-commit hook now runs `npm test` (Vitest) automatically **only when relevant files are staged** (app code, tests, or build tooling). Commits will be blocked if tests fail.

- No tests for doc-only changes like README updates.
- To skip temporarily (e.g., WIP or docs-only): set `SKIP_PRE_COMMIT_TESTS=1` for that commit

  ```bash
  SKIP_PRE_COMMIT_TESTS=1 git commit -m "docs: update"
  ```

## Building for Production

### Build the app

```bash
npm run build
```

This compiles the TypeScript code and prepares the app for packaging.

### Package the app

```bash
npm run package
```

This creates a distributable `.dmg` file for macOS in the `dist` folder. The build supports both:

- **Apple Silicon** (arm64) — M1, M2, M3 Macs
- **Intel** (x64) — Older Macs

The packaged app will be located at:

```text
dist/Reframe-1.0.0-arm64.dmg  # For Apple Silicon
dist/Reframe-1.0.0-x64.dmg    # For Intel Macs
```

## Usage

### Basic workflow

1. **Import video** — Click "Import Video" or drag and drop a landscape video
2. **Add keyframes** — Press `K` to add keyframes at different timestamps
3. **Adjust framing** — Pan and zoom the preview to frame your subject
4. **Preview** — Use the playhead to scrub through and preview your edits

## Tech Stack

- **Electron** — Cross-platform desktop app framework
- **React + TypeScript** — UI components with type safety
- **styled-components** — UI styling (no Tailwind in use)
- **Zustand** — Lightweight state management with undo/redo
- **fluent-ffmpeg** — FFmpeg wrapper for video processing
- **@ffmpeg-installer/ffmpeg** + **ffprobe-static** — Bundled FFmpeg/FFprobe binaries
- **Vite + electron-vite** — Build tooling for renderer and main

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:

- Open an [issue](https://github.com/dillionmegida/reframe/issues)
- Check existing issues for solutions

---

Made with ❤️ for content creators
