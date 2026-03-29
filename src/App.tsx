import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Cell, Direction, ClueEntry } from './types/crossword';
import { CrosswordGrid } from './components/CrosswordGrid';
import { CluePanel } from './components/CluePanel';
import { WordListPanel } from './components/WordListPanel';
import { Toolbar } from './components/Toolbar';
import {
  computeNumbers, toggleBlack, getWordAt, getWordEntries, createEmptyGrid
} from './utils/crosswordUtils';
import { buildIndex, WORD_LIST } from './utils/wordDatabase';
import { autofill } from './utils/autofill';

function initGrid(size: number): Cell[][] {
  return computeNumbers(createEmptyGrid(size));
}

export default function App() {
  const [size, setSize] = useState(15);
  const [grid, setGrid] = useState<Cell[][]>(() => initGrid(15));
  const [selectedRow, setSelectedRow] = useState(0);
  const [selectedCol, setSelectedCol] = useState(0);
  const [direction, setDirection] = useState<Direction>('across');
  const [mode, setMode] = useState<'build' | 'fill' | 'solve'>('build');
  const [symmetric, setSymmetric] = useState(true);
  const [acrossClues, setAcrossClues] = useState<Record<number, string>>({});
  const [downClues, setDownClues] = useState<Record<number, string>>({});
  const [isAutofilling, setIsAutofilling] = useState(false);

  const wordIndex = useMemo(() => buildIndex(WORD_LIST), []);

  const entries = useMemo(() => getWordEntries(grid), [grid]);
  const acrossEntries = useMemo(() => entries.filter(e => e.direction === 'across'), [entries]);
  const downEntries = useMemo(() => entries.filter(e => e.direction === 'down'), [entries]);

  const acrossEntriesWithClues = useMemo(() =>
    acrossEntries.map(e => ({ ...e, clue: acrossClues[e.number] || '' })),
    [acrossEntries, acrossClues]
  );
  const downEntriesWithClues = useMemo(() =>
    downEntries.map(e => ({ ...e, clue: downClues[e.number] || '' })),
    [downEntries, downClues]
  );

  const activeWordInfo = useMemo(() => {
    if (selectedRow < 0 || selectedCol < 0 || grid[selectedRow][selectedCol].isBlack) return null;
    return getWordAt(grid, selectedRow, selectedCol, direction);
  }, [grid, selectedRow, selectedCol, direction]);

  const activeNumber = useMemo(() => {
    if (!activeWordInfo) return null;
    return grid[activeWordInfo.startRow][activeWordInfo.startCol].number ?? null;
  }, [grid, activeWordInfo]);

  const currentPattern = useMemo(() => {
    if (!activeWordInfo) return '';
    const { startRow, startCol, length } = activeWordInfo;
    let pat = '';
    for (let i = 0; i < length; i++) {
      const r = direction === 'down' ? startRow + i : startRow;
      const c = direction === 'across' ? startCol + i : startCol;
      pat += grid[r][c].letter || '_';
    }
    return pat;
  }, [grid, activeWordInfo, direction]);

  const moveInWord = useCallback((forward: boolean) => {
    const wordInfo = getWordAt(grid, selectedRow, selectedCol, direction);
    if (!wordInfo) return;
    const { startRow, startCol, length } = wordInfo;
    if (direction === 'across') {
      const newCol = forward
        ? Math.min(startCol + length - 1, selectedCol + 1)
        : Math.max(startCol, selectedCol - 1);
      setSelectedCol(newCol);
    } else {
      const newRow = forward
        ? Math.min(startRow + length - 1, selectedRow + 1)
        : Math.max(startRow, selectedRow - 1);
      setSelectedRow(newRow);
    }
  }, [grid, selectedRow, selectedCol, direction]);

  const moveToNextWord = useCallback((forward: boolean) => {
    const currentEntries = direction === 'across' ? acrossEntries : downEntries;
    const wordInfo = getWordAt(grid, selectedRow, selectedCol, direction);
    if (!wordInfo) return;
    const idx = currentEntries.findIndex(
      e => e.startRow === wordInfo.startRow && e.startCol === wordInfo.startCol
    );
    if (idx === -1) return;
    const nextIdx = forward
      ? (idx + 1) % currentEntries.length
      : (idx - 1 + currentEntries.length) % currentEntries.length;
    const next = currentEntries[nextIdx];
    setSelectedRow(next.startRow);
    setSelectedCol(next.startCol);
  }, [grid, selectedRow, selectedCol, direction, acrossEntries, downEntries]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (grid[row][col].isBlack && mode === 'build') {
      const newGrid = toggleBlack(grid, row, col, size, symmetric);
      setGrid(newGrid);
      return;
    }
    if (grid[row][col].isBlack) return;
    if (row === selectedRow && col === selectedCol) {
      setDirection(d => d === 'across' ? 'down' : 'across');
    } else {
      setSelectedRow(row);
      setSelectedCol(col);
    }
  }, [grid, mode, size, symmetric, selectedRow, selectedCol]);

  const handleCellRightClick = useCallback((row: number, col: number) => {
    if (mode !== 'build') return;
    const newGrid = toggleBlack(grid, row, col, size, symmetric);
    setGrid(newGrid);
  }, [grid, mode, size, symmetric]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const { key } = e;

      if (key === 'ArrowRight') {
        e.preventDefault();
        if (direction === 'across') moveInWord(true);
        else { setDirection('across'); }
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        if (direction === 'across') moveInWord(false);
        else { setDirection('across'); }
      } else if (key === 'ArrowDown') {
        e.preventDefault();
        if (direction === 'down') moveInWord(true);
        else { setDirection('down'); }
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        if (direction === 'down') moveInWord(false);
        else { setDirection('down'); }
      } else if (key === 'Tab') {
        e.preventDefault();
        moveToNextWord(!e.shiftKey);
      } else if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault();
        if (mode === 'fill' || mode === 'solve') {
          const newGrid = grid.map(r => r.map(c => ({ ...c })));
          if (newGrid[selectedRow][selectedCol].letter) {
            newGrid[selectedRow][selectedCol].letter = '';
          } else {
            moveInWord(false);
          }
          setGrid(newGrid);
        }
      } else if (key === ' ') {
        e.preventDefault();
        setDirection(d => d === 'across' ? 'down' : 'across');
      } else if (key === '.') {
        if (mode === 'build') {
          e.preventDefault();
          const newGrid = toggleBlack(grid, selectedRow, selectedCol, size, symmetric);
          setGrid(newGrid);
          moveInWord(true);
        }
      } else if (key.length === 1 && key.match(/[a-zA-Z]/)) {
        if (mode !== 'solve') {
          e.preventDefault();
          const newGrid = grid.map(r => r.map(c => ({ ...c })));
          if (!newGrid[selectedRow][selectedCol].isBlack) {
            newGrid[selectedRow][selectedCol].letter = key.toUpperCase();
            setGrid(newGrid);
            moveInWord(true);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [grid, selectedRow, selectedCol, direction, mode, size, symmetric, moveInWord, moveToNextWord]);

  const handleClueClick = useCallback((number: number, dir: Direction) => {
    const list = dir === 'across' ? acrossEntries : downEntries;
    const entry = list.find(e => e.number === number);
    if (entry) {
      setSelectedRow(entry.startRow);
      setSelectedCol(entry.startCol);
      setDirection(dir);
    }
  }, [acrossEntries, downEntries]);

  const handleClueChange = useCallback((number: number, dir: Direction, clue: string) => {
    if (dir === 'across') {
      setAcrossClues(prev => ({ ...prev, [number]: clue }));
    } else {
      setDownClues(prev => ({ ...prev, [number]: clue }));
    }
  }, []);

  const handleWordSelect = useCallback((word: string) => {
    if (!activeWordInfo) return;
    const { startRow, startCol, length } = activeWordInfo;
    const newGrid = grid.map(r => r.map(c => ({ ...c })));
    for (let i = 0; i < length && i < word.length; i++) {
      const r = direction === 'down' ? startRow + i : startRow;
      const c = direction === 'across' ? startCol + i : startCol;
      newGrid[r][c].letter = word[i];
    }
    setGrid(newGrid);
  }, [grid, activeWordInfo, direction]);

  const handleSizeChange = useCallback((newSize: number) => {
    setSize(newSize);
    setGrid(initGrid(newSize));
    setSelectedRow(0);
    setSelectedCol(0);
    setAcrossClues({});
    setDownClues({});
  }, []);

  const handleClearGrid = useCallback(() => {
    setGrid(prev => computeNumbers(prev.map(row => row.map(cell => ({ ...cell, letter: '' })))));
  }, []);

  const handleNewPuzzle = useCallback(() => {
    setGrid(initGrid(size));
    setAcrossClues({});
    setDownClues({});
    setSelectedRow(0);
    setSelectedCol(0);
  }, [size]);

  const handleAutofill = useCallback(async () => {
    setIsAutofilling(true);
    try {
      const result = await autofill(grid, wordIndex, (g) => setGrid(g));
      setGrid(result);
    } finally {
      setIsAutofilling(false);
    }
  }, [grid, wordIndex]);

  const handleExport = useCallback(() => {
    const data = {
      size,
      grid: grid.map(row => row.map(cell => ({
        letter: cell.letter,
        isBlack: cell.isBlack,
        number: cell.number,
      }))),
      clues: {
        across: acrossEntriesWithClues.map((e: ClueEntry) => ({ number: e.number, clue: e.clue, answer: e.answer })),
        down: downEntriesWithClues.map((e: ClueEntry) => ({ number: e.number, clue: e.clue, answer: e.answer })),
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crossword.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [size, grid, acrossEntriesWithClues, downEntriesWithClues]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#1a1a2e' }}>
      <Toolbar
        size={size}
        symmetric={symmetric}
        mode={mode}
        isAutofilling={isAutofilling}
        onSizeChange={handleSizeChange}
        onSymmetryToggle={() => setSymmetric(s => !s)}
        onModeChange={setMode}
        onAutofill={handleAutofill}
        onClearGrid={handleClearGrid}
        onNewPuzzle={handleNewPuzzle}
        onExport={handleExport}
      />

      <div style={{
        display: 'flex',
        flex: 1,
        gap: 0,
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Left: Across clues */}
        <div style={{
          width: 240,
          background: '#16162a',
          borderRight: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <CluePanel
            entries={acrossEntriesWithClues}
            direction="across"
            activeNumber={activeNumber}
            activeDirection={direction}
            clues={acrossClues}
            onClueClick={handleClueClick}
            onClueChange={handleClueChange}
          />
        </div>

        {/* Center: Grid */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          overflow: 'auto',
          background: '#1a1a2e',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <CrosswordGrid
              grid={grid}
              size={size}
              selectedRow={selectedRow}
              selectedCol={selectedCol}
              direction={direction}
              mode={mode}
              onCellClick={handleCellClick}
              onCellRightClick={handleCellRightClick}
            />
            <div style={{ fontSize: 12, color: '#555', textAlign: 'center' }}>
              Click cell to select • Click again to switch direction • Right-click to toggle black •{' '}
              Type letters • Tab = next word • '.' = toggle black (build mode)
            </div>
          </div>
        </div>

        {/* Right: Word list + Down clues */}
        <div style={{
          width: 240,
          background: '#16162a',
          borderLeft: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ flex: '0 0 220px', borderBottom: '1px solid #333', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <WordListPanel
              pattern={currentPattern}
              wordIndex={wordIndex}
              onWordSelect={handleWordSelect}
            />
          </div>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <CluePanel
              entries={downEntriesWithClues}
              direction="down"
              activeNumber={activeNumber}
              activeDirection={direction}
              clues={downClues}
              onClueClick={handleClueClick}
              onClueChange={handleClueChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
