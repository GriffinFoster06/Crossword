import { useEffect } from 'react';
import { useUiStore } from '../../stores/uiStore';

const SHORTCUTS = [
  { category: 'Navigation', items: [
    { keys: ['←', '→', '↑', '↓'], desc: 'Move cursor' },
    { keys: ['Tab'], desc: 'Next word' },
    { keys: ['Shift+Tab'], desc: 'Previous word' },
    { keys: ['Space'], desc: 'Toggle Across ↔ Down' },
    { keys: ['Click cell'], desc: 'Select cell / toggle direction' },
  ]},
  { category: 'Editing', items: [
    { keys: ['A–Z'], desc: 'Enter letter and advance cursor' },
    { keys: ['Backspace'], desc: 'Delete letter and move back' },
    { keys: ['.'], desc: 'Toggle black square' },
    { keys: ['Ctrl+Enter'], desc: 'Rebus entry (multi-letter cell)' },
    { keys: ['Right-click'], desc: 'Cell context menu (circle, shade, lock)' },
  ]},
  { category: 'File', items: [
    { keys: ['Ctrl+N'], desc: 'New puzzle' },
    { keys: ['Ctrl+O'], desc: 'Open puzzle' },
    { keys: ['Ctrl+S'], desc: 'Save puzzle' },
    { keys: ['Ctrl+E'], desc: 'Export dialog' },
  ]},
  { category: 'Editing History', items: [
    { keys: ['Ctrl+Z'], desc: 'Undo' },
    { keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], desc: 'Redo' },
  ]},
  { category: 'Interface', items: [
    { keys: ['?'], desc: 'Show this shortcut overlay' },
    { keys: ['Escape'], desc: 'Close dialogs / deselect' },
  ]},
];

export function ShortcutOverlay() {
  const setShowShortcutOverlay = useUiStore((s) => s.setShowShortcutOverlay);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowShortcutOverlay(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onClick={() => setShowShortcutOverlay(false)}>
      <div className="shortcut-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-overlay-header">
          <h2 className="shortcut-overlay-title">Keyboard Shortcuts</h2>
          <button className="shortcut-close-btn" onClick={() => setShowShortcutOverlay(false)}>✕</button>
        </div>
        <div className="shortcut-overlay-body">
          {SHORTCUTS.map((section) => (
            <div key={section.category} className="shortcut-section">
              <h3 className="shortcut-category">{section.category}</h3>
              <table className="shortcut-table">
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.desc} className="shortcut-row">
                      <td className="shortcut-keys">
                        {item.keys.map((k, i) => (
                          <span key={k}>
                            <kbd className="shortcut-kbd">{k}</kbd>
                            {i < item.keys.length - 1 && <span className="shortcut-or"> / </span>}
                          </span>
                        ))}
                      </td>
                      <td className="shortcut-desc">{item.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="shortcut-overlay-footer">
          Press <kbd className="shortcut-kbd">Esc</kbd> or click outside to close
        </div>
      </div>
    </div>
  );
}
