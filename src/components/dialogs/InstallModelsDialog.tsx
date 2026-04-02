import { useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { installModels, type ModelInstallProgress } from '../../lib/tauriCommands';

const CROSSFORGE_MODELS = [
  { name: 'crossforge-clue-writer',     label: 'Clue Writer',      desc: 'Generates NYT-style clues at all difficulty levels' },
  { name: 'crossforge-theme-agent',     label: 'Theme Agent',       desc: 'Develops coherent puzzle themes with revealers' },
  { name: 'crossforge-word-selector',   label: 'Word Selector',     desc: 'Ranks fill candidates for quality and freshness' },
  { name: 'crossforge-grid-constructor', label: 'Grid Constructor', desc: 'Designs black square patterns for theme entries' },
  { name: 'crossforge-overseer',        label: 'Overseer',          desc: 'Orchestrates the full puzzle creation pipeline' },
];

type InstallState = 'idle' | 'installing' | 'done' | 'error';

interface ModelStatus {
  step: string;
  message: string;
}

export function InstallModelsDialog({ installedModels = [] }: { installedModels?: string[] }) {
  const setShow = useUiStore((s) => s.setShowInstallModelsDialog);
  const setOllamaAvailable = useUiStore((s) => s.setOllamaAvailable);

  const [state, setState] = useState<InstallState>('idle');
  const [modelStatus, setModelStatus] = useState<Record<string, ModelStatus>>({});
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const missingCount = CROSSFORGE_MODELS.filter(
    (m) => !installedModels.some((installed) => installed.startsWith(m.name)),
  ).length;

  const handleInstall = async () => {
    setState('installing');
    setErrorMsg(null);
    setModelStatus({});

    try {
      await installModels((p: ModelInstallProgress) => {
        setCurrentModel(p.model);
        setModelStatus((prev) => ({
          ...prev,
          [p.model]: { step: p.step, message: p.message },
        }));
        if (p.index === p.total - 1 && (p.step === 'done' || p.step === 'skipped')) {
          // Last model finished — we'll detect done via all processed
        }
      });
      setState('done');
      setOllamaAvailable(true);
    } catch (e) {
      setState('error');
      setErrorMsg(String(e));
    }
  };

  const stepIcon = (step?: string) => {
    switch (step) {
      case 'done':    return '✓';
      case 'skipped': return '↷';
      case 'error':   return '✗';
      case 'installing': return '⟳';
      default:        return '○';
    }
  };

  const stepClass = (step?: string) => {
    switch (step) {
      case 'done':    return 'model-step-done';
      case 'skipped': return 'model-step-skipped';
      case 'error':   return 'model-step-error';
      case 'installing': return 'model-step-active';
      default:        return 'model-step-idle';
    }
  };

  return (
    <div className="dialog-overlay" onClick={state === 'idle' ? () => setShow(false) : undefined}>
      <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Install CrossForge AI Models</h2>
          {state !== 'installing' && (
            <button className="dialog-close" onClick={() => setShow(false)}>✕</button>
          )}
        </div>

        <div className="dialog-body">
          {state === 'idle' && (
            <p className="install-intro">
              CrossForge uses {CROSSFORGE_MODELS.length} specialized AI models that run
              locally via Ollama — no API key, no internet required after setup.
              {missingCount > 0
                ? ` ${missingCount} model${missingCount > 1 ? 's need' : ' needs'} to be installed.`
                : ' All models are already installed.'}
            </p>
          )}

          {state === 'done' && (
            <p className="install-intro install-success">
              All CrossForge AI models are installed and ready.
            </p>
          )}

          {state === 'error' && errorMsg && (
            <p className="install-intro install-error">
              Installation failed: {errorMsg}
            </p>
          )}

          <div className="model-list">
            {CROSSFORGE_MODELS.map((m) => {
              const status = modelStatus[m.name];
              const alreadyHad = installedModels.some((i) => i.startsWith(m.name));
              const displayStep = status?.step ?? (alreadyHad ? 'skipped' : undefined);
              return (
                <div key={m.name} className={`model-item ${stepClass(displayStep)}`}>
                  <span className="model-step-icon">{stepIcon(displayStep)}</span>
                  <div className="model-item-info">
                    <strong>{m.label}</strong>
                    <span className="model-item-desc">{m.desc}</span>
                    {status?.message && (
                      <span className="model-item-msg">{status.message}</span>
                    )}
                    {alreadyHad && !status && (
                      <span className="model-item-msg">Already installed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {state === 'installing' && currentModel && (
            <p className="install-progress-hint">
              Installing {currentModel}… this may take a minute.
            </p>
          )}

          <p className="install-prereq">
            <strong>Requires:</strong> Ollama installed and running with the <code>phi4</code> model.
            Run <code>ollama pull phi4</code> first if you haven't already.
          </p>
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={() => setShow(false)} disabled={state === 'installing'}>
            {state === 'done' ? 'Close' : 'Skip for Now'}
          </button>
          {state !== 'done' && (
            <button
              className="btn btn-primary"
              onClick={handleInstall}
              disabled={state === 'installing' || missingCount === 0}
            >
              {state === 'installing'
                ? 'Installing…'
                : missingCount === 0
                ? 'All Installed'
                : `Install ${missingCount} Model${missingCount > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
