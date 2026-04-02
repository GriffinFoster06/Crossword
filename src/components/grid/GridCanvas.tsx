import { useRef, useEffect, useCallback, useState } from 'react';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';

interface GridCanvasProps {
  width: number;
  height: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  row: number;
  col: number;
}

export function GridCanvas({ width, height }: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cells = usePuzzleStore((s) => s.cells);
  const slots = usePuzzleStore((s) => s.slots);
  const size = usePuzzleStore((s) => s.size);
  const toggleBlack = usePuzzleStore((s) => s.toggleBlack);
  const toggleCircle = usePuzzleStore((s) => s.toggleCircle);
  const toggleShade = usePuzzleStore((s) => s.toggleShade);
  const toggleLock = usePuzzleStore((s) => s.toggleLock);
  const selectedRow = useUiStore((s) => s.selectedRow);
  const selectedCol = useUiStore((s) => s.selectedCol);
  const direction = useUiStore((s) => s.direction);
  const mode = useUiStore((s) => s.mode);
  const validation = useUiStore((s) => s.validation);
  const showHeatMap = useUiStore((s) => s.showHeatMap);
  const ghostWord = useUiStore((s) => s.ghostWord);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Build heat map: map from "row,col" -> slot quality (0-100)
  // Uses the number of filled letters in slot as a proxy score
  const heatMap = useCallback(() => {
    if (!showHeatMap) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const slot of slots) {
      // Score = percentage of slot that is filled
      const filled = slot.pattern.split('').filter(c => c !== '_').length;
      const pct = slot.length > 0 ? (filled / slot.length) * 100 : 0;
      for (const [r, c] of slot.cells) {
        const key = `${r},${c}`;
        const existing = map.get(key) ?? 0;
        // Use worst score from either direction
        map.set(key, Math.min(existing || 100, pct));
      }
    }
    return map;
  }, [slots, showHeatMap]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const cellSize = Math.min(width, height) / size;
    const offsetX = (width - cellSize * size) / 2;
    const offsetY = (height - cellSize * size) / 2;

    const errorCells = new Set<string>();
    if (validation) {
      for (const v of validation.violations) {
        if (v.severity === 'Error') {
          for (const [r, c] of v.cells) {
            errorCells.add(`${r},${c}`);
          }
        }
      }
    }

    const wordCells = new Set<string>();
    if (selectedRow >= 0 && selectedCol >= 0) {
      if (direction === 'Across') {
        let c = selectedCol;
        while (c >= 0 && !cells[selectedRow][c].is_black) c--;
        c++;
        while (c < size && !cells[selectedRow][c].is_black) {
          wordCells.add(`${selectedRow},${c}`);
          c++;
        }
      } else {
        let r = selectedRow;
        while (r >= 0 && !cells[r][selectedCol].is_black) r--;
        r++;
        while (r < size && !cells[r][selectedCol].is_black) {
          wordCells.add(`${r},${selectedCol}`);
          r++;
        }
      }
    }

    const heat = heatMap();

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const cell = cells[row][col];
        const x = offsetX + col * cellSize;
        const y = offsetY + row * cellSize;
        const key = `${row},${col}`;

        // Cell background
        if (cell.is_black) {
          ctx.fillStyle = '#1a1a2e';
        } else if (row === selectedRow && col === selectedCol) {
          ctx.fillStyle = '#4A90D9';
        } else if (wordCells.has(key)) {
          ctx.fillStyle = '#2a3f5f';
        } else if (cell.is_shaded) {
          ctx.fillStyle = '#3a3a4a';
        } else {
          ctx.fillStyle = '#ffffff';
        }
        ctx.fillRect(x, y, cellSize, cellSize);

        // Heat map overlay
        if (showHeatMap && !cell.is_black && row !== selectedRow || col !== selectedCol) {
          const score = heat.get(key);
          if (score !== undefined) {
            let heatColor: string;
            if (score >= 80) {
              heatColor = 'rgba(40, 180, 80, 0.25)'; // green = well-filled
            } else if (score >= 50) {
              heatColor = 'rgba(255, 200, 40, 0.25)'; // yellow
            } else if (score >= 25) {
              heatColor = 'rgba(255, 120, 40, 0.3)'; // orange
            } else {
              heatColor = 'rgba(255, 50, 50, 0.3)'; // red = mostly empty
            }
            ctx.fillStyle = heatColor;
            ctx.fillRect(x, y, cellSize, cellSize);
          }
        }

        // Error highlight
        if (errorCells.has(key)) {
          ctx.fillStyle = 'rgba(255, 60, 60, 0.2)';
          ctx.fillRect(x, y, cellSize, cellSize);
        }

        // Cell border
        ctx.strokeStyle = cell.is_black ? '#2a2a3e' : '#333';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);

        if (cell.is_black) continue;

        // Cell number
        if (cell.number != null) {
          ctx.fillStyle = row === selectedRow && col === selectedCol ? '#fff' : '#333';
          ctx.font = `${Math.max(8, cellSize * 0.22)}px -apple-system, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(String(cell.number), x + 2, y + 1);
        }

        // Letter (handle rebus: multiple chars)
        if (cell.rebus) {
          const isSelected = row === selectedRow && col === selectedCol;
          ctx.fillStyle = isSelected ? '#fff' : cell.is_locked ? '#1a6b1a' : '#111';
          const fontSize = Math.max(6, cellSize * 0.28);
          ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell.rebus, x + cellSize / 2, y + cellSize / 2 + cellSize * 0.05);
        } else if (cell.letter) {
          const isSelected = row === selectedRow && col === selectedCol;
          ctx.fillStyle = isSelected ? '#fff' : cell.is_locked ? '#1a6b1a' : '#111';
          ctx.font = `bold ${cellSize * 0.55}px -apple-system, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell.letter, x + cellSize / 2, y + cellSize / 2 + cellSize * 0.05);
        }

        // Circle
        if (cell.is_circled) {
          ctx.beginPath();
          ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.42, 0, Math.PI * 2);
          ctx.strokeStyle = row === selectedRow && col === selectedCol ? '#fff' : '#888';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Lock indicator (small dot, bottom-right)
        if (cell.is_locked) {
          ctx.fillStyle = '#1a6b1a';
          ctx.fillRect(x + cellSize - 6, y + cellSize - 6, 4, 4);
        }
      }
    }

    // Ghost word preview (hovered from WordPanel)
    if (ghostWord) {
      // Find the active slot
      const activeSlot = slots.find(s => {
        if (s.direction !== direction) return false;
        for (const [r, c] of s.cells) {
          if (r === selectedRow && c === selectedCol) return true;
        }
        return false;
      });
      if (activeSlot && ghostWord.length === activeSlot.cells.length) {
        for (let i = 0; i < ghostWord.length; i++) {
          const [gr, gc] = activeSlot.cells[i];
          const cell = cells[gr][gc];
          if (cell.is_black || cell.letter) continue; // don't ghost over existing letters
          const gx = offsetX + gc * cellSize;
          const gy = offsetY + gr * cellSize;
          ctx.fillStyle = 'rgba(74, 144, 217, 0.45)';
          ctx.font = `bold ${cellSize * 0.55}px -apple-system, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ghostWord[i], gx + cellSize / 2, gy + cellSize / 2 + cellSize * 0.05);
        }
      }
    }

    // Grid outer border
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, cellSize * size, cellSize * size);
  }, [cells, slots, size, selectedRow, selectedCol, direction, width, height, mode, validation, showHeatMap, heatMap, ghostWord]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getCellFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const cellSize = Math.min(width, height) / size;
      const offsetX = (width - cellSize * size) / 2;
      const offsetY = (height - cellSize * size) / 2;
      const col = Math.floor((e.clientX - rect.left - offsetX) / cellSize);
      const row = Math.floor((e.clientY - rect.top - offsetY) / cellSize);
      if (row >= 0 && row < size && col >= 0 && col < size) return [row, col];
      return null;
    },
    [size, width, height]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      setContextMenu(null);
      const cell = getCellFromEvent(e);
      if (!cell) return;
      const [row, col] = cell;
      const ui = useUiStore.getState();
      if (row === ui.selectedRow && col === ui.selectedCol) {
        ui.toggleDirection();
      } else {
        ui.selectCell(row, col);
      }
    },
    [getCellFromEvent]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const cell = getCellFromEvent(e);
      if (!cell) return;
      const [row, col] = cell;
      useUiStore.getState().selectCell(row, col);
      setContextMenu({ x: e.clientX, y: e.clientY, row, col });
    },
    [getCellFromEvent]
  );

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{ cursor: 'crosshair', display: 'block' }}
      />
      {contextMenu && (
        <CellContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          row={contextMenu.row}
          col={contextMenu.col}
          onClose={() => setContextMenu(null)}
          toggleBlack={toggleBlack}
          toggleCircle={toggleCircle}
          toggleShade={toggleShade}
          toggleLock={toggleLock}
          cells={cells}
        />
      )}
    </div>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  row: number;
  col: number;
  onClose: () => void;
  toggleBlack: (r: number, c: number) => void;
  toggleCircle: (r: number, c: number) => void;
  toggleShade: (r: number, c: number) => void;
  toggleLock: (r: number, c: number) => void;
  cells: { is_black: boolean; is_circled: boolean; is_shaded: boolean; is_locked: boolean }[][];
}

function CellContextMenu({
  x, y, row, col, onClose,
  toggleBlack, toggleCircle, toggleShade, toggleLock, cells,
}: ContextMenuProps) {
  const cell = cells[row]?.[col];
  if (!cell) return null;

  const items = [
    {
      label: cell.is_black ? 'Remove Black Square' : 'Make Black Square',
      action: () => toggleBlack(row, col),
    },
    ...(!cell.is_black ? [
      {
        label: cell.is_circled ? 'Remove Circle' : 'Add Circle',
        action: () => toggleCircle(row, col),
      },
      {
        label: cell.is_shaded ? 'Remove Shade' : 'Add Shade',
        action: () => toggleShade(row, col),
      },
      {
        label: cell.is_locked ? 'Unlock Cell' : 'Lock Cell',
        action: () => toggleLock(row, col),
      },
    ] : []),
  ];

  // Keep menu within viewport
  const menuWidth = 200;
  const menuHeight = items.length * 36 + 8;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      className="context-menu"
      style={{ position: 'fixed', left: adjustedX, top: adjustedY, zIndex: 1000 }}
      onClick={e => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className="context-menu-item"
          onClick={() => { item.action(); onClose(); }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
