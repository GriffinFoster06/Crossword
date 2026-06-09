import { create } from 'zustand';
import type { ClueCandidate, ThemeSuggestion, ClueHistoryEntry } from '../types/crossword';
import type { BatchClueResult } from '../lib/tauriCommands';

export type OllamaStatus = 'connected' | 'disconnected' | 'loading';

interface AiState {
  // Per-word cached clue suggestions: answer -> candidates
  clueResults: Record<string, ClueCandidate[]>;

  // Theme development result
  themeResult: ThemeSuggestion | null;

  // Loading state for single clue generation
  isGenerating: boolean;

  // Loading state for batch generation
  isBatchGenerating: boolean;
  batchProgress: number;
  batchTotal: number;
  batchResults: BatchClueResult[];

  // Clue lookup history
  history: ClueHistoryEntry[];

  // Error messages
  error: string | null;
  themeError: string | null;

  // Actions
  setClueCandidates: (answer: string, candidates: ClueCandidate[]) => void;
  setThemeResult: (result: ThemeSuggestion | null) => void;
  setIsGenerating: (v: boolean) => void;
  setIsBatchGenerating: (v: boolean) => void;
  setBatchProgress: (progress: number, total: number) => void;
  addBatchResult: (result: BatchClueResult) => void;
  resetBatch: () => void;
  setHistory: (entries: ClueHistoryEntry[]) => void;
  setError: (msg: string | null) => void;
  setThemeError: (msg: string | null) => void;
  clearCache: () => void;
}

export const useAiStore = create<AiState>((set) => ({
  clueResults: {},
  themeResult: null,
  isGenerating: false,
  isBatchGenerating: false,
  batchProgress: 0,
  batchTotal: 0,
  batchResults: [],
  history: [],
  error: null,
  themeError: null,

  setClueCandidates: (answer, candidates) =>
    set((s) => ({ clueResults: { ...s.clueResults, [answer]: candidates } })),

  setThemeResult: (result) => set({ themeResult: result }),

  setIsGenerating: (v) => set({ isGenerating: v }),

  setIsBatchGenerating: (v) => set({ isBatchGenerating: v }),

  setBatchProgress: (progress, total) => set({ batchProgress: progress, batchTotal: total }),

  addBatchResult: (result) =>
    set((s) => ({ batchResults: [...s.batchResults, result] })),

  resetBatch: () => set({ batchProgress: 0, batchTotal: 0, batchResults: [] }),

  setHistory: (entries) => set({ history: entries }),

  setError: (msg) => set({ error: msg }),

  setThemeError: (msg) => set({ themeError: msg }),

  clearCache: () => set({ clueResults: {}, themeResult: null }),
}));
