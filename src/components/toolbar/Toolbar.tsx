import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';
import { startAutofill, cancelAutofill, validateGrid } from '../../lib/tauriCommands';
import type { Mode } from '../../types/crossword';

export function Toolbar() {
  const size = usePuzzleStore((s) => s.size);
  const cells = usePuzzleStore((s) => s.cells);
  const symmetric = usePuzzleStore((s) => s.symmetric);
  const newPuzzle = usePuzzleStore((s) => s.newPuzzle);
  const clearFill = usePuzzleStore((s) => s.clearFill);
  const applyAutofill = usePuzzleStore((s) => s.applyAutofill);
  const setSymmetric = usePuzzleStore((s) => s.setSymmetric);

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

  const handleNewPuzzle = (newSize: number) => {
    if (confirm(`Create new ${newSize}×${newSize} puzzle? Current work will be lost.`)) {
      newPuzzle(newSize);
      setValidation(null);
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

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">CrossForge</span>
      </div>

      <div className="toolbar-group">
        <select
          value={size}
          onChange={(e) => handleNewPuzzle(Number(e.target.value))}
          className="toolbar-select"
        >
          <option value={5}>5×5</option>
          <option value={7}>7×7</option>
          <option value={9}>9×9</option>
          <option value={11}>11×11</option>
          <option value={13}>13×13</option>
          <option value={15}>15×15</option>
          <option value={17}>17×17</option>
          <option value={19}>19×19</option>
          <option value={21}>21×21</option>
        </select>
      </div>

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

      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${symmetric ? 'active' : ''}`}
          onClick={() => setSymmetric(!symmetric)}
          title="180° rotational symmetry"
        >
          Symmetry
        </button>
      </div>

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
            Cancel
          </button>
        )}
      </div>

      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={handleValidate}>
          Validate
        </button>
        <button className="toolbar-btn" onClick={clearFill}>
          Clear Fill
        </button>
      </div>

      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={undo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button className="toolbar-btn" onClick={redo} title="Redo (Ctrl+Y)">
          Redo
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${showAiPanel ? 'active' : ''}`}
          onClick={() => setShowAiPanel(!showAiPanel)}
        >
          AI
        </button>
        <button
          className="toolbar-btn"
          onClick={() => setDarkMode(!darkMode)}
        >
          {darkMode ? 'Light' : 'Dark'}
        </button>
      </div>

      <div className="toolbar-group toolbar-stats">
        <span>{wordCount > 0 ? `${wordCount.toLocaleString()} words` : ''}</span>
      </div>
    </div>
  );
}
