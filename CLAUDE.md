# CrossForge — Professional Crossword Construction Suite

## Project Vision

A desktop crossword construction application that rivals and surpasses Ingrid, Crosshare, and Crossword Compiler. Produces NYT-publishable puzzles through collaborative human+AI workflow. Multiple specialized local AI agents handle clue writing, grid construction, word selection, and theme development. Everything runs locally — no cloud costs, no API fees.

**Stack**: Tauri (Rust backend) + React/TypeScript (frontend) + Ollama (local AI)

---

## Architecture

```
./
├── src-tauri/                          # Rust backend (Tauri)
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs                     # Tauri entry point
│   │   ├── lib.rs                      # Module exports
│   │   ├── commands/                   # Tauri IPC commands
│   │   │   ├── mod.rs
│   │   │   ├── grid.rs                 # Grid operations
│   │   │   ├── autofill.rs             # Autofill commands
│   │   │   ├── worddb.rs               # Word database queries
│   │   │   ├── fileio.rs               # Save/load/export
│   │   │   └── ai.rs                   # Ollama AI agent commands
│   │   ├── engine/                     # Core crossword engine
│   │   │   ├── mod.rs
│   │   │   ├── grid.rs                 # Grid data structure & validation
│   │   │   ├── autofill.rs             # CSP autofill solver
│   │   │   ├── pattern.rs              # Pattern matching engine
│   │   │   ├── validator.rs            # NYT rule validator
│   │   │   └── scorer.rs               # Fill quality scorer
│   │   ├── worddb/                     # Word database
│   │   │   ├── mod.rs
│   │   │   ├── loader.rs               # Load/parse word lists
│   │   │   ├── index.rs                # Trie + pattern index
│   │   │   └── scorer.rs               # Word quality scoring
│   │   ├── fileio/                     # File format handlers
│   │   │   ├── mod.rs
│   │   │   ├── puz.rs                  # .puz format (Across Lite)
│   │   │   ├── pdf.rs                  # PDF export
│   │   │   ├── json.rs                 # Native JSON format
│   │   │   └── nyt.rs                  # NYT submission format
│   │   └── ai/                         # AI agent system
│   │       ├── mod.rs
│   │       ├── ollama.rs               # Ollama HTTP client
│   │       ├── clue_agent.rs           # Clue writing agent
│   │       ├── grid_agent.rs           # Grid construction agent
│   │       ├── word_agent.rs           # Word selection agent
│   │       ├── theme_agent.rs          # Theme development agent
│   │       └── overseer.rs             # Agent orchestrator
│   ├── data/                           # Bundled data files
│   │   ├── wordlist.bin                # Compiled word database
│   │   └── cluedb.bin                  # Historical clue database
│   └── tauri.conf.json
│
├── src/                                # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── stores/                         # Zustand state management
│   │   ├── puzzleStore.ts              # Grid, cells, clues
│   │   ├── uiStore.ts                  # Selection, mode, panels
│   │   └── aiStore.ts                  # AI agent state
│   ├── components/
│   │   ├── grid/
│   │   │   ├── GridCanvas.tsx          # Canvas-rendered grid
│   │   │   ├── GridOverlay.tsx         # DOM interaction layer
│   │   │   └── GridContainer.tsx       # Layout wrapper
│   │   ├── clues/
│   │   │   ├── CluePanel.tsx           # Clue list + editor
│   │   │   ├── ClueEditor.tsx          # Rich clue editing
│   │   │   └── ClueHistory.tsx         # Past clues for entry
│   │   ├── words/
│   │   │   ├── WordPanel.tsx           # Word suggestions
│   │   │   └── WordFilter.tsx          # Filtering/sorting
│   │   ├── toolbar/
│   │   │   ├── Toolbar.tsx             # Main toolbar
│   │   │   └── StatusBar.tsx           # Bottom status
│   │   ├── ai/
│   │   │   ├── AIPanel.tsx             # AI assistant chat
│   │   │   ├── ThemePanel.tsx          # Theme development
│   │   │   └── AgentStatus.tsx         # Agent monitor
│   │   ├── dialogs/
│   │   │   ├── NewPuzzle.tsx
│   │   │   ├── ExportDialog.tsx
│   │   │   └── SettingsDialog.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       └── PanelLayout.tsx         # Resizable panels
│   ├── hooks/
│   │   ├── useGrid.ts
│   │   ├── useKeyboard.ts
│   │   ├── useAutofill.ts
│   │   └── useTauriCommand.ts
│   ├── types/
│   │   └── crossword.ts
│   ├── utils/
│   │   └── gridHelpers.ts
│   └── styles/
│       ├── globals.css
│       └── themes.css
│
├── scripts/                            # Build & data scripts
│   ├── build-wordlist.py               # Compile word list → binary
│   ├── build-cluedb.py                 # Compile clue DB → binary
│   └── download-data.sh               # Download raw data
│
├── data/                               # Raw data (gitignored)
│   ├── raw/                            # Raw word lists
│   └── clues/                          # Raw clue data
│
├── models/                             # AI model configs (gitignored)
│   ├── Modelfile.clue-writer
│   ├── Modelfile.theme-agent
│   └── training/                       # Fine-tuning scripts
│
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## NYT Crossword Standards (Must Enforce)

| Rule | Detail |
|------|--------|
| Grid sizes | 15×15 (daily), 21×21 (Sunday), odd dimensions only |
| Symmetry | 180° rotational symmetry mandatory |
| Min word length | 3 letters (no 2-letter words ever) |
| All-over interlock | All white cells connected (no isolated sections) |
| Checked letters | Every white cell must be in both an Across and Down word |
| No duplicates | No repeated answers in same grid |
| Word count | ≤78 (themed weekday), ≤72 (themeless Fri/Sat), ≤140 (Sunday) |
| Black squares | ~16% max (~36 in 15×15) |
| Themes | Mon-Thu + Sun: themed; Fri-Sat: themeless |
| Difficulty | Monday (easiest) → Saturday (hardest) |

---

## Phase 1: Foundation — Grid Engine + Word Database + Basic UI

### 1A. Tauri Project Setup
- Initialize Tauri alongside Vite/React
- Configure `tauri.conf.json` (window size, title, permissions)
- Add `@tauri-apps/api` v2 to frontend
- Add Zustand for state management
- Verify `npm run tauri dev` launches

### 1B. Word Database (Rust — `src-tauri/src/worddb/`)

**Data format**: Custom binary — header + entries. Each entry: length byte + word bytes + score byte + flags byte.

**Index structure**: Trie-based, keyed by word length → letter position → letter value.
- Pattern "A_C" → length=3 bucket, pos=0→'A', pos=2→'C', intersect results
- O(1) length lookup, then filtered traversal
- Target: 300K+ entries including multi-word phrases (ITSATRAP, INASENSE, etc.)

**Scoring**: 0-100 scale
- Historical NYT frequency (higher = used more often = better known)
- Freshness bonus (hasn't appeared recently = more interesting)
- Crosswordese penalty (EPEE, ASEA, ALEE = lower scores)
- Multi-word/lively entry bonus

**Build pipeline**: `scripts/build-wordlist.py` compiles raw text lists → binary format.

**Tauri commands**:
- `search_words(pattern, min_score, limit) → Vec<WordEntry>`
- `get_word_info(word) → WordInfo`
- `get_word_count() → usize`

### 1C. Grid Engine (Rust — `src-tauri/src/engine/grid.rs`)

Grid = `Vec<Vec<Cell>>` where `Cell { letter: Option<char>, is_black: bool, number: Option<u16> }`

Operations:
- `toggle_black(row, col, symmetric)` — with 180° rotational symmetry
- `compute_numbers()` — auto-assign clue numbers per NYT convention
- `get_slots()` — extract all word slots (position, length, direction, current letters)
- `set_letter(row, col, char)`
- `validate() → ValidationResult` — check all NYT rules

### 1D. Grid Validator (Rust — `src-tauri/src/engine/validator.rs`)

Checks every NYT rule listed above. Returns structured `ValidationResult`:
```rust
struct ValidationResult {
    is_valid: bool,
    violations: Vec<Violation>,  // each has rule, severity, cell locations
}
```
Uses BFS for connectivity check, iterates slots for length check, etc.

### 1E. Autofill Engine (Rust — `src-tauri/src/engine/autofill.rs`)

**Algorithm: CSP + Arc Consistency + Backtracking + MRV**

```
1. Extract all empty/partial slots from grid
2. For each slot, compute candidate words from DB (matching existing letters)
3. Sort slots by MRV (fewest candidates first)
4. For each slot:
   a. Pick highest-scoring unused candidate
   b. Place word in grid
   c. Propagate constraints to crossing slots (filter their candidates)
   d. If any crossing slot has 0 candidates → backtrack
   e. Arc consistency: verify every remaining candidate in crossing
      slots has at least one valid option in ITS crossings
5. Emit progressive updates to frontend every N placements
6. Track cumulative quality score; prune low-quality branches
```

**Performance**: Fill 15×15 in <1 second. Use `rayon` for parallel candidate scoring.

**Interactive mode** (Ingrid-style):
- User locks/approves specific words → hard constraints
- User rejects a word → exclusion list, re-run from that branch
- Show fill confidence per-slot (% of candidates remaining)

### 1F. Frontend Grid (React — `src/components/grid/`)

**Canvas + DOM hybrid**:
- `GridCanvas.tsx`: HTML5 Canvas rendering
  - Grid lines, black squares, letters, numbers
  - Selected cell highlight (blue), selected word (light blue)
  - Constraint violations (red border)
  - Only redraw dirty cells for 60fps
- `GridOverlay.tsx`: Transparent DOM layer
  - Click → cell selection (map pixel coords to grid coords)
  - Keyboard input
  - Right-click context menu

**Keyboard navigation**:
| Key | Action |
|-----|--------|
| Arrow keys | Move within word / across grid |
| Tab / Shift+Tab | Next / previous word |
| Space | Toggle direction (across ↔ down) |
| Letters | Enter letter, auto-advance cursor |
| Backspace | Delete letter, move back |
| Period (.) | Toggle black square (build mode) |
| Escape | Deselect |

### 1G. Core UI Layout

```
┌──────────────────────────────────────────────────┐
│ Toolbar: [New] [Open] [Save] [Export] │ Size │   │
│ [Build|Fill|Solve] [Symmetry] [Autofill] [Undo]  │
├──────────────────────┬───────────────────────────┤
│                      │  [Clues] [Words] [Info]   │
│                      │                           │
│    Crossword Grid    │  Across:                  │
│    (Canvas)          │  1. ___ clue text         │
│                      │  5. ___ clue text         │
│                      │                           │
│                      │  Down:                    │
│                      │  1. ___ clue text         │
│                      │  2. ___ clue text         │
├──────────────────────┴───────────────────────────┤
│ Status: Build Mode │ 15×15 │ 32 black │ Valid ✓  │
└──────────────────────────────────────────────────┘
```

- Resizable panels (drag handles)
- Collapsible sidebar
- Dark/light theme support

### 1H. File I/O (Rust — `src-tauri/src/fileio/`)

- **JSON** (native): Complete puzzle state (grid + clues + metadata)
- **.puz**: Across Lite format (read/write) — industry standard
- **PDF**: Printable puzzle with grid + clues
- **NYT submission**: Ready for submission

---

## Phase 2: Clue System + Historical Database

### 2A. Clue Database (Rust)
- Bundle historical clue data from open datasets
- Binary indexed format: word → `Vec<{clue_text, source, date, difficulty}>`
- Commands:
  - `get_clues_for_word(word) → Vec<HistoricalClue>`
  - `search_clues(query) → Vec<HistoricalClue>`

### 2B. Clue Editor UI
- Click clue → rich editor with past clues displayed
- One-click reuse/adapt historical clues
- Difficulty indicator (Monday → Saturday scale)
- Character count, style tags

### 2C. Word Panel Enhancements
- NYT frequency count + "last used" date
- Filter by: score range, regex pattern, length
- Sort by: score, frequency, alphabetical, freshness

---

## Phase 3: AI Agent System

### 3A. Ollama Integration (`src-tauri/src/ai/ollama.rs`)
- HTTP client to `localhost:11434`
- Auto-detect Ollama availability
- Model management (list, pull, status)
- Streaming responses for real-time UI
- **Graceful degradation**: all features work without AI; AI enhances them

### 3B. Five Specialized Agents

| Agent | Input | Output | Purpose |
|-------|-------|--------|---------|
| **Clue Writer** | answer + context + difficulty | Ranked clue suggestions | Generate clues in various styles (definition, pun, misdirection) |
| **Theme Agent** | concept/seed words | Theme entries + revealer | Develop coherent themes (add-a-letter, hidden words, rebuses, etc.) |
| **Word Selection** | slot constraints + context | Ranked word choices | Pick optimal words considering theme, difficulty, freshness |
| **Grid Constructor** | theme entries + puzzle type | Black square layout | Design optimal grid patterns for given themes |
| **Overseer** | high-level request | Orchestrated workflow | Coordinate all agents for end-to-end puzzle creation |

### 3C. Full AI Workflow Example
User: "Make me a Wednesday puzzle about space"
1. **Theme agent** → MOONLANDING, LAUNCHPAD, ORBITALDECAY + revealer SPACEDOUT
2. **Grid agent** → grid layout accommodating 4 theme entries
3. **Autofill engine** + **Word agent** → fill remaining grid with quality words
4. **Clue agent** → write all clues at Wednesday difficulty level
5. **Overseer** → validate coherence, suggest improvements

### 3D. AI Panel UI
- Chat interface for free-form AI interaction
- Agent status indicators (active/idle/error)
- "Generate puzzle" wizard (step-by-step AI-assisted)
- Per-clue "suggest clue" button
- Theme brainstorming panel

---

## Phase 4: Advanced Features

### 4A. Rebus Support
- Cells containing multiple letters (e.g., STAR in one square)
- Grid renderer handles multi-letter display
- Autofill engine handles rebus constraints
- .puz export with proper rebus encoding

### 4B. Circle/Shade Cells
- Mark cells with circles (common in themed puzzles)
- Shade cells for visual themes
- All export formats support these markings

### 4C. Puzzle Statistics Dashboard
- Word score distribution histogram
- Scrabble score analysis
- Crosswordese percentage
- Fresh word % (not in NYT last 2 years)
- Comparison to average NYT puzzle stats

### 4D. Undo/Redo System
- Full undo/redo stack for all grid operations
- Branching history with named checkpoints

### 4E. Print-Ready Output
- High-quality PDF (configurable: ±solution, font sizes, grid size)
- NYT submission format compliance

---

## Phase 5: Polish + Model Fine-Tuning

### 5A. Fine-Tune AI Models
- Training data: historical clue/answer pairs, theme patterns
- Fine-tune Phi-4 or Mistral Small via Ollama Modelfiles
- Specialized Modelfile per agent role
- Evaluate against historical NYT clue quality

### 5B. UI Polish
- Keyboard shortcut overlay
- Onboarding tutorial
- System theme detection
- Smooth autofill animations
- Accessibility support

### 5C. Performance Optimization
- Profile autofill for worst-case grids
- Memory-mapped word database for instant load
- Lazy-load DB segments by word length

---

## Word Database Sources

| Source | Size | Notes |
|--------|------|-------|
| Spread the Wordlist (STWL) | ~303K entries | Data-driven, scored 0-60, updated quarterly |
| Peter Broda's Wordlist | ~427K entries | Comprehensive, scored 1-100 |
| Collaborative Word List | ~568K entries | Community-maintained |
| XWord Info | ~252K entries | Every NYT answer + additions by Jeff Chen |

Target: compile a merged, deduplicated list of 400K+ entries with unified scoring.

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Tauri** over Electron | 10x smaller bundle, Rust backend for autofill perf |
| **Zustand** over Redux | Simpler API, excellent TS support, less boilerplate |
| **Canvas grid** over DOM | Better perf for 225+ cells with real-time updates |
| **Binary word DB** over JSON | Faster load, memory-mappable, smaller on disk |
| **Trie index** | O(k) pattern match (k=word length) vs O(n) linear scan |
| **Ollama** for AI | Local, free, fine-tunable, simple HTTP API |
| **Multiple small agents** | Each expert at its task, smaller models = faster inference |

---

## Development Conventions

- **Rust**: Use `thiserror` for error types, `serde` for serialization, `rayon` for parallelism
- **TypeScript**: Strict mode, Zustand stores, functional components only
- **Testing**: Rust unit tests for engine + word DB. Vitest for frontend.
- **Commits**: Conventional commits (`feat:`, `fix:`, `refactor:`, etc.)
- **Branching**: Use short-lived feature branches off `main`; open PRs for review before merging.
