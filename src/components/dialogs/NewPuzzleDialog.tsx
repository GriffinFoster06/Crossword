import { useState } from 'react';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';

const GRID_SIZES = [
  { label: '15×15 (Daily NYT)', value: 15, desc: 'Standard Mon–Sat format' },
  { label: '21×21 (Sunday NYT)', value: 21, desc: 'Large Sunday format' },
  { label: '13×13 (Mini-ish)', value: 13, desc: 'Smaller themed puzzles' },
  { label: 'Custom', value: 0, desc: 'Choose any odd size 5–25' },
];

const TEMPLATES = [
  { id: 'blank', label: 'Blank Grid', desc: 'Start with an empty grid' },
  { id: 'open', label: 'Open Grid', desc: 'Clean open pattern, ~34 black squares' },
  { id: 'pinwheel', label: 'Pinwheel', desc: 'Classic pinwheel symmetry pattern' },
  { id: 'triple', label: 'Triple Stack', desc: 'Three 15-letter stack entries' },
];

export function NewPuzzleDialog() {
  const newPuzzle = usePuzzleStore((s) => s.newPuzzle);
  const setMetadata = usePuzzleStore((s) => s.setMetadata);
  const setValidation = useUiStore((s) => s.setValidation);
  const setShowNewPuzzleDialog = useUiStore((s) => s.setShowNewPuzzleDialog);
  const setCurrentFilePath = useUiStore((s) => s.setCurrentFilePath);
  const setIsDirty = useUiStore((s) => s.setIsDirty);

  const [sizePreset, setSizePreset] = useState(15);
  const [customSize, setCustomSize] = useState(15);
  const [template, setTemplate] = useState('blank');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [difficulty, setDifficulty] = useState<string>('');

  const resolvedSize = sizePreset === 0 ? customSize : sizePreset;

  const handleCreate = () => {
    newPuzzle(resolvedSize);
    if (title || author || difficulty) {
      setMetadata({
        title,
        author,
        difficulty: difficulty ? (difficulty as any) : null,
      });
    }
    setValidation(null);
    setCurrentFilePath(null);
    setIsDirty(false);
    setShowNewPuzzleDialog(false);
  };

  return (
    <div className="dialog-overlay" onClick={() => setShowNewPuzzleDialog(false)}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>New Puzzle</h2>
          <button className="dialog-close" onClick={() => setShowNewPuzzleDialog(false)}>✕</button>
        </div>

        <div className="dialog-body">
          <section className="dialog-section">
            <h3>Grid Size</h3>
            <div className="size-options">
              {GRID_SIZES.map(opt => (
                <label key={opt.value} className={`size-option ${sizePreset === opt.value ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="gridSize"
                    value={opt.value}
                    checked={sizePreset === opt.value}
                    onChange={() => setSizePreset(opt.value)}
                  />
                  <span className="size-label">{opt.label}</span>
                  <span className="size-desc">{opt.desc}</span>
                </label>
              ))}
            </div>
            {sizePreset === 0 && (
              <div className="custom-size">
                <label>
                  Custom size:
                  <input
                    type="number"
                    min={5}
                    max={25}
                    step={2}
                    value={customSize}
                    onChange={e => setCustomSize(Math.max(5, Math.min(25, Number(e.target.value))))}
                    className="size-input"
                  />
                  <span>×{customSize}</span>
                </label>
              </div>
            )}
          </section>

          <section className="dialog-section">
            <h3>Template</h3>
            <div className="template-options">
              {TEMPLATES.map(t => (
                <label key={t.id} className={`template-option ${template === t.id ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="template"
                    value={t.id}
                    checked={template === t.id}
                    onChange={() => setTemplate(t.id)}
                  />
                  <span className="template-label">{t.label}</span>
                  <span className="template-desc">{t.desc}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="dialog-section">
            <h3>Metadata (optional)</h3>
            <div className="meta-fields">
              <label>
                Title
                <input
                  type="text"
                  placeholder="Puzzle title..."
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="meta-input"
                />
              </label>
              <label>
                Author
                <input
                  type="text"
                  placeholder="Your name..."
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  className="meta-input"
                />
              </label>
              <label>
                Target Difficulty
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="meta-select">
                  <option value="">Not set</option>
                  <option value="Monday">Monday (easiest)</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday (hardest)</option>
                  <option value="Sunday">Sunday (large themed)</option>
                </select>
              </label>
            </div>
          </section>
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={() => setShowNewPuzzleDialog(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCreate}>
            Create {resolvedSize}×{resolvedSize} Puzzle
          </button>
        </div>
      </div>
    </div>
  );
}
