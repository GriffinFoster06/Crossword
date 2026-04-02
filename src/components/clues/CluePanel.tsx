import { useMemo, useRef, useEffect, useState } from 'react';
import { usePuzzleStore, type WordSlotInfo } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';
import { generateClues } from '../../lib/tauriCommands';
import type { Direction } from '../../types/crossword';

export function CluePanel() {
  const slots = usePuzzleStore((s) => s.slots);
  const clues = usePuzzleStore((s) => s.clues);
  const setClue = usePuzzleStore((s) => s.setClue);
  const selectedRow = useUiStore((s) => s.selectedRow);
  const selectedCol = useUiStore((s) => s.selectedCol);
  const direction = useUiStore((s) => s.direction);
  const selectCell = useUiStore((s) => s.selectCell);
  const setDirection = useUiStore((s) => s.setDirection);
  const ollamaAvailable = useUiStore((s) => s.ollamaAvailable);

  const acrossSlots = useMemo(() => slots.filter(s => s.direction === 'Across'), [slots]);
  const downSlots = useMemo(() => slots.filter(s => s.direction === 'Down'), [slots]);

  const activeSlot = useMemo(() => {
    return slots.find(s => {
      if (s.direction !== direction) return false;
      for (const [r, c] of s.cells) {
        if (r === selectedRow && c === selectedCol) return true;
      }
      return false;
    });
  }, [slots, selectedRow, selectedCol, direction]);

  return (
    <div className="clue-panel">
      <h3 className="panel-title">Clues</h3>
      <div className="clue-columns">
        <ClueList
          title="ACROSS"
          direction="Across"
          slots={acrossSlots}
          clues={clues.across}
          activeSlot={activeSlot}
          onClueClick={(slot) => { selectCell(slot.row, slot.col); setDirection('Across'); }}
          onClueChange={(num, text) => setClue(num, 'Across', text)}
          ollamaAvailable={ollamaAvailable}
        />
        <ClueList
          title="DOWN"
          direction="Down"
          slots={downSlots}
          clues={clues.down}
          activeSlot={activeSlot}
          onClueClick={(slot) => { selectCell(slot.row, slot.col); setDirection('Down'); }}
          onClueChange={(num, text) => setClue(num, 'Down', text)}
          ollamaAvailable={ollamaAvailable}
        />
      </div>
    </div>
  );
}

interface ClueListProps {
  title: string;
  direction: Direction;
  slots: WordSlotInfo[];
  clues: { number: number; text: string }[];
  activeSlot: WordSlotInfo | undefined;
  onClueClick: (slot: WordSlotInfo) => void;
  onClueChange: (number: number, text: string) => void;
  ollamaAvailable: boolean;
}

function ClueList({ title, direction, slots, clues, activeSlot, onClueClick, onClueChange, ollamaAvailable }: ClueListProps) {
  const activeRef = useRef<HTMLDivElement>(null);
  const [suggestingFor, setSuggestingFor] = useState<number | null>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeSlot]);

  const handleAiSuggest = async (e: React.MouseEvent, slot: WordSlotInfo) => {
    e.stopPropagation();
    if (!ollamaAvailable) return;
    setSuggestingFor(slot.number);
    try {
      const answer = slot.pattern.replace(/_/g, '');
      if (!answer || answer.length < 3) return;
      const candidates = await generateClues(answer, 3); // 3 = Wednesday difficulty
      if (candidates?.length) {
        onClueChange(slot.number, candidates[0].text);
      }
    } catch (e) {
      console.error('AI suggest failed:', e);
    } finally {
      setSuggestingFor(null);
    }
  };

  return (
    <div className="clue-list">
      <div className="clue-list-header">{title}</div>
      <div className="clue-list-body">
        {slots.map((slot) => {
          const clue = clues.find(c => c.number === slot.number);
          const isActive = activeSlot?.number === slot.number && activeSlot?.direction === direction;
          const text = clue?.text || '';
          const isFilled = !slot.pattern.includes('_');

          return (
            <div
              key={`${direction}-${slot.number}`}
              ref={isActive ? activeRef : null}
              className={`clue-item ${isActive ? 'clue-active' : ''}`}
              onClick={() => onClueClick(slot)}
            >
              <span className="clue-number">{slot.number}</span>
              <div className="clue-content">
                <div className="clue-meta">
                  <span className="clue-pattern">{slot.pattern}</span>
                  {text.length > 0 && (
                    <span className="clue-char-count">{text.length}</span>
                  )}
                  {ollamaAvailable && isFilled && (
                    <button
                      className="clue-ai-btn"
                      onClick={(e) => handleAiSuggest(e, slot)}
                      disabled={suggestingFor === slot.number}
                      title="AI suggest clue"
                    >
                      {suggestingFor === slot.number ? '…' : '✦'}
                    </button>
                  )}
                </div>
                <input
                  className="clue-input"
                  type="text"
                  placeholder="Enter clue..."
                  value={text}
                  onChange={(e) => onClueChange(slot.number, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
