import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Cell, GridState, PuzzleClues, PuzzleMetadata, ThemeData, Direction } from '../types/crossword';

function createEmptyCell(): Cell {
  return {
    letter: null,
    is_black: false,
    number: null,
    rebus: null,
    is_circled: false,
    is_shaded: false,
    is_locked: false,
  };
}

function createEmptyGrid(size: number): Cell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => createEmptyCell())
  );
}

function computeNumbers(cells: Cell[][], size: number) {
  let n = 1;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      cells[row][col].number = null;
      if (cells[row][col].is_black) continue;

      const startsAcross =
        !cells[row][col].is_black &&
        (col === 0 || cells[row][col - 1].is_black) &&
        col + 1 < size &&
        !cells[row][col + 1].is_black;

      const startsDown =
        !cells[row][col].is_black &&
        (row === 0 || cells[row - 1][col].is_black) &&
        row + 1 < size &&
        !cells[row + 1][col].is_black;

      if (startsAcross || startsDown) {
        cells[row][col].number = n++;
      }
    }
  }
}

export interface WordSlotInfo {
  number: number;
  direction: Direction;
  row: number;
  col: number;
  length: number;
  pattern: string;
  cells: [number, number][];
}

function getSlots(cells: Cell[][], size: number): WordSlotInfo[] {
  const slots: WordSlotInfo[] = [];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (cells[row][col].is_black) continue;
      const num = cells[row][col].number;

      // Across
      const startsAcross =
        (col === 0 || cells[row][col - 1].is_black) &&
        col + 1 < size && !cells[row][col + 1].is_black;
      if (startsAcross && num != null) {
        let len = 0;
        let pattern = '';
        const slotCells: [number, number][] = [];
        let c = col;
        while (c < size && !cells[row][c].is_black) {
          pattern += cells[row][c].letter || '_';
          slotCells.push([row, c]);
          len++;
          c++;
        }
        if (len >= 3) {
          slots.push({ number: num, direction: 'Across', row, col, length: len, pattern, cells: slotCells });
        }
      }

      // Down
      const startsDown =
        (row === 0 || cells[row - 1][col].is_black) &&
        row + 1 < size && !cells[row + 1][col].is_black;
      if (startsDown && num != null) {
        let len = 0;
        let pattern = '';
        const slotCells: [number, number][] = [];
        let r = row;
        while (r < size && !cells[r][col].is_black) {
          pattern += cells[r][col].letter || '_';
          slotCells.push([r, col]);
          len++;
          r++;
        }
        if (len >= 3) {
          slots.push({ number: num, direction: 'Down', row, col, length: len, pattern, cells: slotCells });
        }
      }
    }
  }
  return slots;
}

interface PuzzleState {
  // Grid
  size: number;
  cells: Cell[][];
  slots: WordSlotInfo[];

  // Metadata
  metadata: PuzzleMetadata;
  clues: PuzzleClues;
  theme: ThemeData | null;

  // Symmetry
  symmetric: boolean;

  // Actions
  newPuzzle: (size: number) => void;
  setCell: (row: number, col: number, letter: string | null) => void;
  setCellRebus: (row: number, col: number, value: string) => void;
  toggleBlack: (row: number, col: number) => void;
  toggleCircle: (row: number, col: number) => void;
  toggleShade: (row: number, col: number) => void;
  toggleLock: (row: number, col: number) => void;
  setSymmetric: (val: boolean) => void;
  setClue: (number: number, direction: Direction, text: string) => void;
  setClueThemeFlag: (number: number, direction: Direction, isTheme: boolean) => void;
  setMetadata: (meta: Partial<PuzzleMetadata>) => void;
  setTheme: (theme: ThemeData | null) => void;
  applyAutofill: (gridLetters: (string | null)[][]) => void;
  clearFill: () => void;
  loadGrid: (grid: GridState) => void;
  loadPuzzle: (cells: Cell[][], size: number, clues: PuzzleClues, metadata: PuzzleMetadata, theme: ThemeData | null) => void;
}

export const usePuzzleStore = create<PuzzleState>()(
  temporal(
    (set, get) => ({
      size: 15,
      cells: (() => {
        const c = createEmptyGrid(15);
        computeNumbers(c, 15);
        return c;
      })(),
      slots: [],
      metadata: {
        title: '',
        author: '',
        editor: '',
        copyright: '',
        date: null,
        difficulty: null,
        notes: null,
      },
      clues: { across: [], down: [] },
      theme: null,
      symmetric: true,

      newPuzzle: (size: number) => {
        const cells = createEmptyGrid(size);
        computeNumbers(cells, size);
        set({ size, cells, slots: getSlots(cells, size), clues: { across: [], down: [] }, theme: null });
      },

      setCell: (row, col, letter) => {
        const { cells, size } = get();
        const next = cells.map(r => r.map(c => ({ ...c })));
        if (!next[row][col].is_black) {
          next[row][col].letter = letter ? letter.toUpperCase() : null;
          next[row][col].rebus = null;
        }
        set({ cells: next, slots: getSlots(next, size) });
      },

      setCellRebus: (row, col, value) => {
        const { cells, size } = get();
        const next = cells.map(r => r.map(c => ({ ...c })));
        if (!next[row][col].is_black) {
          if (value.length === 1) {
            next[row][col].letter = value;
            next[row][col].rebus = null;
          } else {
            next[row][col].rebus = value;
            next[row][col].letter = value[0]; // keep first letter for slot matching
          }
        }
        set({ cells: next, slots: getSlots(next, size) });
      },

      toggleBlack: (row, col) => {
        const { cells, size, symmetric } = get();
        const next = cells.map(r => r.map(c => ({ ...c })));
        const wasBlack = next[row][col].is_black;
        next[row][col].is_black = !wasBlack;
        if (!wasBlack) {
          next[row][col].letter = null;
          next[row][col].rebus = null;
        }
        if (symmetric) {
          const sr = size - 1 - row;
          const sc = size - 1 - col;
          next[sr][sc].is_black = !wasBlack;
          if (!wasBlack) {
            next[sr][sc].letter = null;
            next[sr][sc].rebus = null;
          }
        }
        computeNumbers(next, size);
        set({ cells: next, slots: getSlots(next, size) });
      },

      toggleCircle: (row, col) => {
        const { cells, size } = get();
        const next = cells.map(r => r.map(c => ({ ...c })));
        next[row][col].is_circled = !next[row][col].is_circled;
        set({ cells: next, slots: getSlots(next, size) });
      },

      toggleShade: (row, col) => {
        const { cells, size } = get();
        const next = cells.map(r => r.map(c => ({ ...c })));
        next[row][col].is_shaded = !next[row][col].is_shaded;
        set({ cells: next, slots: getSlots(next, size) });
      },

      toggleLock: (row, col) => {
        const { cells, size } = get();
        const next = cells.map(r => r.map(c => ({ ...c })));
        next[row][col].is_locked = !next[row][col].is_locked;
        set({ cells: next, slots: getSlots(next, size) });
      },

      setSymmetric: (val) => set({ symmetric: val }),

      setClue: (number, direction, text) => {
        const { clues } = get();
        const dir = direction === 'Across' ? 'across' : 'down';
        const list = [...clues[dir]];
        const idx = list.findIndex(c => c.number === number);
        if (idx >= 0) {
          list[idx] = { ...list[idx], text };
        } else {
          list.push({ number, text, answer: '', is_theme_entry: false });
          list.sort((a, b) => a.number - b.number);
        }
        set({ clues: { ...clues, [dir]: list } });
      },

      setClueThemeFlag: (number, direction, isTheme) => {
        const { clues } = get();
        const dir = direction === 'Across' ? 'across' : 'down';
        const list = clues[dir].map(c =>
          c.number === number ? { ...c, is_theme_entry: isTheme } : c
        );
        set({ clues: { ...clues, [dir]: list } });
      },

      setMetadata: (meta) => {
        set({ metadata: { ...get().metadata, ...meta } });
      },

      setTheme: (theme) => set({ theme }),

      applyAutofill: (gridLetters) => {
        const { cells, size } = get();
        const next = cells.map(r => r.map(c => ({ ...c })));
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            if (!next[row][col].is_black && !next[row][col].is_locked && gridLetters[row]?.[col]) {
              next[row][col].letter = gridLetters[row][col];
            }
          }
        }
        set({ cells: next, slots: getSlots(next, size) });
      },

      clearFill: () => {
        const { cells, size } = get();
        const next = cells.map(r => r.map(c => ({ ...c })));
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            if (!next[row][col].is_locked && !next[row][col].is_black) {
              next[row][col].letter = null;
            }
          }
        }
        set({ cells: next, slots: getSlots(next, size) });
      },

      loadGrid: (grid) => {
        const cells = grid.cells.map(r => r.map(c => ({ ...c })));
        computeNumbers(cells, grid.size);
        set({ size: grid.size, cells, slots: getSlots(cells, grid.size) });
      },

      loadPuzzle: (cells, size, clues, metadata, theme) => {
        const c = cells.map(r => r.map(cell => ({ ...cell })));
        computeNumbers(c, size);
        set({ size, cells: c, slots: getSlots(c, size), clues, metadata, theme });
      },
    }),
    { limit: 100 }
  )
);
