import { useRef, useEffect, useCallback } from 'react';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';

interface GridCanvasProps {
  width: number;
  height: number;
}

export function GridCanvas({ width, height }: GridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cells = usePuzzleStore((s) => s.cells);
  const size = usePuzzleStore((s) => s.size);
  const selectedRow = useUiStore((s) => s.selectedRow);
  const selectedCol = useUiStore((s) => s.selectedCol);
  const direction = useUiStore((s) => s.direction);
  const mode = useUiStore((s) => s.mode);
  const validation = useUiStore((s) => s.validation);

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

    // Get error cells from validation
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

    // Find word cells for highlight
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

        // Letter
        if (cell.letter) {
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
          ctx.strokeStyle = '#888';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Lock indicator
        if (cell.is_locked) {
          ctx.fillStyle = '#1a6b1a';
          ctx.fillRect(x + cellSize - 6, y + cellSize - 6, 4, 4);
        }
      }
    }

    // Grid outer border
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, cellSize * size, cellSize * size);
  }, [cells, size, selectedRow, selectedCol, direction, width, height, mode, validation]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cellSize = Math.min(width, height) / size;
      const offsetX = (width - cellSize * size) / 2;
      const offsetY = (height - cellSize * size) / 2;

      const col = Math.floor((e.clientX - rect.left - offsetX) / cellSize);
      const row = Math.floor((e.clientY - rect.top - offsetY) / cellSize);

      if (row >= 0 && row < size && col >= 0 && col < size) {
        const ui = useUiStore.getState();
        if (row === ui.selectedRow && col === ui.selectedCol) {
          ui.toggleDirection();
        } else {
          ui.selectCell(row, col);
        }
      }
    },
    [size, width, height]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cellSize = Math.min(width, height) / size;
      const offsetX = (width - cellSize * size) / 2;
      const offsetY = (height - cellSize * size) / 2;

      const col = Math.floor((e.clientX - rect.left - offsetX) / cellSize);
      const row = Math.floor((e.clientY - rect.top - offsetY) / cellSize);

      if (row >= 0 && row < size && col >= 0 && col < size) {
        usePuzzleStore.getState().toggleBlack(row, col);
      }
    },
    [size, width, height]
  );

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{ cursor: 'crosshair', display: 'block' }}
    />
  );
}
