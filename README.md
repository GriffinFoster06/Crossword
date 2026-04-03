# CrossForge

A professional crossword construction desktop app built with Tauri (Rust) + React/TypeScript. Produces NYT-publishable puzzles through a collaborative human + AI workflow. All AI runs locally — no cloud costs, no API fees, no internet required after first launch.

---

## Installation

### macOS

**Apple Silicon (M1/M2/M3/M4)**

1. Download `CrossForge_x.x.x_aarch64.dmg` from the [latest release](../../releases/latest)
2. Open the DMG and drag **CrossForge** into your Applications folder
3. Launch CrossForge from Applications
4. On first launch, the setup wizard downloads the AI model (~2 GB) and configures 5 AI agents automatically — this takes 5–15 minutes depending on your connection speed
5. After setup completes, CrossForge is fully operational with no further steps

**Intel Mac**

1. Download `CrossForge_x.x.x_x64.dmg` from the [latest release](../../releases/latest)
2. Follow the same steps as above

> If macOS says "CrossForge can't be opened because Apple cannot check it for malicious software," right-click the app → Open → Open.

---

### Windows

1. Download `CrossForge_x.x.x_x64-setup.exe` from the [latest release](../../releases/latest)
2. Run the installer (click through the Windows Defender SmartScreen prompt if it appears — click **More info → Run anyway**)
3. Launch CrossForge from the Start Menu or Desktop shortcut
4. On first launch, the setup wizard downloads the AI model (~2 GB) and configures 5 AI agents automatically — this takes 5–15 minutes depending on your connection speed
5. After setup completes, CrossForge is fully operational with no further steps

---

### Linux

1. Download `crossforge_x.x.x_amd64.AppImage` from the [latest release](../../releases/latest)
2. Make it executable: `chmod +x crossforge_x.x.x_amd64.AppImage`
3. Run it: `./crossforge_x.x.x_amd64.AppImage`
4. The first-launch setup wizard handles everything automatically

---

### System Requirements

| | Minimum | Recommended |
|---|---|---|
| RAM | 8 GB | 16 GB |
| Disk | 5 GB free | 10 GB free |
| Internet | Required for first launch only | — |

**No other software required.** The Ollama AI engine and all AI models are bundled or downloaded automatically.

---

## Features

- **Grid Editor** — Canvas-rendered 15×15 and 21×21 grids with 180° rotational symmetry, auto-numbering, and real-time NYT rule validation
- **Autofill Engine** — CSP + arc consistency + backtracking solver fills grids in under 1 second using a 300K+ word database
- **Word Database** — Compiled from top crossword word lists (STWL, Peter Broda, CWL) with quality scoring and crosswordese penalties
- **AI Agent System** — Five specialized local AI agents:
  - **Clue Writer** — generates clues at selectable difficulty (Mon–Sat)
  - **Theme Agent** — develops theme entries and revealers
  - **Word Selection** — picks optimal fill words given context
  - **Grid Constructor** — designs layouts around theme entries
  - **Overseer** — orchestrates end-to-end puzzle creation
- **File Formats** — Save/load JSON (native), `.puz` (Across Lite), PDF export, NYT submission format
- **Clue Panel** — Edit clues with historical clue suggestions from the bundled clue database
- **Stats Dashboard** — Word score distribution, crosswordese %, freshness analysis
- **Undo/Redo** — Full history with branching

---

## NYT Standards Enforced

| Rule | Detail |
|------|--------|
| Grid sizes | 15×15 (daily), 21×21 (Sunday) |
| Symmetry | 180° rotational symmetry |
| Min word length | 3 letters |
| Connectivity | All white cells interlocked |
| Checked letters | Every cell in both Across and Down word |
| Word count | ≤78 themed weekday, ≤72 themeless, ≤140 Sunday |
| Black squares | ~16% max |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Arrow keys | Move cursor |
| Tab / Shift+Tab | Next / previous word |
| Space | Toggle direction (Across ↔ Down) |
| Letters | Enter letter and advance |
| Backspace | Delete letter and move back |
| `.` | Toggle black square |
| Escape | Deselect |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+N` | New puzzle |

---

## Building from Source

### Prerequisites

- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) 18+
- Python 3.10+

### Run in development

```bash
# Place the Ollama binary for your platform in src-tauri/binaries/
# macOS Apple Silicon:
curl -L https://github.com/ollama/ollama/releases/latest/download/ollama-darwin \
  -o src-tauri/binaries/ollama-aarch64-apple-darwin
chmod +x src-tauri/binaries/ollama-aarch64-apple-darwin

npm install
npm run tauri dev
```

### Build word database

```bash
bash scripts/download-data.sh
python3 scripts/build-wordlist.py --output resources/wordlist.bin
```

### Build distributable

```bash
npm run tauri build
```

The installer for your platform will be in `src-tauri/target/release/bundle/`.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri v2](https://tauri.app) |
| Backend | Rust |
| Frontend | React + TypeScript + Vite |
| State | Zustand |
| AI engine | [Ollama](https://ollama.com) (bundled, local) |
| AI model | phi3:mini (~2.3 GB) |

---

## License

MIT
