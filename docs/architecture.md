# Architecture

## Directory Structure
```text
./
├── src-tauri/                          # Rust backend (Tauri)
│   ├── src/
│   │   ├── commands/                   # Tauri IPC commands
│   │   ├── engine/                     # Core crossword engine (grid, autofill, etc.)
│   │   ├── worddb/                     # Word database
│   │   ├── fileio/                     # Save/load/export
│   │   └── ai/                         # Ollama AI agent commands
├── src/                                # React frontend
│   ├── components/                     # UI components (grid, clues, words, ai)
│   ├── stores/                         # Zustand state management
│   └── hooks/                          # Custom React hooks
├── scripts/                            # Build & data scripts
├── data/                               # Raw data (gitignored)
└── models/                             # AI model configs (gitignored)
```

## Key Technical Decisions
| Decision | Rationale |
|----------|-----------|
| **Tauri** over Electron | 10x smaller bundle, Rust backend for autofill perf |
| **Zustand** over Redux | Simpler API, excellent TS support, less boilerplate |
| **Canvas grid** over DOM | Better perf for 225+ cells with real-time updates |
| **Binary word DB** | Faster load, memory-mappable, smaller on disk |
| **Trie index** | O(k) pattern match vs O(n) linear scan |
| **Ollama** for AI | Local, free, fine-tunable, simple HTTP API |

## AI Architecture
Five specialized agents (Clue Writer, Theme Agent, Word Selection, Grid Constructor, Overseer) coordinate via Ollama to assist the user.