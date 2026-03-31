import { useEffect, useRef, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { usePuzzleStore } from './stores/puzzleStore';
import { useUiStore } from './stores/uiStore';
import { useKeyboard } from './hooks/useKeyboard';
import { GridCanvas } from './components/grid/GridCanvas';
import { CluePanel } from './components/clues/CluePanel';
import { WordPanel } from './components/words/WordPanel';
import { Toolbar } from './components/toolbar/Toolbar';
import { StatusBar } from './components/toolbar/StatusBar';
import { AiPanel } from './components/ai/AiPanel';
import { checkOllama, getWordCount } from './lib/tauriCommands';

export default function App() {
  useKeyboard();

  const showAiPanel = useUiStore((s) => s.showAiPanel);
  const darkMode = useUiStore((s) => s.darkMode);
  const setOllamaAvailable = useUiStore((s) => s.setOllamaAvailable);
  const setWordCount = useUiStore((s) => s.setWordCount);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridDimensions, setGridDimensions] = useState({ width: 600, height: 600 });

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
    checkOllama().then((status) => setOllamaAvailable(status.available));
    getWordCount().then((count) => setWordCount(count));
  }, []);

  return (
    <div className={`app ${darkMode ? 'theme-dark' : 'theme-light'}`}>
      <Toolbar />

      <div className="app-body">
        <PanelGroup direction="horizontal" autoSaveId="crossforge-layout">
          <Panel defaultSize={55} minSize={35}>
            <div className="grid-container" ref={gridContainerRef}>
              <GridCanvas width={gridDimensions.width} height={gridDimensions.height} />
            </div>
          </Panel>

          <PanelResizeHandle className="resize-handle" />

          <Panel defaultSize={45} minSize={25}>
            <PanelGroup direction="vertical" autoSaveId="crossforge-right">
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
    </div>
  );
}
