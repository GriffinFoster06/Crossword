import { useEffect } from 'react';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useUiStore } from '../stores/uiStore';

export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const puzzle = usePuzzleStore.getState();
      const ui = useUiStore.getState();
      const { selectedRow: row, selectedCol: col, direction, mode } = ui;
      const { size, cells } = puzzle;

      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // ── Global shortcuts (work even in inputs) ──────────────────────────
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        (usePuzzleStore as any).temporal?.getState()?.undo();
        return;
      }
      if ((meta && e.key === 'y') || (meta && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        (usePuzzleStore as any).temporal?.getState()?.redo();
        return;
      }
      if (meta && e.key === 's') {
        e.preventDefault();
        // Trigger save — dispatch a custom event the toolbar/App can catch
        window.dispatchEvent(new CustomEvent('crossforge:save'));
        return;
      }
      if (meta && e.key === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('crossforge:new'));
        return;
      }
      if (meta && e.key === 'o') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('crossforge:open'));
        return;
      }
      if (meta && e.key === 'e') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('crossforge:export'));
        return;
      }

      // Close context menu on any key
      if (ui.contextMenu) {
        ui.setContextMenu(null);
      }

      // Don't capture grid navigation when typing in inputs
      if (inInput) return;

      // ── Rebus mode (Ctrl+Enter or Enter when rebusMode active) ───────────
      if (e.key === 'Enter' && meta) {
        e.preventDefault();
        ui.setRebusMode(!ui.rebusMode);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        ui.setRebusMode(false);
        ui.setContextMenu(null);
        ui.setShowShortcutOverlay(false);
        return;
      }

      if (e.key === '?' && !meta) {
        e.preventDefault();
        ui.setShowShortcutOverlay(!ui.showShortcutOverlay);
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          if (direction !== 'Across') {
            ui.setDirection('Across');
          } else {
            ui.moveSelection(0, 1, size);
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (direction !== 'Across') {
            ui.setDirection('Across');
          } else {
            ui.moveSelection(0, -1, size);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (direction !== 'Down') {
            ui.setDirection('Down');
          } else {
            ui.moveSelection(1, 0, size);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (direction !== 'Down') {
            ui.setDirection('Down');
          } else {
            ui.moveSelection(-1, 0, size);
          }
          break;

        case ' ':
          e.preventDefault();
          ui.toggleDirection();
          break;

        case 'Tab':
          e.preventDefault();
          moveToNextWord(e.shiftKey ? -1 : 1, puzzle, ui);
          break;

        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          if (mode !== 'build' || !cells[row][col].is_black) {
            puzzle.setCell(row, col, null);
            ui.retreatCursor(size, cells);
          }
          break;

        case '.':
          if (mode === 'build') {
            e.preventDefault();
            puzzle.toggleBlack(row, col);
          }
          break;

        default:
          if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
            e.preventDefault();
            if (!cells[row][col].is_black) {
              puzzle.setCell(row, col, e.key.toUpperCase());
              ui.advanceCursor(size, cells);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

function moveToNextWord(
  dir: number,
  puzzle: { size: number; cells: { is_black: boolean; number: number | null }[][]; slots: { number: number; direction: string; row: number; col: number }[] },
  ui: { selectedRow: number; selectedCol: number; direction: string; selectCell: (r: number, c: number) => void; setDirection: (d: 'Across' | 'Down') => void }
) {
  const slots = puzzle.slots.filter(s => s.direction === ui.direction);
  if (slots.length === 0) return;

  const currentIdx = slots.findIndex(s => {
    if (s.direction === 'Across') {
      return s.row === ui.selectedRow && ui.selectedCol >= s.col && ui.selectedCol < s.col + (s as any).length;
    } else {
      return s.col === ui.selectedCol && ui.selectedRow >= s.row && ui.selectedRow < s.row + (s as any).length;
    }
  });

  let nextIdx: number;
  if (currentIdx < 0) {
    nextIdx = 0;
  } else {
    nextIdx = (currentIdx + dir + slots.length) % slots.length;
  }

  const next = slots[nextIdx];
  if (next) {
    ui.selectCell(next.row, next.col);
  }
}
