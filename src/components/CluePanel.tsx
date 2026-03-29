import React, { useEffect, useRef } from 'react';
import { ClueEntry, Direction } from '../types/crossword';

interface Props {
  entries: ClueEntry[];
  direction: Direction;
  activeNumber: number | null;
  activeDirection: Direction;
  clues: Record<number, string>;
  onClueClick: (number: number, direction: Direction) => void;
  onClueChange: (number: number, direction: Direction, clue: string) => void;
}

export const CluePanel: React.FC<Props> = ({
  entries, direction, activeNumber, activeDirection, clues, onClueClick, onClueChange
}) => {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeNumber, activeDirection]);

  const label = direction === 'across' ? 'ACROSS' : 'DOWN';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 12px',
        background: '#2a2a4a',
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: 1,
        color: '#aaa',
        borderBottom: '1px solid #444',
      }}>
        {label}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {entries.map(entry => {
          const isActive = activeNumber === entry.number && activeDirection === direction;
          return (
            <div
              key={entry.number}
              ref={isActive ? activeRef : null}
              onClick={() => onClueClick(entry.number, direction)}
              style={{
                padding: '5px 12px',
                cursor: 'pointer',
                background: isActive ? '#2d5a9e' : 'transparent',
                borderLeft: isActive ? '3px solid #4A90D9' : '3px solid transparent',
                transition: 'background 0.1s',
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{
                  fontWeight: 700,
                  fontSize: 12,
                  color: isActive ? '#fff' : '#888',
                  minWidth: 24,
                  paddingTop: 2,
                }}>
                  {entry.number}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: isActive ? '#cce' : '#666',
                    marginBottom: 2,
                  }}>
                    {entry.answer.split('').join(' ') || '_ '.repeat(entry.length).trim()}
                  </div>
                  <input
                    value={clues[entry.number] || ''}
                    onChange={e => onClueChange(entry.number, direction, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    placeholder="Enter clue..."
                    style={{
                      width: '100%',
                      background: isActive ? '#1a3a6e' : '#1a1a2e',
                      border: '1px solid ' + (isActive ? '#4A90D9' : '#333'),
                      color: '#e0e0e0',
                      padding: '2px 4px',
                      fontSize: 12,
                      borderRadius: 2,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
