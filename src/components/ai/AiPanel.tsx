import { useState, useMemo } from 'react';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';
import { generateClues, developTheme, getClueHistory } from '../../lib/tauriCommands';
import type { ClueCandidate, ThemeSuggestion, ClueHistoryEntry } from '../../types/crossword';

export function AiPanel() {
  const [tab, setTab] = useState<'clues' | 'theme' | 'history'>('clues');

  return (
    <div className="ai-panel">
      <h3 className="panel-title">AI Assistant</h3>
      <div className="ai-tabs">
        <button className={`ai-tab ${tab === 'clues' ? 'active' : ''}`} onClick={() => setTab('clues')}>
          Clue Writer
        </button>
        <button className={`ai-tab ${tab === 'theme' ? 'active' : ''}`} onClick={() => setTab('theme')}>
          Theme Dev
        </button>
        <button className={`ai-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          Clue History
        </button>
      </div>

      {tab === 'clues' && <ClueWriterTab />}
      {tab === 'theme' && <ThemeTab />}
      {tab === 'history' && <ClueHistoryTab />}
    </div>
  );
}

function ClueWriterTab() {
  const slots = usePuzzleStore((s) => s.slots);
  const setClue = usePuzzleStore((s) => s.setClue);
  const selectedRow = useUiStore((s) => s.selectedRow);
  const selectedCol = useUiStore((s) => s.selectedCol);
  const direction = useUiStore((s) => s.direction);
  const ollamaAvailable = useUiStore((s) => s.ollamaAvailable);

  const [candidates, setCandidates] = useState<ClueCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState(3);

  const activeSlot = useMemo(() => {
    return slots.find(s => {
      if (s.direction !== direction) return false;
      for (const [r, c] of s.cells) {
        if (r === selectedRow && c === selectedCol) return true;
      }
      return false;
    });
  }, [slots, selectedRow, selectedCol, direction]);

  const answer = activeSlot?.pattern ?? '';
  const isComplete = answer.length >= 3 && !answer.includes('_');

  const handleGenerate = async () => {
    if (!isComplete) return;
    setLoading(true);
    try {
      const clues = await generateClues(answer, difficulty);
      setCandidates(clues);
    } catch (e) {
      console.error('Clue generation failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUseClue = (text: string) => {
    if (activeSlot) {
      setClue(activeSlot.number, activeSlot.direction, text);
    }
  };

  if (!ollamaAvailable) {
    return (
      <div className="ai-tab-content">
        <div className="ai-offline">
          AI features require Ollama running locally.
          <br />
          <a href="https://ollama.ai" target="_blank" rel="noopener">
            Install Ollama
          </a>
          , then run: <code>ollama pull phi4</code>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-tab-content">
      <div className="ai-controls">
        <div className="ai-answer">
          {isComplete ? (
            <>Answer: <strong>{answer}</strong></>
          ) : (
            <span className="ai-hint">Complete a word to generate clues</span>
          )}
        </div>
        <div className="ai-difficulty">
          <label>Difficulty:</label>
          <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
            <option value={1}>Monday</option>
            <option value={2}>Tuesday</option>
            <option value={3}>Wednesday</option>
            <option value={4}>Thursday</option>
            <option value={5}>Friday</option>
            <option value={6}>Saturday</option>
          </select>
        </div>
        <button
          className="ai-btn"
          onClick={handleGenerate}
          disabled={!isComplete || loading}
        >
          {loading ? 'Generating...' : 'Generate Clues'}
        </button>
      </div>

      <div className="ai-results">
        {candidates.map((c, i) => (
          <div key={i} className="ai-clue-candidate" onClick={() => handleUseClue(c.text)}>
            <span className="ai-clue-text">{c.text}</span>
            <span className="ai-clue-style">{c.style}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemeTab() {
  const size = usePuzzleStore((s) => s.size);
  const setTheme = usePuzzleStore((s) => s.setTheme);
  const ollamaAvailable = useUiStore((s) => s.ollamaAvailable);

  const [seed, setSeed] = useState('');
  const [suggestion, setSuggestion] = useState<ThemeSuggestion | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDevelop = async () => {
    if (!seed.trim()) return;
    setLoading(true);
    try {
      const result = await developTheme(seed, size);
      setSuggestion(result);
    } catch (e) {
      console.error('Theme development failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTheme = () => {
    if (suggestion) {
      setTheme({
        description: suggestion.description,
        entries: suggestion.entries.map(e => e.answer),
        revealer: suggestion.revealer?.answer ?? null,
        theme_type: suggestion.type,
      });
    }
  };

  if (!ollamaAvailable) {
    return (
      <div className="ai-tab-content">
        <div className="ai-offline">AI features require Ollama.</div>
      </div>
    );
  }

  return (
    <div className="ai-tab-content">
      <div className="ai-controls">
        <input
          className="ai-input"
          type="text"
          placeholder="Theme idea (e.g., 'space exploration')"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleDevelop()}
        />
        <button className="ai-btn" onClick={handleDevelop} disabled={loading || !seed.trim()}>
          {loading ? 'Thinking...' : 'Develop Theme'}
        </button>
      </div>

      {suggestion && (
        <div className="ai-theme-result">
          <h4>{suggestion.description}</h4>
          <div className="ai-theme-type">Type: {suggestion.type}</div>
          <div className="ai-theme-entries">
            {suggestion.entries.map((entry, i) => (
              <div key={i} className="ai-theme-entry">
                <strong>{entry.answer}</strong> ({entry.length} letters)
                <div className="ai-theme-explanation">{entry.explanation}</div>
                <div className="ai-theme-clue">Clue: {entry.clue}</div>
              </div>
            ))}
          </div>
          {suggestion.revealer && (
            <div className="ai-theme-revealer">
              Revealer: <strong>{suggestion.revealer.answer}</strong>
              <div>{suggestion.revealer.clue}</div>
            </div>
          )}
          <button className="ai-btn" onClick={handleApplyTheme}>
            Apply Theme
          </button>
        </div>
      )}
    </div>
  );
}

function ClueHistoryTab() {
  const slots = usePuzzleStore((s) => s.slots);
  const setClue = usePuzzleStore((s) => s.setClue);
  const selectedRow = useUiStore((s) => s.selectedRow);
  const selectedCol = useUiStore((s) => s.selectedCol);
  const direction = useUiStore((s) => s.direction);

  const [history, setHistory] = useState<ClueHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchWord, setSearchWord] = useState('');

  const activeSlot = useMemo(() => {
    return slots.find(s => {
      if (s.direction !== direction) return false;
      for (const [r, c] of s.cells) {
        if (r === selectedRow && c === selectedCol) return true;
      }
      return false;
    });
  }, [slots, selectedRow, selectedCol, direction]);

  const handleSearch = async (word?: string) => {
    const w = word || searchWord || activeSlot?.pattern;
    if (!w || w.includes('_')) return;

    setLoading(true);
    try {
      const entries = await getClueHistory(w);
      setHistory(entries);
    } catch (e) {
      console.error('History lookup failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUseClue = (text: string) => {
    if (activeSlot) {
      setClue(activeSlot.number, activeSlot.direction, text);
    }
  };

  return (
    <div className="ai-tab-content">
      <div className="ai-controls">
        <input
          className="ai-input"
          type="text"
          placeholder="Word to look up..."
          value={searchWord || (activeSlot && !activeSlot.pattern.includes('_') ? activeSlot.pattern : '')}
          onChange={(e) => setSearchWord(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="ai-btn" onClick={() => handleSearch()} disabled={loading}>
          {loading ? 'Loading...' : 'Look Up'}
        </button>
      </div>

      <div className="ai-results">
        {history.length === 0 ? (
          <div className="ai-empty">
            {loading ? 'Searching...' : 'No historical clues found. Enter a word above.'}
          </div>
        ) : (
          history.map((entry, i) => (
            <div key={i} className="ai-history-item" onClick={() => handleUseClue(entry.clue)}>
              <span className="ai-history-clue">{entry.clue}</span>
              <span className="ai-history-meta">
                {entry.source} {entry.year && `(${entry.year})`}
                {entry.difficulty && ` — ${entry.difficulty}`}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
