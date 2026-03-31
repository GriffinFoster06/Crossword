import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';

export function StatusBar() {
  const size = usePuzzleStore((s) => s.size);
  const cells = usePuzzleStore((s) => s.cells);
  const symmetric = usePuzzleStore((s) => s.symmetric);
  const slots = usePuzzleStore((s) => s.slots);
  const mode = useUiStore((s) => s.mode);
  const validation = useUiStore((s) => s.validation);
  const isAutofilling = useUiStore((s) => s.isAutofilling);
  const ollamaAvailable = useUiStore((s) => s.ollamaAvailable);
  const selectedRow = useUiStore((s) => s.selectedRow);
  const selectedCol = useUiStore((s) => s.selectedCol);
  const direction = useUiStore((s) => s.direction);

  const blackCount = cells.flat().filter(c => c.is_black).length;
  const blackPct = ((blackCount / (size * size)) * 100).toFixed(1);
  const wordCount = slots.length;
  const filledCount = slots.filter(s => s.pattern && !s.pattern.includes('_')).length;

  const isValid = validation?.is_valid ?? null;
  const errorCount = validation?.violations.filter(v => v.severity === 'Error').length ?? 0;
  const warnCount = validation?.violations.filter(v => v.severity === 'Warning').length ?? 0;

  return (
    <div className="status-bar">
      <span className="status-item">
        {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode
      </span>
      <span className="status-item">
        {size}×{size}
      </span>
      <span className="status-item">
        R{selectedRow + 1} C{selectedCol + 1} {direction}
      </span>
      <span className="status-item">
        {blackCount} black ({blackPct}%)
      </span>
      <span className="status-item">
        {wordCount} words
      </span>
      <span className="status-item">
        {filledCount}/{wordCount} filled
      </span>
      {symmetric && <span className="status-item status-sym">Sym</span>}
      {isAutofilling && <span className="status-item status-filling">Autofilling...</span>}
      {isValid !== null && (
        <span className={`status-item ${isValid ? 'status-valid' : 'status-invalid'}`}>
          {isValid ? 'Valid' : `${errorCount} errors`}
          {warnCount > 0 ? `, ${warnCount} warnings` : ''}
        </span>
      )}
      <span className={`status-item ${ollamaAvailable ? 'status-ai-on' : 'status-ai-off'}`}>
        AI: {ollamaAvailable ? 'Connected' : 'Offline'}
      </span>
    </div>
  );
}
