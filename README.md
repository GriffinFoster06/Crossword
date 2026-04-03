# CrossForge

A professional crossword construction desktop app built with Tauri (Rust) + React/TypeScript. Produces NYT-publishable puzzles through a collaborative human + AI workflow. All AI runs locally — no cloud costs, no API fees, no internet required after first launch.

---

## Building from Source

There are no pre-built releases yet. You must build CrossForge yourself.

### Prerequisites

Install these before anything else:

1. **rustup** (Rust toolchain manager) — [https://rustup.rs](https://rustup.rs)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   ```
   > **Important:** Use rustup, not Homebrew's Rust. The project requires Rust 1.85+ and `rust-toolchain.toml` will enforce this automatically when rustup is used.

2. **Node.js 18+** — [https://nodejs.org](https://nodejs.org)

3. **Xcode Command Line Tools** (macOS only)
   ```bash
   xcode-select --install
   ```

---

### Run in Development

```bash
git clone https://github.com/griffinfoster/crossword.git
cd crossword
npm install
npm run tauri dev
```

The first run compiles all Rust dependencies — this takes several minutes. Subsequent runs are fast.

---

### Build a Distributable

```bash
npm install
npm run tauri build
```

Output locations after build completes:

| Platform | Path | File |
|----------|------|------|
| macOS (Apple Silicon) | `src-tauri/target/release/bundle/dmg/` | `CrossForge_x.x.x_aarch64.dmg` |
| macOS (Intel) | `src-tauri/target/release/bundle/dmg/` | `CrossForge_x.x.x_x64.dmg` |
| Windows | `src-tauri/target/release/bundle/nsis/` | `CrossForge_x.x.x_x64-setup.exe` |
| Linux | `src-tauri/target/release/bundle/appimage/` | `crossforge_x.x.x_amd64.AppImage` |

**macOS:** Open the DMG, drag CrossForge to Applications, then launch it.

> If macOS says "CrossForge can't be opened because Apple cannot check it for malicious software," right-click the app → Open → Open.

**Windows:** Run the installer and click through the SmartScreen prompt (More info → Run anyway).

**Linux:**
```bash
chmod +x crossforge_x.x.x_amd64.AppImage
./crossforge_x.x.x_amd64.AppImage
```

---

### Build Word Database (optional)

The word database powers autofill. To build it from raw word lists:

```bash
bash scripts/download-data.sh
python3 scripts/build-wordlist.py --output resources/wordlist.bin
```

---

## Troubleshooting

**`sh: tauri: command not found`**
Run `npm install` first. The Tauri CLI is installed locally as a dev dependency.

**`feature 'edition2024' is required` / Rust version error**
Your system Rust is too old. Install rustup from [https://rustup.rs](https://rustup.rs) and make sure `~/.cargo/bin` comes before `/opt/homebrew/bin` in your PATH:
```bash
export PATH="$HOME/.cargo/bin:$PATH"
```
Add that line to your `~/.zshrc` to make it permanent.

**`failed to download` crate errors**
Network issue fetching Rust dependencies. Re-run `npm run tauri dev` — it will resume from where it left off.

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
