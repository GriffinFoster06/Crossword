import { useEffect, useRef, useState, useCallback } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { usePuzzleStore } from './stores/puzzleStore';
import { useUiStore } from './stores/uiStore';
import { useKeyboard } from './hooks/useKeyboard';
import { GridCanvas } from './components/grid/GridCanvas';
import { CluePanel } from './components/clues/CluePanel';
import { WordPanel } from './components/words/WordPanel';
import { Toolbar } from './components/toolbar/Toolbar';
import { StatusBar } from './components/toolbar/StatusBar';
import { AiPanel } from './components/ai/AiPanel';
import { NewPuzzleDialog } from './components/dialogs/NewPuzzleDialog';
import { ExportDialog } from './components/dialogs/ExportDialog';
import { SettingsDialog } from './components/dialogs/SettingsDialog';
import { InstallModelsDialog } from './components/dialogs/InstallModelsDialog';
import { SetupWizard } from './components/dialogs/SetupWizard';
import { RebusModal } from './components/dialogs/RebusModal';
import { ShortcutOverlay } from './components/dialogs/ShortcutOverlay';
import { StatsPanel } from './components/stats/StatsPanel';
import { getSetupStatus, getWordCount, savePuzzle, checkCrossforgeModels } from './lib/tauriCommands';

export default function App() {
  useKeyboard();

  const showAiPanel = useUiStore((s) => s.showAiPanel);
  const darkMode = useUiStore((s) => s.darkMode);
  const setOllamaAvailable = useUiStore((s) => s.setOllamaAvailable);
  const setWordCount = useUiStore((s) => s.setWordCount);
  const showStatsPanel = useUiStore((s) => s.showStatsPanel);
  const showNewPuzzleDialog = useUiStore((s) => s.showNewPuzzleDialog);
  const showExportDialog = useUiStore((s) => s.showExportDialog);
  const showSettingsDialog = useUiStore((s) => s.showSettingsDialog);
  const showInstallModelsDialog = useUiStore((s) => s.showInstallModelsDialog);
  const rebusMode = useUiStore((s) => s.rebusMode);
  const showShortcutOverlay = useUiStore((s) => s.showShortcutOverlay);
  const setShowNewPuzzleDialog = useUiStore((s) => s.setShowNewPuzzleDialog);
  const setShowExportDialog = useUiStore((s) => s.setShowExportDialog);
  const setShowInstallModelsDialog = useUiStore((s) => s.setShowInstallModelsDialog);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridDimensions, setGridDimensions] = useState({ width: 600, height: 600 });
  const [installedCrossforgeModels, setInstalledCrossforgeModels] = useState<string[]>([]);
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const measureGrid = useCallback(() => {
    if (gridContainerRef.current) {
      const rect = gridContainerRef.current.getBoundingClientRect();
      const dim = Math.min(rect.width - 20, rect.height - 20);
      setGridDimensions({ width: Math.max(300, dim), height: Math.max(300, dim) });
    }
  }, []);

  useEffect(() => {
    measureGrid();
    const observer = new ResizeObserver(measureGrid);
    if (gridContainerRef.current) observer.observe(gridContainerRef.current);
    return () => observer.disconnect();
  }, [measureGrid]);

  useEffect(() => {
    // Check setup status on first launch
    const hasCompletedSetup = localStorage.getItem('crossforge_setup_complete');
    if (!hasCompletedSetup) {
      setShowSetupWizard(true);
    } else {
      // Re-check Ollama status for returning users
      getSetupStatus().then((status) => {
        setOllamaAvailable(status.ollama_running);
        if (status.ollama_running) {
          const installed = status.crossforge_models_installed
            .map((v, i) => v ? `crossforge-model-${i}` : null)
            .filter(Boolean) as string[];
          setInstalledCrossforgeModels(installed);
          if (installed.length < 5) {
            setShowInstallModelsDialog(true);
          }
        }
      });
    }
    getWordCount().then((count) => setWordCount(count));
  }, []);

  // Wire keyboard shortcut custom events to dialog actions
  useEffect(() => {
    const onNew = () => setShowNewPuzzleDialog(true);
    const onOpen = () => setShowExportDialog(true);
    const onExport = () => setShowExportDialog(true);
    const onSave = async () => {
      const ui = useUiStore.getState();
      if (!ui.currentFilePath) {
        setShowExportDialog(true);
        return;
      }
      const puzzle = usePuzzleStore.getState();
      try {
        await savePuzzle(
          { version: 1, grid: { size: puzzle.size, cells: puzzle.cells }, clues: puzzle.clues, metadata: puzzle.metadata, theme: puzzle.theme, notes: null },
          ui.currentFilePath
        );
        ui.setIsDirty(false);
      } catch (e) {
        console.error('Save failed:', e);
      }
    };

    window.addEventListener('crossforge:new', onNew);
    window.addEventListener('crossforge:open', onOpen);
    window.addEventListener('crossforge:export', onExport);
    window.addEventListener('crossforge:save', onSave);
    return () => {
      window.removeEventListener('crossforge:new', onNew);
      window.removeEventListener('crossforge:open', onOpen);
      window.removeEventListener('crossforge:export', onExport);
      window.removeEventListener('crossforge:save', onSave);
    };
  }, []);

  return (
    <div className={`app ${darkMode ? 'theme-dark' : 'theme-light'}`}>
      <Toolbar />

      <div className="app-body">
        <PanelGroup orientation="horizontal" id="crossforge-layout">
          <Panel defaultSize={55} minSize={35}>
            <div className="grid-container" ref={gridContainerRef}>
              <GridCanvas width={gridDimensions.width} height={gridDimensions.height} />
            </div>
          </Panel>

          <PanelResizeHandle className="resize-handle" />

          <Panel defaultSize={45} minSize={25}>
            <PanelGroup orientation="vertical" id="crossforge-right">
              <Panel defaultSize={40} minSize={15}>
                <WordPanel />
              </Panel>

              <PanelResizeHandle className="resize-handle-h" />

              <Panel defaultSize={showAiPanel ? 30 : 60} minSize={15}>
                <CluePanel />
              </Panel>

              {showAiPanel && (
                <>
                  <PanelResizeHandle className="resize-handle-h" />
                  <Panel defaultSize={30} minSize={15}>
                    <AiPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      <StatusBar />

      {showNewPuzzleDialog && <NewPuzzleDialog />}
      {showExportDialog && <ExportDialog />}
      {showSettingsDialog && <SettingsDialog />}
      {showStatsPanel && <StatsPanel />}
      {showInstallModelsDialog && (
        <InstallModelsDialog installedModels={installedCrossforgeModels} />
      )}
      {showSetupWizard && (
        <SetupWizard
          onComplete={() => {
            setShowSetupWizard(false);
            localStorage.setItem('crossforge_setup_complete', '1');
            // Re-check Ollama now that setup is done
            getSetupStatus().then((status) => setOllamaAvailable(status.ollama_running));
          }}
        />
      )}
      {rebusMode && <RebusModal />}
      {showShortcutOverlay && <ShortcutOverlay />}
    </div>
  );
}
