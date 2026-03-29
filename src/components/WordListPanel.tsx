import React, { useState, useMemo } from 'react';
import { WordEntry, WordIndex, findMatches } from '../utils/wordDatabase';

interface Props {
  pattern: string;
  wordIndex: WordIndex;
  onWordSelect: (word: string) => void;
}

export const WordListPanel: React.FC<Props> = ({ pattern, wordIndex, onWordSelect }) => {
  const [filter, setFilter] = useState('');

  const matches = useMemo(() => {
    if (!pattern || pattern.length < 2) return [] as WordEntry[];
    return findMatches(pattern, wordIndex);
  }, [pattern, wordIndex]);

  const filtered = useMemo(() => {
    if (!filter) return matches.slice(0, 50);
    return matches.filter(w => w.word.toLowerCase().includes(filter.toLowerCase())).slice(0, 50);
  }, [matches, filter]);

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
        WORD LIST
      </div>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
          Pattern: <span style={{ fontFamily: 'monospace', color: '#4A90D9' }}>
            {pattern || '(no selection)'}
          </span>
          {matches.length > 0 && (
            <span style={{ color: '#666', marginLeft: 8 }}>
              {matches.length} match{matches.length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter words..."
          style={{
            width: '100%',
            background: '#1a1a2e',
            border: '1px solid #444',
            color: '#e0e0e0',
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 3,
            outline: 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {filtered.length === 0 && pattern && (
          <div style={{ padding: '12px', color: '#666', fontSize: 12, textAlign: 'center' }}>
            No matches found
          </div>
        )}
        {filtered.map((entry, i) => (
          <div
            key={i}
            onClick={() => onWordSelect(entry.word)}
            style={{
              padding: '4px 12px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 13,
              fontFamily: 'monospace',
              color: '#e0e0e0',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2a2a4a')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span>{entry.word}</span>
            <span style={{
              fontSize: 10,
              color: entry.score >= 80 ? '#4CAF50' : entry.score >= 60 ? '#FFC107' : '#888',
              fontWeight: 600,
            }}>
              {entry.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
