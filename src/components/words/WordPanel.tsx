import { useState, useEffect, useMemo } from 'react';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';
import { queryWords } from '../../lib/tauriCommands';
import type { WordMatch } from '../../types/crossword';

export function WordPanel() {
  const cells = usePuzzleStore((s) => s.cells);
  const size = usePuzzleStore((s) => s.size);
  const slots = usePuzzleStore((s) => s.slots);
  const setCell = usePuzzleStore((s) => s.setCell);
  const selectedRow = useUiStore((s) => s.selectedRow);
  const selectedCol = useUiStore((s) => s.selectedCol);
  const direction = useUiStore((s) => s.direction);
  const [words, setWords] = useState<WordMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'score' | 'alpha'>('score');
  const [minScore, setMinScore] = useState(0);

  // Find the active slot
  const activeSlot = useMemo(() => {
    return slots.find(s => {
      if (s.direction !== direction) return false;
      for (const [r, c] of s.cells) {
        if (r === selectedRow && c === selectedCol) return true;
      }
      return false;
    });
  }, [slots, selectedRow, selectedCol, direction]);

  const pattern = activeSlot?.pattern ?? '';

  // Query words when pattern changes
  useEffect(() => {
    if (!pattern || pattern.length < 3) {
      setWords([]);
      return;
    }
    // Don't query if fully filled
    if (!pattern.includes('_')) {
      setWords([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timeout = setTimeout(async () => {
      try {
        const results = await queryWords(pattern, 200);
        if (!cancelled) {
          setWords(results);
        }
      } catch (e) {
        console.error('Word query failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150); // Debounce

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [pattern]);

  const filteredWords = useMemo(() => {
    let filtered = words.filter(w => w.score >= minScore);
    if (sortBy === 'alpha') {
      filtered = [...filtered].sort((a, b) => a.word.localeCompare(b.word));
    }
    return filtered;
  }, [words, sortBy, minScore]);

  const placeWord = (word: string) => {
    if (!activeSlot) return;
    for (let i = 0; i < word.length; i++) {
      const [r, c] = activeSlot.cells[i];
      setCell(r, c, word[i]);
    }
  };

  return (
    <div className="word-panel">
      <h3 className="panel-title">Words</h3>

      {pattern && pattern.length >= 3 && (
        <div className="word-pattern">
          Pattern: <strong>{pattern}</strong>
          <span className="word-count">
            {loading ? 'Searching...' : `${filteredWords.length} matches`}
          </span>
        </div>
      )}

      <div className="word-controls">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'score' | 'alpha')}
          className="word-sort-select"
        >
          <option value="score">Sort by Score</option>
          <option value="alpha">Sort A-Z</option>
        </select>
        <label className="word-min-score">
          Min: {minScore}
          <input
            type="range"
            min="0"
            max="90"
            step="10"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="word-list">
        {!pattern || pattern.length < 3 ? (
          <div className="word-empty">Select a cell to see word suggestions</div>
        ) : filteredWords.length === 0 ? (
          <div className="word-empty">{loading ? 'Loading...' : 'No matches found'}</div>
        ) : (
          filteredWords.map((w) => (
            <div
              key={w.word}
              className="word-item"
              onClick={() => placeWord(w.word)}
              title={`Score: ${w.score}`}
            >
              <span className="word-text">{w.word}</span>
              <span className={`word-score ${w.score >= 60 ? 'score-high' : w.score >= 40 ? 'score-mid' : 'score-low'}`}>
                {w.score}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
