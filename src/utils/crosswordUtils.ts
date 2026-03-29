import { Cell, Direction, ClueEntry } from '../types/crossword';

export function computeNumbers(grid: Cell[][]): Cell[][] {
  const size = grid.length;
  const newGrid = grid.map(row => row.map(cell => ({ ...cell, number: undefined })));
  let num = 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (newGrid[r][c].isBlack) continue;
      const acrossStart = (c === 0 || newGrid[r][c - 1].isBlack) && (c + 1 < size && !newGrid[r][c + 1].isBlack);
      const downStart = (r === 0 || newGrid[r - 1][c].isBlack) && (r + 1 < size && !newGrid[r + 1][c].isBlack);
      if (acrossStart || downStart) {
        newGrid[r][c].number = num++;
      }
    }
  }
  return newGrid;
}

export function getWordAt(grid: Cell[][], row: number, col: number, direction: Direction): { startRow: number; startCol: number; length: number } | null {
  const size = grid.length;
  if (grid[row][col].isBlack) return null;
  if (direction === 'across') {
    let start = col;
    while (start > 0 && !grid[row][start - 1].isBlack) start--;
    let end = col;
    while (end < size - 1 && !grid[row][end + 1].isBlack) end++;
    if (end - start < 1) return null;
    return { startRow: row, startCol: start, length: end - start + 1 };
  } else {
    let start = row;
    while (start > 0 && !grid[start - 1][col].isBlack) start--;
    let end = row;
    while (end < size - 1 && !grid[end + 1][col].isBlack) end++;
    if (end - start < 1) return null;
    return { startRow: start, startCol: col, length: end - start + 1 };
  }
}

export function getWordEntries(grid: Cell[][]): ClueEntry[] {
  const size = grid.length;
  const entries: ClueEntry[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c].isBlack || !grid[r][c].number) continue;
      // Across
      const acrossStart = (c === 0 || grid[r][c - 1].isBlack);
      if (acrossStart) {
        let len = 0;
        let cc = c;
        while (cc < size && !grid[r][cc].isBlack) { len++; cc++; }
        if (len >= 2) {
          let answer = '';
          for (let i = 0; i < len; i++) answer += grid[r][c + i].letter || '_';
          entries.push({ number: grid[r][c].number!, clue: '', answer, startRow: r, startCol: c, length: len, direction: 'across' });
        }
      }
      // Down
      const downStart = (r === 0 || grid[r - 1][c].isBlack);
      if (downStart) {
        let len = 0;
        let rr = r;
        while (rr < size && !grid[rr][c].isBlack) { len++; rr++; }
        if (len >= 2) {
          let answer = '';
          for (let i = 0; i < len; i++) answer += grid[r + i][c].letter || '_';
          entries.push({ number: grid[r][c].number!, clue: '', answer, startRow: r, startCol: c, length: len, direction: 'down' });
        }
      }
    }
  }
  return entries;
}

export function isSymmetric(size: number, row: number, col: number): { row: number; col: number } {
  return { row: size - 1 - row, col: size - 1 - col };
}

export function toggleBlack(grid: Cell[][], row: number, col: number, size: number, symmetric: boolean): Cell[][] {
  const newGrid = grid.map(r => r.map(c => ({ ...c })));
  newGrid[row][col].isBlack = !newGrid[row][col].isBlack;
  if (newGrid[row][col].isBlack) newGrid[row][col].letter = '';
  if (symmetric) {
    const { row: sr, col: sc } = isSymmetric(size, row, col);
    newGrid[sr][sc].isBlack = newGrid[row][col].isBlack;
    if (newGrid[sr][sc].isBlack) newGrid[sr][sc].letter = '';
  }
  return computeNumbers(newGrid);
}

export function patternMatch(pattern: string, wordList: string[]): string[] {
  const upper = pattern.toUpperCase();
  return wordList.filter(word => {
    if (word.length !== upper.length) return false;
    for (let i = 0; i < upper.length; i++) {
      if (upper[i] !== '_' && upper[i] !== word[i]) return false;
    }
    return true;
  });
}

export function createEmptyGrid(size: number): Cell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ letter: '', isBlack: false }))
  );
}

export function getCellsInWord(grid: Cell[][], startRow: number, startCol: number, direction: Direction, length: number): { row: number; col: number }[] {
  void grid;
  return Array.from({ length }, (_, i) => ({
    row: direction === 'down' ? startRow + i : startRow,
    col: direction === 'across' ? startCol + i : startCol,
  }));
}
