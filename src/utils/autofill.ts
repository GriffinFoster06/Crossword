import { Cell, Direction } from '../types/crossword';
import { WordIndex, WordEntry, findMatches } from './wordDatabase';
import { getWordEntries, getCellsInWord } from './crosswordUtils';

interface Slot {
  startRow: number;
  startCol: number;
  direction: Direction;
  length: number;
  cells: { row: number; col: number }[];
}

function getPattern(grid: Cell[][], slot: Slot): string {
  return slot.cells.map(({ row, col }) => grid[row][col].letter || '_').join('');
}

function fillSlot(grid: Cell[][], slot: Slot, word: string): Cell[][] {
  const newGrid = grid.map(r => r.map(c => ({ ...c })));
  for (let i = 0; i < slot.cells.length; i++) {
    const { row, col } = slot.cells[i];
    newGrid[row][col].letter = word[i];
  }
  return newGrid;
}

function clearSlot(grid: Cell[][], slot: Slot): Cell[][] {
  const newGrid = grid.map(r => r.map(c => ({ ...c })));
  for (const { row, col } of slot.cells) {
    newGrid[row][col].letter = '';
  }
  return newGrid;
}

function countMatches(grid: Cell[][], slot: Slot, index: WordIndex): number {
  const pattern = getPattern(grid, slot);
  if (!pattern.includes('_')) return Infinity;
  return findMatches(pattern, index).length;
}

export async function autofill(
  grid: Cell[][],
  wordIndex: WordIndex,
  onProgress?: (grid: Cell[][]) => void
): Promise<Cell[][]> {
  const entries = getWordEntries(grid);
  const slots: Slot[] = entries.map(e => ({
    startRow: e.startRow,
    startCol: e.startCol,
    direction: e.direction,
    length: e.length,
    cells: getCellsInWord(grid, e.startRow, e.startCol, e.direction, e.length),
  }));

  const unfilledSlots = slots.filter(s => getPattern(grid, s).includes('_'));

  let currentGrid = grid.map(r => r.map(c => ({ ...c })));

  async function backtrack(remaining: Slot[], depth: number): Promise<Cell[][] | null> {
    if (remaining.length === 0) return currentGrid;

    const sorted = [...remaining].sort((a, b) => {
      const ma = countMatches(currentGrid, a, wordIndex);
      const mb = countMatches(currentGrid, b, wordIndex);
      if (ma === Infinity && mb === Infinity) return 0;
      if (ma === Infinity) return 1;
      if (mb === Infinity) return -1;
      return ma - mb;
    });

    const slot = sorted[0];
    const rest = sorted.slice(1);
    const pattern = getPattern(currentGrid, slot);

    if (!pattern.includes('_')) {
      return backtrack(rest, depth + 1);
    }

    const matches: WordEntry[] = findMatches(pattern, wordIndex);

    if (matches.length === 0) return null;

    for (const match of matches.slice(0, 20)) {
      currentGrid = fillSlot(currentGrid, slot, match.word);
      if (onProgress && depth < 3) onProgress(currentGrid);

      if (depth === 0) await new Promise<void>(r => setTimeout(r, 0));

      const result = await backtrack(rest, depth + 1);
      if (result) return result;

      currentGrid = clearSlot(currentGrid, slot);
    }

    return null;
  }

  const result = await backtrack(unfilledSlots, 0);
  return result || currentGrid;
}
