import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { startOllama, pullModel, getSetupStatus, installModels } from '../../lib/tauriCommands';
import type { ModelInstallProgress } from '../../lib/tauriCommands';

type Step = 'starting' | 'downloading' | 'creating-models' | 'done' | 'error';

interface Props {
  onComplete: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const gb = bytes / 1_073_741_824;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1_048_576;
  return `${mb.toFixed(0)} MB`;
}

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('starting');
  const [message, setMessage] = useState('Starting AI engine…');
  const [progress, setProgress] = useState(0); // 0–100
  const [detail, setDetail] = useState('');
  const [canSkip, setCanSkip] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    run();
    // Allow skip after 10 seconds in case something hangs
    const skipTimer = setTimeout(() => setCanSkip(true), 10_000);
    return () => {
      clearTimeout(skipTimer);
      unlistenRef.current?.();
    };
  }, []);

  async function run() {
    try {
      // Step 1: Start Ollama
      setStep('starting');
      setMessage('Starting AI engine…');
      setDetail('CrossForge includes a built-in AI engine. Starting it now.');

      await startOllama();

      // Step 2: Check what needs to be installed
      const status = await getSetupStatus();

      if (!status.base_model_installed) {
        // Download the base model
        setStep('downloading');
        setMessage(`Downloading AI model (${status.base_model})`);
        setDetail('This is a one-time download of ~2 GB. It may take 5–15 minutes.');
        setProgress(0);
        setCanSkip(false);

        const unlisten = await listen<{ status: string; completed: number; total: number }>(
          'model-pull-progress',
          (e) => {
            const { status: pullStatus, completed, total } = e.payload;
            if (total > 0) {
              setProgress(Math.round((completed / total) * 100));
              setDetail(`${formatBytes(completed)} / ${formatBytes(total)} — ${pullStatus}`);
            } else {
              setDetail(pullStatus);
            }
          }
        );
        unlistenRef.current = unlisten;

        await pullModel(status.base_model);
        unlisten();
        unlistenRef.current = null;
      }

      // Step 3: Create CrossForge custom models
      const needsModels = status.crossforge_models_installed.some((v) => !v);
      if (needsModels) {
        setStep('creating-models');
        setMessage('Setting up CrossForge AI agents…');
        setDetail('Creating 5 specialized AI agents. This takes about 1–2 minutes.');
        setProgress(0);

        const unlisten2 = await listen<ModelInstallProgress>(
          'model-install-progress',
          (e) => {
            const p = e.payload;
            setProgress(Math.round(((p.index + 1) / p.total) * 100));
            setDetail(`${p.step === 'done' ? '✓' : '…'} ${p.model}`);
          }
        );
        unlistenRef.current = unlisten2;

        await installModels();
        unlisten2();
        unlistenRef.current = null;
      }

      // Done
      setStep('done');
      setMessage('CrossForge is ready!');
      setDetail('All AI agents are set up and ready to assist with your puzzles.');
      setProgress(100);
      setCanSkip(false);

      // Auto-close after 2 seconds
      setTimeout(onComplete, 2000);
    } catch (err) {
      setStep('error');
      setMessage('Setup encountered an issue');
      setDetail(String(err));
      setCanSkip(true);
    }
  }

  const stepLabels: Record<Step, string> = {
    starting: 'Starting AI Engine',
    downloading: 'Downloading Model',
    'creating-models': 'Creating Agents',
    done: 'Ready!',
    error: 'Error',
  };

  const steps: Step[] = ['starting', 'downloading', 'creating-models', 'done'];
  const currentStepIndex = steps.indexOf(step === 'error' ? 'starting' : step);

  return (
    <div className="setup-wizard-overlay">
      <div className="setup-wizard">
        <div className="setup-wizard-header">
          <div className="setup-wizard-logo">CrossForge</div>
          <div className="setup-wizard-subtitle">First-Run Setup</div>
        </div>

        <div className="setup-wizard-steps">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`setup-step ${
                i < currentStepIndex ? 'done' : i === currentStepIndex ? 'active' : 'pending'
              }`}
            >
              <div className="setup-step-dot">
                {i < currentStepIndex ? '✓' : i + 1}
              </div>
              <div className="setup-step-label">{stepLabels[s]}</div>
            </div>
          ))}
        </div>

        <div className="setup-wizard-body">
          <div className="setup-wizard-message">{message}</div>
          <div className="setup-wizard-detail">{detail}</div>

          {step !== 'done' && step !== 'error' && (
            <div className="setup-progress-bar">
              <div
                className="setup-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {canSkip && (
          <div className="setup-wizard-footer">
            <button className="setup-skip-btn" onClick={onComplete}>
              {step === 'error' ? 'Continue Without AI' : 'Skip for Now'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
