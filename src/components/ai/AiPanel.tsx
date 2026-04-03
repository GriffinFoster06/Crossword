import { useState, useMemo, useRef } from 'react';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';
import {
  generateClues, developTheme, getClueHistory, batchGenerateClues, evaluateFill,
} from '../../lib/tauriCommands';
import type { ClueCandidate, ThemeSuggestion, ClueHistoryEntry } from '../../types/crossword';
import type { BatchClueResult } from '../../lib/tauriCommands';

type AiTab = 'clues' | 'batch' | 'theme' | 'history';

export function AiPanel() {
  const [tab, setTab] = useState<AiTab>('clues');

  return (
    <div className="ai-panel">
      <h3 className="panel-title">AI Assistant</h3>
      <div className="ai-tabs">
        <button className={`ai-tab ${tab === 'clues' ? 'active' : ''}`} onClick={() => setTab('clues')}>
          Clue Writer
        </button>
        <button className={`ai-tab ${tab === 'batch' ? 'active' : ''}`} onClick={() => setTab('batch')}>
          Generate All
        </button>
        <button className={`ai-tab ${tab === 'theme' ? 'active' : ''}`} onClick={() => setTab('theme')}>
          Theme Dev
        </button>
        <button className={`ai-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          History
        </button>
      </div>

      {tab === 'clues' && <ClueWriterTab />}
      {tab === 'batch' && <BatchClueTab />}
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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    try {
      const clues = await generateClues(answer, difficulty);
      setCandidates(clues);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Clue generation failed: ${msg}`);
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
          Install Ollama, then run: <code>ollama pull phi4</code>
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
        <button className="ai-btn" onClick={handleGenerate} disabled={!isComplete || loading}>
          {loading ? 'Generating...' : 'Generate Clues'}
        </button>
      </div>

      {error && <div className="ai-error">{error}</div>}
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

function BatchClueTab() {
  const slots = usePuzzleStore((s) => s.slots);
  const setClue = usePuzzleStore((s) => s.setClue);
  const ollamaAvailable = useUiStore((s) => s.ollamaAvailable);

  const [difficulty, setDifficulty] = useState(3);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<BatchClueResult[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [evalText, setEvalText] = useState('');
  const [evalLoading, setEvalLoading] = useState(false);
  const cancelRef = useRef(false);

  const completedSlots = useMemo(
    () => slots.filter(s => !s.pattern.includes('_') && s.pattern.length >= 3),
    [slots]
  );

  const handleGenerateAll = async () => {
    if (!ollamaAvailable || completedSlots.length === 0) return;
    cancelRef.current = false;
    setRunning(true);
    setProgress(0);
    setTotal(completedSlots.length);
    setResults([]);
    setBatchError(null);

    const words = completedSlots.map(s => ({
      number: s.number,
      direction: s.direction,
      answer: s.pattern,
    }));

    try {
      await batchGenerateClues(words, difficulty, (idx, tot, result) => {
        setProgress(idx + 1);
        setTotal(tot);
        setResults(prev => [...prev, result]);
        // Apply the clue immediately
        setClue(result.number, result.direction as 'Across' | 'Down', result.clue);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBatchError(`Batch generation failed: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  const handleEvaluate = async () => {
    const words = completedSlots.map(s => s.pattern);
    if (words.length === 0) return;
    setEvalLoading(true);
    try {
      const text = await evaluateFill(words, []);
      setEvalText(text);
    } catch (e) {
      setEvalText('Evaluation failed');
    } finally {
      setEvalLoading(false);
    }
  };

  if (!ollamaAvailable) {
    return (
      <div className="ai-tab-content">
        <div className="ai-offline">AI features require Ollama running locally.</div>
      </div>
    );
  }

  return (
    <div className="ai-tab-content">
      <div className="ai-controls">
        <div className="ai-batch-info">
          {completedSlots.length} completed words ready for clue generation
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
        <div className="ai-btn-row">
          <button
            className="ai-btn"
            onClick={handleGenerateAll}
            disabled={running || completedSlots.length === 0}
          >
            {running ? `Generating... (${progress}/${total})` : 'Generate All Clues'}
          </button>
          <button
            className="ai-btn ai-btn-secondary"
            onClick={handleEvaluate}
            disabled={evalLoading || completedSlots.length === 0}
          >
            {evalLoading ? 'Evaluating...' : 'Evaluate Fill'}
          </button>
        </div>
      </div>

      {batchError && <div className="ai-error">{batchError}</div>}

      {running && total > 0 && (
        <div className="ai-progress-bar">
          <div
            className="ai-progress-fill"
            style={{ width: `${(progress / total) * 100}%` }}
          />
          <span className="ai-progress-label">{progress} / {total}</span>
        </div>
      )}

      {evalText && (
        <div className="ai-eval-result">
          <strong>Fill Evaluation:</strong>
          <p>{evalText}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="ai-results">
          {results.map((r, i) => (
            <div key={i} className="ai-batch-result">
              <span className="ai-batch-num">{r.number}{r.direction[0]}</span>
              <span className="ai-batch-answer">{r.answer}</span>
              <span className="ai-batch-clue">{r.clue}</span>
            </div>
          ))}
        </div>
      )}
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

  const [error, setError] = useState<string | null>(null);

  const handleDevelop = async () => {
    if (!seed.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await developTheme(seed, size);
      setSuggestion(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Theme development failed: ${msg}`);
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

      {error && <div className="ai-error">{error}</div>}

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
  const [historyError, setHistoryError] = useState<string | null>(null);
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
    setHistoryError(null);
    try {
      const entries = await getClueHistory(w);
      setHistory(entries);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHistoryError(`History lookup failed: ${msg}`);
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

      {historyError && <div className="ai-error">{historyError}</div>}

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
