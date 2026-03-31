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

      // Don't capture when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

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
          // Move to next/previous word
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

        case 'Escape':
          e.preventDefault();
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

  // Find current slot
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
