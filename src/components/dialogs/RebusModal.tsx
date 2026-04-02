import { useEffect, useRef, useState } from 'react';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';

/**
 * RebusModal — shown when rebusMode is true (toggled by Ctrl+Enter).
 * Allows entering multi-character content into a single cell (e.g. STAR, EST).
 * Commits on Enter, cancels on Escape.
 */
export function RebusModal() {
  const selectedRow = useUiStore((s) => s.selectedRow);
  const selectedCol = useUiStore((s) => s.selectedCol);
  const setRebusMode = useUiStore((s) => s.setRebusMode);
  const cells = usePuzzleStore((s) => s.cells);
  const setCell = usePuzzleStore((s) => s.setCell);
  const size = usePuzzleStore((s) => s.size);

  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  const cell = cells[selectedRow]?.[selectedCol];
  const existingRebus = cell?.rebus ?? '';
  const existingLetter = cell?.letter ? String(cell.letter) : '';

  useEffect(() => {
    // Pre-fill with whatever's in the cell
    setValue(existingRebus || existingLetter);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [selectedRow, selectedCol]);

  const commit = () => {
    const upper = value.toUpperCase().replace(/[^A-Z]/g, '');
    if (upper.length > 0) {
      // Use the setCell mechanism — for rebus we store via the store's rebus field
      const store = usePuzzleStore.getState();
      // Access the internal temporal store to set rebus
      store.setCellRebus(selectedRow, selectedCol, upper.length > 1 ? upper : upper[0]);
    }
    setRebusMode(false);
  };

  const cancel = () => {
    setRebusMode(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  if (selectedRow < 0 || selectedCol < 0 || selectedRow >= size || selectedCol >= size) {
    return null;
  }
  if (cell?.is_black) {
    setRebusMode(false);
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div className="rebus-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rebus-modal-header">
          <span className="rebus-modal-title">Rebus Entry</span>
          <span className="rebus-modal-hint">Cell ({selectedRow + 1}, {selectedCol + 1})</span>
        </div>
        <div className="rebus-modal-body">
          <p className="rebus-modal-desc">
            Enter multiple letters for this cell (e.g. <strong>STAR</strong>, <strong>EST</strong>).
            Single letter = normal entry.
          </p>
          <input
            ref={inputRef}
            className="rebus-modal-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Za-z]/g, ''))}
            onKeyDown={handleKeyDown}
            maxLength={8}
            autoFocus
            placeholder="Enter letters…"
            spellCheck={false}
          />
        </div>
        <div className="rebus-modal-footer">
          <button className="btn-secondary" onClick={cancel}>Cancel (Esc)</button>
          <button className="btn-primary" onClick={commit}>Confirm (Enter)</button>
        </div>
      </div>
    </div>
  );
}
