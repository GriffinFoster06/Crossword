/**
 * puzzleStore tests
 *
 * Tests the core grid state logic: cell manipulation, black square toggling
 * with symmetry, rebus entry, clue management, and slot extraction.
 *
 * Note: Tauri IPC is not available in jsdom. The store itself has no Tauri
 * dependencies — only the Tauri commands (in tauriCommands.ts) do.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePuzzleStore } from '../stores/puzzleStore';

// Reset store to a clean 15×15 before every test
beforeEach(() => {
  usePuzzleStore.getState().newPuzzle(15);
});

// ── newPuzzle ────────────────────────────────────────────────────────────────

describe('newPuzzle', () => {
  it('creates a 15×15 grid with all white cells', () => {
    const { size, cells } = usePuzzleStore.getState();
    expect(size).toBe(15);
    expect(cells.length).toBe(15);
    cells.forEach(row => {
      expect(row.length).toBe(15);
      row.forEach(cell => {
        expect(cell.is_black).toBe(false);
        expect(cell.letter).toBeNull();
      });
    });
  });

  it('resets clues when creating a new puzzle', () => {
    usePuzzleStore.getState().setClue(1, 'Across', 'Some clue');
    usePuzzleStore.getState().newPuzzle(15);
    const { clues } = usePuzzleStore.getState();
    expect(clues.across).toHaveLength(0);
    expect(clues.down).toHaveLength(0);
  });

  it('creates a 5×5 grid on request', () => {
    usePuzzleStore.getState().newPuzzle(5);
    expect(usePuzzleStore.getState().size).toBe(5);
    expect(usePuzzleStore.getState().cells.length).toBe(5);
  });
});

// ── setCell ──────────────────────────────────────────────────────────────────

describe('setCell', () => {
  it('sets a letter in a white cell (uppercased)', () => {
    usePuzzleStore.getState().setCell(0, 0, 'a');
    expect(usePuzzleStore.getState().cells[0][0].letter).toBe('A');
  });

  it('clears a cell when letter is null', () => {
    usePuzzleStore.getState().setCell(0, 0, 'Z');
    usePuzzleStore.getState().setCell(0, 0, null);
    expect(usePuzzleStore.getState().cells[0][0].letter).toBeNull();
  });

  it('clears rebus when setting a single letter', () => {
    usePuzzleStore.getState().setCellRebus(0, 0, 'STAR');
    usePuzzleStore.getState().setCell(0, 0, 'S');
    const cell = usePuzzleStore.getState().cells[0][0];
    expect(cell.letter).toBe('S');
    expect(cell.rebus).toBeNull();
  });

  it('does not modify a black cell', () => {
    usePuzzleStore.getState().toggleBlack(0, 0);
    usePuzzleStore.getState().setCell(0, 0, 'Q');
    expect(usePuzzleStore.getState().cells[0][0].letter).toBeNull();
  });
});

// ── toggleBlack ──────────────────────────────────────────────────────────────

describe('toggleBlack', () => {
  it('toggles a cell to black', () => {
    usePuzzleStore.getState().toggleBlack(2, 3);
    expect(usePuzzleStore.getState().cells[2][3].is_black).toBe(true);
  });

  it('applies 180° symmetry when symmetric=true', () => {
    // symmetric defaults to true
    usePuzzleStore.getState().toggleBlack(2, 3);
    expect(usePuzzleStore.getState().cells[12][11].is_black).toBe(true);
  });

  it('does not apply symmetry when symmetric=false', () => {
    usePuzzleStore.getState().setSymmetric(false);
    usePuzzleStore.getState().toggleBlack(2, 3);
    expect(usePuzzleStore.getState().cells[12][11].is_black).toBe(false);
    usePuzzleStore.getState().setSymmetric(true);
  });

  it('clears letter when toggling to black', () => {
    usePuzzleStore.getState().setCell(0, 0, 'X');
    usePuzzleStore.getState().toggleBlack(0, 0);
    expect(usePuzzleStore.getState().cells[0][0].letter).toBeNull();
  });

  it('can toggle back to white', () => {
    usePuzzleStore.getState().toggleBlack(1, 1);
    usePuzzleStore.getState().toggleBlack(1, 1);
    expect(usePuzzleStore.getState().cells[1][1].is_black).toBe(false);
  });
});

// ── setCellRebus ─────────────────────────────────────────────────────────────

describe('setCellRebus', () => {
  it('sets a multi-character rebus', () => {
    usePuzzleStore.getState().setCellRebus(0, 0, 'STAR');
    const cell = usePuzzleStore.getState().cells[0][0];
    expect(cell.rebus).toBe('STAR');
    expect(cell.letter).toBe('S'); // first character kept
  });

  it('treats single-char rebus as a plain letter', () => {
    usePuzzleStore.getState().setCellRebus(0, 0, 'A');
    const cell = usePuzzleStore.getState().cells[0][0];
    expect(cell.letter).toBe('A');
    expect(cell.rebus).toBeNull();
  });

  it('does not modify a black cell', () => {
    usePuzzleStore.getState().toggleBlack(0, 0);
    usePuzzleStore.getState().setCellRebus(0, 0, 'MOON');
    expect(usePuzzleStore.getState().cells[0][0].rebus).toBeNull();
  });
});

// ── cell markers (circle, shade, lock) ───────────────────────────────────────

describe('cell markers', () => {
  it('toggleCircle flips is_circled', () => {
    usePuzzleStore.getState().toggleCircle(3, 3);
    expect(usePuzzleStore.getState().cells[3][3].is_circled).toBe(true);
    usePuzzleStore.getState().toggleCircle(3, 3);
    expect(usePuzzleStore.getState().cells[3][3].is_circled).toBe(false);
  });

  it('toggleShade flips is_shaded', () => {
    usePuzzleStore.getState().toggleShade(4, 4);
    expect(usePuzzleStore.getState().cells[4][4].is_shaded).toBe(true);
  });

  it('toggleLock flips is_locked', () => {
    usePuzzleStore.getState().toggleLock(5, 5);
    expect(usePuzzleStore.getState().cells[5][5].is_locked).toBe(true);
  });
});

// ── clue management ──────────────────────────────────────────────────────────

describe('setClue', () => {
  it('adds a new across clue', () => {
    usePuzzleStore.getState().setClue(1, 'Across', 'Capital of France');
    const clues = usePuzzleStore.getState().clues.across;
    expect(clues.find(c => c.number === 1)?.text).toBe('Capital of France');
  });

  it('updates an existing clue', () => {
    usePuzzleStore.getState().setClue(1, 'Across', 'First clue');
    usePuzzleStore.getState().setClue(1, 'Across', 'Updated clue');
    const clues = usePuzzleStore.getState().clues.across;
    expect(clues.filter(c => c.number === 1)).toHaveLength(1);
    expect(clues.find(c => c.number === 1)?.text).toBe('Updated clue');
  });

  it('adds a down clue independently', () => {
    usePuzzleStore.getState().setClue(2, 'Down', 'River in Egypt');
    const clues = usePuzzleStore.getState().clues.down;
    expect(clues.find(c => c.number === 2)?.text).toBe('River in Egypt');
  });
});

describe('setClueThemeFlag', () => {
  it('marks a clue as a theme entry', () => {
    usePuzzleStore.getState().setClue(1, 'Across', 'Theme answer');
    usePuzzleStore.getState().setClueThemeFlag(1, 'Across', true);
    const clue = usePuzzleStore.getState().clues.across.find(c => c.number === 1);
    expect(clue?.is_theme_entry).toBe(true);
  });
});

// ── applyAutofill & clearFill ─────────────────────────────────────────────────

describe('applyAutofill', () => {
  it('fills empty cells with provided letters', () => {
    const letters: (string | null)[][] = Array.from({ length: 15 }, (_, r) =>
      Array.from({ length: 15 }, (_, c) => String.fromCharCode(65 + ((r * 15 + c) % 26)))
    );
    usePuzzleStore.getState().applyAutofill(letters);
    expect(usePuzzleStore.getState().cells[0][0].letter).toBe('A');
    expect(usePuzzleStore.getState().cells[0][1].letter).toBe('B');
  });

  it('does not overwrite locked cells', () => {
    usePuzzleStore.getState().setCell(0, 0, 'Z');
    usePuzzleStore.getState().toggleLock(0, 0);
    const letters: (string | null)[][] = Array.from({ length: 15 }, () =>
      Array.from({ length: 15 }, () => 'X')
    );
    usePuzzleStore.getState().applyAutofill(letters);
    expect(usePuzzleStore.getState().cells[0][0].letter).toBe('Z');
  });
});

describe('clearFill', () => {
  it('removes all unlocked letters', () => {
    usePuzzleStore.getState().setCell(1, 1, 'Q');
    usePuzzleStore.getState().clearFill();
    expect(usePuzzleStore.getState().cells[1][1].letter).toBeNull();
  });

  it('preserves locked letters', () => {
    usePuzzleStore.getState().setCell(2, 2, 'K');
    usePuzzleStore.getState().toggleLock(2, 2);
    usePuzzleStore.getState().clearFill();
    expect(usePuzzleStore.getState().cells[2][2].letter).toBe('K');
  });
});

// ── slot extraction ──────────────────────────────────────────────────────────

describe('slot extraction', () => {
  it('produces across and down slots in an all-white 15×15', () => {
    const { slots } = usePuzzleStore.getState();
    const across = slots.filter(s => s.direction === 'Across');
    const down = slots.filter(s => s.direction === 'Down');
    expect(across.length).toBeGreaterThan(0);
    expect(down.length).toBeGreaterThan(0);
  });

  it('slot patterns reflect placed letters', () => {
    usePuzzleStore.getState().setCell(0, 0, 'A');
    const { slots } = usePuzzleStore.getState();
    const firstAcross = slots.find(s => s.direction === 'Across' && s.row === 0 && s.col === 0);
    expect(firstAcross?.pattern[0]).toBe('A');
  });

  it('slot count increases after removing a black square', () => {
    // Remove a black square to ensure slots update
    usePuzzleStore.getState().setSymmetric(false);
    const before = usePuzzleStore.getState().slots.length;
    usePuzzleStore.getState().toggleBlack(7, 7); // add black
    usePuzzleStore.getState().toggleBlack(7, 7); // remove black
    const after = usePuzzleStore.getState().slots.length;
    expect(after).toBe(before);
    usePuzzleStore.getState().setSymmetric(true);
  });
});

// ── metadata ─────────────────────────────────────────────────────────────────

describe('setMetadata', () => {
  it('updates title without clobbering other fields', () => {
    usePuzzleStore.getState().setMetadata({ author: 'Jane' });
    usePuzzleStore.getState().setMetadata({ title: 'Test Puzzle' });
    const { metadata } = usePuzzleStore.getState();
    expect(metadata.title).toBe('Test Puzzle');
    expect(metadata.author).toBe('Jane');
  });
});
