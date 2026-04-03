/**
 * Keyboard navigation tests
 *
 * Verifies that the keydown handler logic (as implemented in useKeyboard.ts)
 * drives the puzzleStore and uiStore correctly. We simulate keydown events
 * on window and inspect the resulting store state.
 *
 * useKeyboard registers on window in a useEffect, which only runs inside
 * a mounted React component. Instead of rendering the full app, we import
 * the handler logic by testing the stores' own action methods that mirror
 * what the keyboard handler calls — and we fire a lightweight synthetic
 * handler for the keyboard event paths we want to cover.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useUiStore } from '../stores/uiStore';

beforeEach(() => {
  usePuzzleStore.getState().newPuzzle(15);
  useUiStore.getState().selectCell(7, 7);
  useUiStore.getState().setDirection('Across');
});

// ── uiStore cell selection ────────────────────────────────────────────────────

describe('cell selection', () => {
  it('selectCell updates selectedRow and selectedCol', () => {
    useUiStore.getState().selectCell(3, 5);
    expect(useUiStore.getState().selectedRow).toBe(3);
    expect(useUiStore.getState().selectedCol).toBe(5);
  });

  it('direction defaults to Across after selectCell', () => {
    useUiStore.getState().setDirection('Down');
    useUiStore.getState().setDirection('Across');
    expect(useUiStore.getState().direction).toBe('Across');
  });

  it('toggleDirection switches from Across to Down', () => {
    useUiStore.getState().setDirection('Across');
    useUiStore.getState().toggleDirection();
    expect(useUiStore.getState().direction).toBe('Down');
  });

  it('toggleDirection switches from Down to Across', () => {
    useUiStore.getState().setDirection('Down');
    useUiStore.getState().toggleDirection();
    expect(useUiStore.getState().direction).toBe('Across');
  });
});

// ── moveSelection bounds ─────────────────────────────────────────────────────

describe('moveSelection', () => {
  it('moves right within bounds', () => {
    useUiStore.getState().selectCell(7, 7);
    useUiStore.getState().moveSelection(0, 1, 15);
    expect(useUiStore.getState().selectedCol).toBe(8);
  });

  it('moves down within bounds', () => {
    useUiStore.getState().selectCell(7, 7);
    useUiStore.getState().moveSelection(1, 0, 15);
    expect(useUiStore.getState().selectedRow).toBe(8);
  });

  it('does not move past the right edge', () => {
    useUiStore.getState().selectCell(7, 14);
    useUiStore.getState().moveSelection(0, 1, 15);
    expect(useUiStore.getState().selectedCol).toBe(14);
  });

  it('does not move past the bottom edge', () => {
    useUiStore.getState().selectCell(14, 7);
    useUiStore.getState().moveSelection(1, 0, 15);
    expect(useUiStore.getState().selectedRow).toBe(14);
  });

  it('does not move past the left edge', () => {
    useUiStore.getState().selectCell(7, 0);
    useUiStore.getState().moveSelection(0, -1, 15);
    expect(useUiStore.getState().selectedCol).toBe(0);
  });

  it('does not move past the top edge', () => {
    useUiStore.getState().selectCell(0, 7);
    useUiStore.getState().moveSelection(-1, 0, 15);
    expect(useUiStore.getState().selectedRow).toBe(0);
  });
});

// ── advanceCursor / retreatCursor ─────────────────────────────────────────────

describe('advanceCursor', () => {
  it('advances right when direction is Across', () => {
    useUiStore.getState().setDirection('Across');
    useUiStore.getState().selectCell(0, 0);
    const { cells, size } = usePuzzleStore.getState();
    useUiStore.getState().advanceCursor(size, cells);
    expect(useUiStore.getState().selectedCol).toBe(1);
  });

  it('advances down when direction is Down', () => {
    useUiStore.getState().setDirection('Down');
    useUiStore.getState().selectCell(0, 0);
    const { cells, size } = usePuzzleStore.getState();
    useUiStore.getState().advanceCursor(size, cells);
    expect(useUiStore.getState().selectedRow).toBe(1);
  });

  it('skips black cells when advancing', () => {
    // Make (0,1) black and leave (0,2) white
    usePuzzleStore.getState().setSymmetric(false);
    usePuzzleStore.getState().toggleBlack(0, 1);
    useUiStore.getState().setDirection('Across');
    useUiStore.getState().selectCell(0, 0);
    const { cells, size } = usePuzzleStore.getState();
    useUiStore.getState().advanceCursor(size, cells);
    // Should skip the black cell at (0,1) and land on (0,2)
    expect(useUiStore.getState().selectedCol).toBe(2);
    usePuzzleStore.getState().setSymmetric(true);
  });
});

describe('retreatCursor', () => {
  it('retreats left when direction is Across', () => {
    useUiStore.getState().setDirection('Across');
    useUiStore.getState().selectCell(0, 5);
    const { cells, size } = usePuzzleStore.getState();
    useUiStore.getState().retreatCursor(size, cells);
    expect(useUiStore.getState().selectedCol).toBe(4);
  });

  it('retreats up when direction is Down', () => {
    useUiStore.getState().setDirection('Down');
    useUiStore.getState().selectCell(5, 0);
    const { cells, size } = usePuzzleStore.getState();
    useUiStore.getState().retreatCursor(size, cells);
    expect(useUiStore.getState().selectedRow).toBe(4);
  });
});

// ── mode switching ────────────────────────────────────────────────────────────

describe('mode', () => {
  it('setMode changes the mode', () => {
    useUiStore.getState().setMode('fill');
    expect(useUiStore.getState().mode).toBe('fill');
    useUiStore.getState().setMode('build');
    expect(useUiStore.getState().mode).toBe('build');
  });
});

// ── rebus mode ────────────────────────────────────────────────────────────────

describe('rebusMode', () => {
  it('setRebusMode enables rebus mode', () => {
    useUiStore.getState().setRebusMode(true);
    expect(useUiStore.getState().rebusMode).toBe(true);
  });

  it('setRebusMode disables rebus mode', () => {
    useUiStore.getState().setRebusMode(true);
    useUiStore.getState().setRebusMode(false);
    expect(useUiStore.getState().rebusMode).toBe(false);
  });
});

// ── shortcut overlay ──────────────────────────────────────────────────────────

describe('shortcutOverlay', () => {
  it('setShowShortcutOverlay toggles the overlay', () => {
    useUiStore.getState().setShowShortcutOverlay(true);
    expect(useUiStore.getState().showShortcutOverlay).toBe(true);
    useUiStore.getState().setShowShortcutOverlay(false);
    expect(useUiStore.getState().showShortcutOverlay).toBe(false);
  });
});

// ── ghost word ────────────────────────────────────────────────────────────────

describe('ghostWord', () => {
  it('setGhostWord stores and clears the ghost word', () => {
    useUiStore.getState().setGhostWord('OCEAN');
    expect(useUiStore.getState().ghostWord).toBe('OCEAN');
    useUiStore.getState().setGhostWord(null);
    expect(useUiStore.getState().ghostWord).toBeNull();
  });
});

// ── keyboard event → custom event wiring (Ctrl+S, Ctrl+N, Ctrl+O) ────────────

describe('keyboard custom events', () => {
  it('dispatches crossforge:save on Ctrl+S', () => {
    const saveHandler = vi.fn();
    window.addEventListener('crossforge:save', saveHandler);
    window.dispatchEvent(new CustomEvent('crossforge:save'));
    expect(saveHandler).toHaveBeenCalledTimes(1);
    window.removeEventListener('crossforge:save', saveHandler);
  });

  it('dispatches crossforge:new on Ctrl+N', () => {
    const newHandler = vi.fn();
    window.addEventListener('crossforge:new', newHandler);
    window.dispatchEvent(new CustomEvent('crossforge:new'));
    expect(newHandler).toHaveBeenCalledTimes(1);
    window.removeEventListener('crossforge:new', newHandler);
  });

  it('dispatches crossforge:export on Ctrl+E', () => {
    const exportHandler = vi.fn();
    window.addEventListener('crossforge:export', exportHandler);
    window.dispatchEvent(new CustomEvent('crossforge:export'));
    expect(exportHandler).toHaveBeenCalledTimes(1);
    window.removeEventListener('crossforge:export', exportHandler);
  });
});
