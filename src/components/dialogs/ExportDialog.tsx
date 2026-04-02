import { useState } from 'react';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';
import { savePuzzle, exportPuz, exportPdf, exportNyt, loadPuzzle, importPuz } from '../../lib/tauriCommands';
import type { PuzzleFile } from '../../types/crossword';

type ExportTab = 'save' | 'open' | 'export' | 'nyt';

export function ExportDialog() {
  const cells = usePuzzleStore((s) => s.cells);
  const size = usePuzzleStore((s) => s.size);
  const clues = usePuzzleStore((s) => s.clues);
  const metadata = usePuzzleStore((s) => s.metadata);
  const theme = usePuzzleStore((s) => s.theme);
  const loadPuzzleStore = usePuzzleStore((s) => s.loadPuzzle);

  const currentFilePath = useUiStore((s) => s.currentFilePath);
  const setCurrentFilePath = useUiStore((s) => s.setCurrentFilePath);
  const setIsDirty = useUiStore((s) => s.setIsDirty);
  const setShowExportDialog = useUiStore((s) => s.setShowExportDialog);
  const setValidation = useUiStore((s) => s.setValidation);

  const [tab, setTab] = useState<ExportTab>('save');
  const [includeSolution, setIncludeSolution] = useState(true);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [nytCoverLetter, setNytCoverLetter] = useState<string | null>(null);
  const [nytWarnings, setNytWarnings] = useState<string[]>([]);

  const puzzleFile: PuzzleFile = {
    version: 1,
    grid: { size, cells },
    clues,
    metadata,
    theme,
    notes: null,
  };

  const showStatus = (msg: string, ok: boolean) => {
    setStatus({ msg, ok });
    setTimeout(() => setStatus(null), 3000);
  };

  const handleSaveJson = async () => {
    setBusy(true);
    try {
      // Ask Tauri for a save dialog
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        filters: [{ name: 'CrossForge Puzzle', extensions: ['json'] }],
        defaultPath: metadata.title ? `${metadata.title}.json` : 'puzzle.json',
      });
      if (!path) return;
      await savePuzzle(puzzleFile, path);
      setCurrentFilePath(path);
      setIsDirty(false);
      showStatus(`Saved to ${path.split('/').pop()}`, true);
    } catch (e: any) {
      showStatus(`Save failed: ${e.message ?? e}`, false);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenJson = async () => {
    setBusy(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({
        filters: [{ name: 'CrossForge Puzzle', extensions: ['json'] }],
        multiple: false,
      }) as string | null;
      if (!path) return;
      const pf = await loadPuzzle(path);
      loadPuzzleStore(pf.grid.cells, pf.grid.size, pf.clues, pf.metadata, pf.theme);
      setCurrentFilePath(path);
      setIsDirty(false);
      setValidation(null);
      setShowExportDialog(false);
      showStatus(`Opened ${path.split('/').pop()}`, true);
    } catch (e: any) {
      showStatus(`Open failed: ${e.message ?? e}`, false);
    } finally {
      setBusy(false);
    }
  };

  const handleImportPuz = async () => {
    setBusy(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({
        filters: [{ name: 'Across Lite Puzzle', extensions: ['puz'] }],
        multiple: false,
      }) as string | null;
      if (!path) return;
      const pf = await importPuz(path);
      loadPuzzleStore(pf.grid.cells, pf.grid.size, pf.clues, pf.metadata, pf.theme);
      setCurrentFilePath(null);
      setIsDirty(true);
      setValidation(null);
      setShowExportDialog(false);
    } catch (e: any) {
      showStatus(`Import failed: ${e.message ?? e}`, false);
    } finally {
      setBusy(false);
    }
  };

  const handleExportPuz = async () => {
    setBusy(true);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        filters: [{ name: 'Across Lite', extensions: ['puz'] }],
        defaultPath: metadata.title ? `${metadata.title}.puz` : 'puzzle.puz',
      });
      if (!path) return;
      await exportPuz(puzzleFile, path);
      showStatus(`Exported ${path.split('/').pop()}`, true);
    } catch (e: any) {
      showStatus(`Export failed: ${e.message ?? e}`, false);
    } finally {
      setBusy(false);
    }
  };

  const handleExportNyt = async () => {
    setBusy(true);
    setNytCoverLetter(null);
    setNytWarnings([]);
    try {
      const { validateGrid } = await import('../../lib/tauriCommands');
      const validation = await validateGrid(puzzleFile.grid);
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        filters: [{ name: 'Across Lite', extensions: ['puz'] }],
        defaultPath: metadata.title ? `${metadata.title}.puz` : 'puzzle.puz',
      });
      if (!path) return;
      const result = await exportNyt(puzzleFile, path, validation);
      setNytCoverLetter(result.cover_letter);
      setNytWarnings(result.warnings);
      showStatus(`NYT package written to ${path.split('/').pop()}`, true);
    } catch (e: any) {
      showStatus(`NYT export failed:\n${e.message ?? e}`, false);
    } finally {
      setBusy(false);
    }
  };

  const handleExportPdf = async () => {
    setBusy(true);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        defaultPath: metadata.title ? `${metadata.title}.pdf` : 'puzzle.pdf',
      });
      if (!path) return;
      await exportPdf(puzzleFile, path, includeSolution);
      showStatus(`PDF exported to ${path.split('/').pop()}`, true);
    } catch (e: any) {
      showStatus(`PDF export failed: ${e.message ?? e}`, false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={() => setShowExportDialog(false)}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Files</h2>
          <button className="dialog-close" onClick={() => setShowExportDialog(false)}>✕</button>
        </div>

        <div className="dialog-tabs">
          {(['save', 'open', 'export', 'nyt'] as ExportTab[]).map(t => (
            <button
              key={t}
              className={`dialog-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'nyt' ? 'NYT Submit' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="dialog-body">
          {tab === 'save' && (
            <div className="export-section">
              <div className="export-info">
                <span className="export-size">{size}×{size}</span>
                {metadata.title && <span className="export-title">"{metadata.title}"</span>}
                {currentFilePath && (
                  <span className="export-path">{currentFilePath.split('/').pop()}</span>
                )}
              </div>
              <button className="btn btn-primary" onClick={handleSaveJson} disabled={busy}>
                Save as .json…
              </button>
              {currentFilePath && (
                <button
                  className="btn btn-secondary"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await savePuzzle(puzzleFile, currentFilePath);
                      setIsDirty(false);
                      showStatus('Saved', true);
                    } catch (e: any) {
                      showStatus(`Save failed: ${e.message ?? e}`, false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  Save (overwrite)
                </button>
              )}
            </div>
          )}

          {tab === 'open' && (
            <div className="export-section">
              <button className="btn btn-primary" onClick={handleOpenJson} disabled={busy}>
                Open .json puzzle…
              </button>
              <button className="btn btn-secondary" onClick={handleImportPuz} disabled={busy}>
                Import .puz file…
              </button>
            </div>
          )}

          {tab === 'export' && (
            <div className="export-section">
              <label className="export-option">
                <input
                  type="checkbox"
                  checked={includeSolution}
                  onChange={e => setIncludeSolution(e.target.checked)}
                />
                Include solution in PDF
              </label>
              <button className="btn btn-primary" onClick={handleExportPdf} disabled={busy}>
                Export PDF…
              </button>
              <button className="btn btn-secondary" onClick={handleExportPuz} disabled={busy}>
                Export .puz (Across Lite)…
              </button>
            </div>
          )}

          {tab === 'nyt' && (
            <div className="export-section">
              <p className="export-hint">
                Validates all NYT rules, checks clue completeness, and exports a .puz
                file with a cover letter template.
              </p>
              <button className="btn btn-primary" onClick={handleExportNyt} disabled={busy}>
                Validate &amp; Export NYT Package…
              </button>
              {nytWarnings.length > 0 && (
                <div className="nyt-warnings">
                  <strong>Warnings:</strong>
                  <ul>
                    {nytWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              {nytCoverLetter && (
                <div className="nyt-cover-letter">
                  <div className="nyt-cover-header">
                    <strong>Cover Letter Template</strong>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigator.clipboard.writeText(nytCoverLetter)}
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="nyt-cover-text">{nytCoverLetter}</pre>
                </div>
              )}
            </div>
          )}

          {status && (
            <div className={`export-status ${status.ok ? 'status-ok' : 'status-err'}`}>
              {status.msg}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={() => setShowExportDialog(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
