export interface Cell {
  letter: string;
  isBlack: boolean;
  number?: number;
}

export type Direction = 'across' | 'down';

export interface ClueEntry {
  number: number;
  clue: string;
  answer: string;
  startRow: number;
  startCol: number;
  length: number;
  direction: Direction;
}

export interface CrosswordState {
  grid: Cell[][];
  size: number;
  selectedRow: number;
  selectedCol: number;
  direction: Direction;
  clues: { across: Record<number, string>; down: Record<number, string> };
  mode: 'build' | 'fill' | 'solve';
  symmetric: boolean;
}

export interface WordEntry {
  word: string;
  score: number;
}

export type WordIndex = Map<number, WordEntry[]>;
