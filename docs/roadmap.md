# Roadmap

## Phase 1: Foundation
- **1A. Tauri Project Setup**: Initialize Tauri alongside Vite/React.
- **1B. Word Database (Rust)**: Binary indexed format, trie-based search, fast scoring.
- **1C. Grid Engine (Rust)**: 180° symmetry, logic, slots, validation.
- **1D. Grid Validator (Rust)**: Check all NYT rules.
- **1E. Autofill Engine**: CSP + Arc Consistency + MRV algorithm.
- **1F. Frontend Grid**: Canvas+DOM hybrid, keyboard navigation.
- **1G. Core UI Layout**: Resizable panels, toolbar, dark/light theme.
- **1H. File I/O**: Custom JSON, .puz format, PDF export.

## Phase 2: Clue System
- **2A. Clue Database**: Binary indexed historical clue data.
- **2B. Clue Editor UI**: Rich editor, historical suggestions.
- **2C. Word Panel Enhancements**: Filtering, sorting, stats.

## Phase 3: AI Agent System
- **3A. Ollama Integration**: Local LLM HTTP client.
- **3B. Agents**: Clue Writer, Theme, Word Selection, Grid Constructor, Overseer.
- **3D. AI Panel UI**: Chat and wizard interfaces.

## Phase 4: Advanced Features
- Rebus support, circles/shades, stats dashboard, undo/redo, print output.

## Phase 5: Polish & Fine-Tuning
- Train local models (Phi-4/Mistral), fine-tune modelfiles, optimize perf.