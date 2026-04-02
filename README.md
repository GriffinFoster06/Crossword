# CrossForge

A professional crossword construction desktop app built with Tauri (Rust) + React/TypeScript. Designed to produce NYT-publishable puzzles through a collaborative human + AI workflow, with all AI running locally via Ollama — no cloud costs, no API fees.

---

## Features

- **Grid Editor** — Canvas-rendered 15×15 and 21×21 grids with 180° rotational symmetry, auto-numbering, and real-time NYT rule validation
- **Autofill Engine** — CSP + arc consistency + backtracking solver fills grids in under 1 second using a 300K+ word database
- **Word Database** — Compiled from top crossword word lists (STWL, Peter Broda, CWL) with quality scoring and crosswordese penalties
- **AI Agent System** — Five specialized local AI agents via Ollama:
  - **Clue Writer** — generates clues at selectable difficulty (Mon–Sat)
  - **Theme Agent** — develops theme entries and revealers
  - **Word Selection** — picks optimal fill words given context
  - **Grid Constructor** — designs layouts around theme entries
  - **Overseer** — orchestrates end-to-end puzzle creation
- **File Formats** — Save/load JSON (native), `.puz` (Across Lite), PDF export, NYT submission format
- **Clue Panel** — Edit clues with historical clue suggestions pulled from the bundled clue database
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

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri v2](https://tauri.app) |
| Backend | Rust |
| Frontend | React + TypeScript + Vite |
| State | Zustand |
| AI | [Ollama](https://ollama.com) (local) |

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) 18+
- [Ollama](https://ollama.com) (optional, for AI features)

### Install & Run

```bash
npm install
npm run tauri dev
```

### Build Word Database

```bash
# Download raw word lists
bash scripts/download-data.sh

# Compile to binary format
python3 scripts/build-wordlist.py
```

### Install AI Models

```bash
bash scripts/install-models.sh
```

---

## Project Structure

```
src-tauri/src/
├── engine/       # Grid, autofill CSP solver, validator, scorer
├── worddb/       # Word database loader, trie index, scorer
├── formats/      # .puz, PDF, JSON, NYT format handlers
├── commands/     # Tauri IPC commands
└── ai/           # Ollama client + 5 specialized agents

src/
├── components/   # Grid canvas, clue panel, word panel, AI panel, toolbar
├── stores/       # Zustand stores (puzzle, UI, AI)
└── hooks/        # useKeyboard, useAutofill, useTauriCommand
```

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

---

## License

MIT
