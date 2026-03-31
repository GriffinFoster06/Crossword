// Core crossword types — mirrors Rust structs via serde

export interface Cell {
  letter: string | null;
  is_black: boolean;
  number: number | null;
  rebus: string | null;
  is_circled: boolean;
  is_shaded: boolean;
  is_locked: boolean;
}

export type Direction = 'Across' | 'Down';

export interface WordSlot {
  number: number;
  direction: Direction;
  row: number;
  col: number;
  length: number;
  pattern: string;
  is_complete: boolean;
  is_approved: boolean;
}

export interface GridState {
  size: number;
  cells: Cell[][];
}

export interface WordMatch {
  word: string;
  score: number;
  frequency_rank: number;
}

export interface WordInfo {
  word: string;
  score: number;
  exists: boolean;
}

export interface ValidationResult {
  is_valid: boolean;
  violations: Violation[];
  stats: GridStats;
}

export interface Violation {
  rule: string;
  severity: 'Error' | 'Warning';
  message: string;
  cells: [number, number][];
}

export interface GridStats {
  word_count: number;
  across_count: number;
  down_count: number;
  black_count: number;
  black_percentage: number;
  avg_word_length: number;
  min_word_length: number;
  max_word_length: number;
  unchecked_cells: number;
  total_cells: number;
  white_cells: number;
  is_connected: boolean;
  has_symmetry: boolean;
  triple_stack_count: number;
}

export interface AutofillProgress {
  cells: [number, number, string][];
  slots_filled: number;
  total_slots: number;
  quality_score: number;
}

export interface AutofillResult {
  success: boolean;
  grid: (string | null)[][] | null;
  quality_score: number;
  words_placed: [number, string, string][];
  message: string;
}

export interface AutofillOptions {
  min_word_score?: number;
  timeout_secs?: number;
}

// Clue types
export interface ClueData {
  number: number;
  text: string;
  answer: string;
  is_theme_entry: boolean;
}

export interface PuzzleClues {
  across: ClueData[];
  down: ClueData[];
}

export interface PuzzleMetadata {
  title: string;
  author: string;
  editor: string;
  copyright: string;
  date: string | null;
  difficulty: string | null;
  notes: string | null;
}

export interface ThemeData {
  description: string;
  entries: string[];
  revealer: string | null;
  theme_type: string | null;
}

export interface PuzzleFile {
  version: number;
  metadata: PuzzleMetadata;
  grid: GridState;
  clues: PuzzleClues;
  theme: ThemeData | null;
  notes: string | null;
}

// AI types
export interface OllamaStatus {
  available: boolean;
  models: string[];
  selected_model: string | null;
}

export interface ClueCandidate {
  text: string;
  style: string;
  difficulty: number;
}

export interface ThemeSuggestion {
  description: string;
  type: string;
  entries: ThemeEntry[];
  revealer: ThemeRevealer | null;
  difficulty: string;
}

export interface ThemeEntry {
  answer: string;
  explanation: string;
  length: number;
  clue: string;
}

export interface ThemeRevealer {
  answer: string;
  clue: string;
  explanation: string;
}

export interface ClueHistoryEntry {
  clue: string;
  source: string;
  year: number | null;
  difficulty: string | null;
}

export interface RankedWord {
  word: string;
  score: number;
  reason: string;
}

export type Mode = 'build' | 'fill' | 'clue';
