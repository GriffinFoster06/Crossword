import React, { useCallback } from 'react';
import { Cell, Direction } from '../types/crossword';
import { getWordAt } from '../utils/crosswordUtils';

interface Props {
  grid: Cell[][];
  size: number;
  selectedRow: number;
  selectedCol: number;
  direction: Direction;
  mode: 'build' | 'fill' | 'solve';
  onCellClick: (row: number, col: number) => void;
  onCellRightClick: (row: number, col: number) => void;
}

export const CrosswordGrid: React.FC<Props> = ({
  grid, size, selectedRow, selectedCol, direction, mode, onCellClick, onCellRightClick
}) => {
  const wordInfo = selectedRow >= 0 && selectedCol >= 0
    ? getWordAt(grid, selectedRow, selectedCol, direction)
    : null;

  const isInCurrentWord = useCallback((row: number, col: number): boolean => {
    if (!wordInfo) return false;
    if (direction === 'across') {
      return row === wordInfo.startRow &&
        col >= wordInfo.startCol &&
        col < wordInfo.startCol + wordInfo.length;
    } else {
      return col === wordInfo.startCol &&
        row >= wordInfo.startRow &&
        row < wordInfo.startRow + wordInfo.length;
    }
  }, [wordInfo, direction]);

  const cellSize = Math.min(Math.floor(560 / size), 42);

  return (
    <div
      style={{
        display: 'inline-block',
        border: '2px solid #000',
        backgroundColor: '#000',
        gap: '1px',
        userSelect: 'none',
      }}
    >
      {grid.map((row, r) => (
        <div key={r} style={{ display: 'flex' }}>
          {row.map((cell, c) => {
            const isSelected = r === selectedRow && c === selectedCol;
            const inWord = isInCurrentWord(r, c);
            let bg = '#fff';
            if (cell.isBlack) bg = '#000';
            else if (isSelected) bg = '#4A90D9';
            else if (inWord) bg = '#B8D4F0';

            return (
              <div
                key={c}
                onClick={() => onCellClick(r, c)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onCellRightClick(r, c);
                }}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: bg,
                  border: '1px solid #000',
                  position: 'relative',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {cell.number && !cell.isBlack && (
                  <span style={{
                    position: 'absolute',
                    top: 1,
                    left: 2,
                    fontSize: Math.max(7, cellSize * 0.22),
                    lineHeight: 1,
                    color: isSelected ? '#fff' : '#333',
                    fontWeight: 600,
                    pointerEvents: 'none',
                  }}>
                    {cell.number}
                  </span>
                )}
                {!cell.isBlack && cell.letter && (
                  <span style={{
                    fontSize: Math.max(12, cellSize * 0.55),
                    fontWeight: 'bold',
                    color: isSelected ? '#fff' : '#000',
                    pointerEvents: 'none',
                    lineHeight: 1,
                  }}>
                    {cell.letter}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
