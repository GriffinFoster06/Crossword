import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';
import { startAutofill, cancelAutofill, validateGrid } from '../../lib/tauriCommands';
import type { Mode } from '../../types/crossword';

export function Toolbar() {
  const size = usePuzzleStore((s) => s.size);
  const cells = usePuzzleStore((s) => s.cells);
  const symmetric = usePuzzleStore((s) => s.symmetric);
  const clearFill = usePuzzleStore((s) => s.clearFill);
  const applyAutofill = usePuzzleStore((s) => s.applyAutofill);
  const setSymmetric = usePuzzleStore((s) => s.setSymmetric);
  const toggleCircle = usePuzzleStore((s) => s.toggleCircle);
  const toggleShade = usePuzzleStore((s) => s.toggleShade);

  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const isAutofilling = useUiStore((s) => s.isAutofilling);
  const setAutofilling = useUiStore((s) => s.setAutofilling);
  const setValidation = useUiStore((s) => s.setValidation);
  const darkMode = useUiStore((s) => s.darkMode);
  const setDarkMode = useUiStore((s) => s.setDarkMode);
  const showAiPanel = useUiStore((s) => s.showAiPanel);
  const setShowAiPanel = useUiStore((s) => s.setShowAiPanel);
  const wordCount = useUiStore((s) => s.wordCount);
  const showHeatMap = useUiStore((s) => s.showHeatMap);
  const setShowHeatMap = useUiStore((s) => s.setShowHeatMap);
  const showStatsPanel = useUiStore((s) => s.showStatsPanel);
  const setShowStatsPanel = useUiStore((s) => s.setShowStatsPanel);
  const rebusMode = useUiStore((s) => s.rebusMode);
  const setRebusMode = useUiStore((s) => s.setRebusMode);
  const selectedRow = useUiStore((s) => s.selectedRow);
  const selectedCol = useUiStore((s) => s.selectedCol);
  const isDirty = useUiStore((s) => s.isDirty);
  const currentFilePath = useUiStore((s) => s.currentFilePath);
  const setShowNewPuzzleDialog = useUiStore((s) => s.setShowNewPuzzleDialog);
  const setShowExportDialog = useUiStore((s) => s.setShowExportDialog);
  const setShowSettingsDialog = useUiStore((s) => s.setShowSettingsDialog);

  const handleAutofill = async () => {
    setAutofilling(true);
    try {
      const grid = { size, cells };
      const result = await startAutofill(grid, { min_word_score: 30, timeout_secs: 10 });
      if (result.success && result.grid) {
        applyAutofill(result.grid);
      }
      // Validate after fill
      const v = await validateGrid({ size, cells: usePuzzleStore.getState().cells });
      setValidation(v);
    } catch (e) {
      console.error('Autofill failed:', e);
    } finally {
      setAutofilling(false);
    }
  };

  const handleValidate = async () => {
    try {
      const v = await validateGrid({ size, cells });
      setValidation(v);
    } catch (e) {
      console.error('Validation failed:', e);
    }
  };

  // Undo/Redo
  const undo = () => {
    const store = usePuzzleStore as any;
    store.temporal?.getState()?.undo();
  };
  const redo = () => {
    const store = usePuzzleStore as any;
    store.temporal?.getState()?.redo();
  };

  const fileName = currentFilePath ? currentFilePath.split('/').pop() : null;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">CrossForge</span>
      </div>

      {/* File operations */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => setShowNewPuzzleDialog(true)}
          title="New Puzzle (Ctrl+N)"
        >
          New
        </button>
        <button
          className="toolbar-btn"
          onClick={() => setShowExportDialog(true)}
          title="Open / Save / Export (Ctrl+O)"
        >
          {fileName ? (
            <span className="toolbar-filename">{isDirty ? '● ' : ''}{fileName}</span>
          ) : 'Files'}
        </button>
        <button
          className="toolbar-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('crossforge:save'))}
          title="Quick Save (Ctrl+S)"
          disabled={!currentFilePath}
        >
          Save
        </button>
      </div>

      {/* Grid size (display only) */}
      <div className="toolbar-group">
        <span className="toolbar-size">{size}×{size}</span>
      </div>

      {/* Mode */}
      <div className="toolbar-group">
        {(['build', 'fill', 'clue'] as Mode[]).map((m) => (
          <button
            key={m}
            className={`toolbar-btn ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Cell markers (build mode) */}
      {mode === 'build' && (
        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            title="Circle selected cell (Ctrl+Shift+O)"
            onClick={() => toggleCircle(selectedRow, selectedCol)}
          >
            ◎
          </button>
          <button
            className="toolbar-btn"
            title="Shade selected cell (Ctrl+Shift+S)"
            onClick={() => toggleShade(selectedRow, selectedCol)}
          >
            ▩
          </button>
          <button
            className={`toolbar-btn ${rebusMode ? 'active' : ''}`}
            title="Rebus mode — Ctrl+Enter"
            onClick={() => setRebusMode(!rebusMode)}
          >
            R+
          </button>
        </div>
      )}

      {/* Symmetry */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${symmetric ? 'active' : ''}`}
          onClick={() => setSymmetric(!symmetric)}
          title="180° rotational symmetry"
        >
          Sym
        </button>
      </div>

      {/* Autofill */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn toolbar-btn-primary"
          onClick={handleAutofill}
          disabled={isAutofilling}
        >
          {isAutofilling ? 'Filling...' : 'Autofill'}
        </button>
        {isAutofilling && (
          <button className="toolbar-btn" onClick={cancelAutofill}>
            Stop
          </button>
        )}
      </div>

      {/* Validate / Clear */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={handleValidate}>
          Validate
        </button>
        <button className="toolbar-btn" onClick={clearFill}>
          Clear
        </button>
      </div>

      {/* Undo/Redo */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={undo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button className="toolbar-btn" onClick={redo} title="Redo (Ctrl+Y)">
          Redo
        </button>
      </div>

      {/* View toggles */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${showHeatMap ? 'active' : ''}`}
          onClick={() => setShowHeatMap(!showHeatMap)}
          title="Fill quality heat map"
        >
          Heat
        </button>
        <button
          className={`toolbar-btn ${showStatsPanel ? 'active' : ''}`}
          onClick={() => setShowStatsPanel(!showStatsPanel)}
          title="Puzzle statistics"
        >
          Stats
        </button>
        <button
          className={`toolbar-btn ${showAiPanel ? 'active' : ''}`}
          onClick={() => setShowAiPanel(!showAiPanel)}
          title="AI panel"
        >
          AI
        </button>
        <button
          className="toolbar-btn"
          onClick={() => setDarkMode(!darkMode)}
          title="Toggle theme"
        >
          {darkMode ? '☀' : '☾'}
        </button>
        <button
          className="toolbar-btn"
          onClick={() => setShowSettingsDialog(true)}
          title="Settings"
        >
          ⚙
        </button>
      </div>

      <div className="toolbar-group toolbar-stats">
        <span>{wordCount > 0 ? `${wordCount.toLocaleString()} words` : ''}</span>
      </div>
    </div>
  );
}
