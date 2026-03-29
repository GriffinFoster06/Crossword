import React from 'react';

interface Props {
  size: number;
  symmetric: boolean;
  mode: 'build' | 'fill' | 'solve';
  isAutofilling: boolean;
  onSizeChange: (size: number) => void;
  onSymmetryToggle: () => void;
  onModeChange: (mode: 'build' | 'fill' | 'solve') => void;
  onAutofill: () => void;
  onClearGrid: () => void;
  onNewPuzzle: () => void;
  onExport: () => void;
}

const btnStyle = (active?: boolean): React.CSSProperties => ({
  padding: '5px 12px',
  background: active ? '#4A90D9' : '#2a2a4a',
  color: active ? '#fff' : '#ccc',
  border: '1px solid ' + (active ? '#4A90D9' : '#444'),
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s',
});

export const Toolbar: React.FC<Props> = ({
  size, symmetric, mode, isAutofilling,
  onSizeChange, onSymmetryToggle, onModeChange,
  onAutofill, onClearGrid, onNewPuzzle, onExport
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 20px',
      background: '#0f0f1e',
      borderBottom: '2px solid #333',
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 18,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: -0.5,
        marginRight: 8,
      }}>
        ✏️ Crossword Builder
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#888' }}>Size:</span>
        {[9, 13, 15, 21].map(s => (
          <button key={s} style={btnStyle(size === s)} onClick={() => onSizeChange(s)}>
            {s}×{s}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 24, background: '#333' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#888' }}>Mode:</span>
        {(['build', 'fill', 'solve'] as const).map(m => (
          <button key={m} style={btnStyle(mode === m)} onClick={() => onModeChange(m)}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 24, background: '#333' }} />

      <button style={btnStyle(symmetric)} onClick={onSymmetryToggle}>
        {symmetric ? '↻ Symmetric' : '○ Free'}
      </button>

      <div style={{ width: 1, height: 24, background: '#333' }} />

      <button
        style={{ ...btnStyle(), background: isAutofilling ? '#2a4a2a' : '#1a3a1a', color: '#4CAF50', borderColor: '#2d5a2d' }}
        onClick={onAutofill}
        disabled={isAutofilling}
      >
        {isAutofilling ? '⟳ Filling...' : '⚡ Autofill'}
      </button>

      <button style={{ ...btnStyle(), color: '#f0a' }} onClick={onClearGrid}>
        🗑 Clear
      </button>

      <button style={{ ...btnStyle(), color: '#fa0' }} onClick={onNewPuzzle}>
        ✨ New
      </button>

      <button style={{ ...btnStyle(), color: '#0af' }} onClick={onExport}>
        ⬇ Export
      </button>
    </div>
  );
};
