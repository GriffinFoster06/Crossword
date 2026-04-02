import { create } from 'zustand';
import type { Direction, Mode, ValidationResult, AutofillProgress } from '../types/crossword';

interface UiState {
  // Selection
  selectedRow: number;
  selectedCol: number;
  direction: Direction;

  // Mode
  mode: Mode;

  // Panel visibility
  showWordPanel: boolean;
  showCluePanel: boolean;
  showAiPanel: boolean;
  showValidation: boolean;

  // Autofill state
  isAutofilling: boolean;
  autofillProgress: AutofillProgress | null;

  // Validation
  validation: ValidationResult | null;

  // AI
  ollamaAvailable: boolean;

  // Word database
  wordCount: number;

  // Theme
  darkMode: boolean;

  // Heat map (fill quality overlay)
  showHeatMap: boolean;

  // File state
  currentFilePath: string | null;
  isDirty: boolean;

  // Dialog visibility
  showNewPuzzleDialog: boolean;
  showExportDialog: boolean;
  showSettingsDialog: boolean;
  showInstallModelsDialog: boolean;

  // Context menu
  contextMenu: { x: number; y: number; row: number; col: number } | null;

  // Rebus mode
  rebusMode: boolean;

  // Ghost word preview (hovered word in WordPanel)
  ghostWord: string | null;

  // Keyboard shortcut overlay
  showShortcutOverlay: boolean;

  // Stats panel
  showStatsPanel: boolean;

  // Actions
  selectCell: (row: number, col: number) => void;
  setDirection: (dir: Direction) => void;
  toggleDirection: () => void;
  setMode: (mode: Mode) => void;
  setShowWordPanel: (show: boolean) => void;
  setShowCluePanel: (show: boolean) => void;
  setShowAiPanel: (show: boolean) => void;
  setShowValidation: (show: boolean) => void;
  setAutofilling: (val: boolean) => void;
  setAutofillProgress: (progress: AutofillProgress | null) => void;
  setValidation: (v: ValidationResult | null) => void;
  setOllamaAvailable: (val: boolean) => void;
  setWordCount: (count: number) => void;
  setDarkMode: (val: boolean) => void;
  setShowHeatMap: (val: boolean) => void;
  setCurrentFilePath: (path: string | null) => void;
  setIsDirty: (val: boolean) => void;
  setShowNewPuzzleDialog: (show: boolean) => void;
  setShowExportDialog: (show: boolean) => void;
  setShowSettingsDialog: (show: boolean) => void;
  setShowInstallModelsDialog: (show: boolean) => void;
  setContextMenu: (menu: { x: number; y: number; row: number; col: number } | null) => void;
  setRebusMode: (val: boolean) => void;
  setGhostWord: (word: string | null) => void;
  setShowShortcutOverlay: (val: boolean) => void;
  setShowStatsPanel: (val: boolean) => void;
  moveSelection: (dRow: number, dCol: number, gridSize: number) => void;
  advanceCursor: (gridSize: number, cells: { is_black: boolean }[][]) => void;
  retreatCursor: (gridSize: number, cells: { is_black: boolean }[][]) => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  selectedRow: 0,
  selectedCol: 0,
  direction: 'Across',
  mode: 'build',
  showWordPanel: true,
  showCluePanel: true,
  showAiPanel: false,
  showValidation: true,
  isAutofilling: false,
  autofillProgress: null,
  validation: null,
  ollamaAvailable: false,
  wordCount: 0,
  darkMode: true,
  showHeatMap: false,
  currentFilePath: null,
  isDirty: false,
  showNewPuzzleDialog: false,
  showExportDialog: false,
  showSettingsDialog: false,
  showInstallModelsDialog: false,
  contextMenu: null,
  rebusMode: false,
  ghostWord: null,
  showShortcutOverlay: false,
  showStatsPanel: false,

  selectCell: (row, col) => set({ selectedRow: row, selectedCol: col }),
  setDirection: (dir) => set({ direction: dir }),
  toggleDirection: () =>
    set((s) => ({ direction: s.direction === 'Across' ? 'Down' : 'Across' })),
  setMode: (mode) => set({ mode }),
  setShowWordPanel: (show) => set({ showWordPanel: show }),
  setShowCluePanel: (show) => set({ showCluePanel: show }),
  setShowAiPanel: (show) => set({ showAiPanel: show }),
  setShowValidation: (show) => set({ showValidation: show }),
  setAutofilling: (val) => set({ isAutofilling: val }),
  setAutofillProgress: (progress) => set({ autofillProgress: progress }),
  setValidation: (v) => set({ validation: v }),
  setOllamaAvailable: (val) => set({ ollamaAvailable: val }),
  setWordCount: (count) => set({ wordCount: count }),
  setDarkMode: (val) => set({ darkMode: val }),
  setShowHeatMap: (val) => set({ showHeatMap: val }),
  setCurrentFilePath: (path) => set({ currentFilePath: path }),
  setIsDirty: (val) => set({ isDirty: val }),
  setShowNewPuzzleDialog: (show) => set({ showNewPuzzleDialog: show }),
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowSettingsDialog: (show) => set({ showSettingsDialog: show }),
  setShowInstallModelsDialog: (show) => set({ showInstallModelsDialog: show }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  setRebusMode: (val) => set({ rebusMode: val }),
  setGhostWord: (word) => set({ ghostWord: word }),
  setShowShortcutOverlay: (val) => set({ showShortcutOverlay: val }),
  setShowStatsPanel: (val) => set({ showStatsPanel: val }),

  moveSelection: (dRow, dCol, gridSize) => {
    const { selectedRow, selectedCol } = get();
    const nr = Math.max(0, Math.min(gridSize - 1, selectedRow + dRow));
    const nc = Math.max(0, Math.min(gridSize - 1, selectedCol + dCol));
    set({ selectedRow: nr, selectedCol: nc });
  },

  advanceCursor: (gridSize, cells) => {
    const { selectedRow, selectedCol, direction } = get();
    if (direction === 'Across') {
      let nc = selectedCol + 1;
      while (nc < gridSize && cells[selectedRow][nc].is_black) nc++;
      if (nc < gridSize) set({ selectedCol: nc });
    } else {
      let nr = selectedRow + 1;
      while (nr < gridSize && cells[nr][selectedCol].is_black) nr++;
      if (nr < gridSize) set({ selectedRow: nr });
    }
  },

  retreatCursor: (gridSize, cells) => {
    const { selectedRow, selectedCol, direction } = get();
    if (direction === 'Across') {
      let nc = selectedCol - 1;
      while (nc >= 0 && cells[selectedRow][nc].is_black) nc--;
      if (nc >= 0) set({ selectedCol: nc });
    } else {
      let nr = selectedRow - 1;
      while (nr >= 0 && cells[nr][selectedCol].is_black) nr--;
      if (nr >= 0) set({ selectedRow: nr });
    }
  },
}));
