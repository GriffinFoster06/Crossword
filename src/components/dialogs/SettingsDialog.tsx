import { useState, useEffect } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { checkOllama, checkCrossforgeModels } from '../../lib/tauriCommands';

type SettingsTab = 'general' | 'worddb' | 'ai' | 'appearance';

interface Settings {
  ollamaUrl: string;
  clueModel: string;
  themeModel: string;
  wordModel: string;
  gridModel: string;
  overseerModel: string;
  autosaveMinutes: number;
  defaultSize: number;
  defaultSymmetry: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  ollamaUrl: 'http://localhost:11434',
  clueModel: 'phi4',
  themeModel: 'phi4',
  wordModel: 'phi4',
  gridModel: 'phi4',
  overseerModel: 'phi4',
  autosaveMinutes: 5,
  defaultSize: 15,
  defaultSymmetry: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('crossforge_settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: Settings) {
  localStorage.setItem('crossforge_settings', JSON.stringify(s));
}

export function SettingsDialog() {
  const darkMode = useUiStore((s) => s.darkMode);
  const setDarkMode = useUiStore((s) => s.setDarkMode);
  const ollamaAvailable = useUiStore((s) => s.ollamaAvailable);
  const wordCount = useUiStore((s) => s.wordCount);
  const setShowSettingsDialog = useUiStore((s) => s.setShowSettingsDialog);
  const setShowInstallModelsDialog = useUiStore((s) => s.setShowInstallModelsDialog);

  const [tab, setTab] = useState<SettingsTab>('general');
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testingOllama, setTestingOllama] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<string | null>(null);

  useEffect(() => {
    checkOllama().then(status => {
      if (status.models) setAvailableModels(status.models);
    });
    checkCrossforgeModels().then(setInstalledModels);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings(s => ({ ...s, ...patch }));
  };

  const handleSave = () => {
    saveSettings(settings);
    setShowSettingsDialog(false);
  };

  const handleTestOllama = async () => {
    setTestingOllama(true);
    setOllamaTestResult(null);
    try {
      const status = await checkOllama();
      if (status.available) {
        setOllamaTestResult(`✓ Connected — ${status.models?.length ?? 0} model(s) available`);
        setAvailableModels(status.models ?? []);
      } else {
        setOllamaTestResult('✗ Ollama not found — is it running?');
      }
    } catch {
      setOllamaTestResult('✗ Connection failed');
    } finally {
      setTestingOllama(false);
    }
  };

  const modelSelect = (value: string, onChange: (v: string) => void) => (
    <div className="model-select-wrap">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="settings-input"
        placeholder="Model name (e.g. phi4, llama3)"
        list="available-models"
      />
      {availableModels.length > 0 && (
        <datalist id="available-models">
          {availableModels.map(m => <option key={m} value={m} />)}
        </datalist>
      )}
    </div>
  );

  return (
    <div className="dialog-overlay" onClick={() => setShowSettingsDialog(false)}>
      <div className="dialog dialog-wide" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Settings</h2>
          <button className="dialog-close" onClick={() => setShowSettingsDialog(false)}>✕</button>
        </div>

        <div className="dialog-tabs">
          {(['general', 'worddb', 'ai', 'appearance'] as SettingsTab[]).map(t => (
            <button
              key={t}
              className={`dialog-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'worddb' ? 'Word DB' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="dialog-body">
          {tab === 'general' && (
            <div className="settings-section">
              <div className="settings-row">
                <label>Default Grid Size</label>
                <select
                  value={settings.defaultSize}
                  onChange={e => update({ defaultSize: Number(e.target.value) })}
                  className="settings-select"
                >
                  <option value={15}>15×15 (Daily)</option>
                  <option value={21}>21×21 (Sunday)</option>
                </select>
              </div>
              <div className="settings-row">
                <label>Default Symmetry</label>
                <input
                  type="checkbox"
                  checked={settings.defaultSymmetry}
                  onChange={e => update({ defaultSymmetry: e.target.checked })}
                />
              </div>
              <div className="settings-row">
                <label>Autosave (minutes, 0=off)</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={settings.autosaveMinutes}
                  onChange={e => update({ autosaveMinutes: Number(e.target.value) })}
                  className="settings-input-sm"
                />
              </div>
            </div>
          )}

          {tab === 'worddb' && (
            <div className="settings-section">
              <div className="settings-stat">
                <span>Loaded words:</span>
                <strong>{wordCount > 0 ? wordCount.toLocaleString() : 'loading...'}</strong>
              </div>
              <p className="settings-hint">
                To use a custom word list, place a <code>wordlist.bin</code> file (CWDB format)
                in the app data directory, then restart the app. Use{' '}
                <code>scripts/build-wordlist.py</code> to compile your own list.
              </p>
              <p className="settings-hint">
                To build a full 300K+ word database, run:
              </p>
              <pre className="settings-code">
{`cd /path/to/CrossForge
bash scripts/download-data.sh
python3 scripts/build-wordlist.py \\
  data/raw/scowl_merged.txt \\
  data/raw/google_10k_scored.txt \\
  data/raw/common_phrases.txt \\
  -o resources/wordlist.bin`}
              </pre>
            </div>
          )}

          {tab === 'ai' && (
            <div className="settings-section">
              <div className="settings-row">
                <label>Ollama URL</label>
                <input
                  type="text"
                  value={settings.ollamaUrl}
                  onChange={e => update({ ollamaUrl: e.target.value })}
                  className="settings-input"
                />
                <button
                  className="btn btn-sm"
                  onClick={handleTestOllama}
                  disabled={testingOllama}
                >
                  Test
                </button>
              </div>
              {ollamaTestResult && (
                <div className={`settings-result ${ollamaTestResult.startsWith('✓') ? 'result-ok' : 'result-err'}`}>
                  {ollamaTestResult}
                </div>
              )}
              {availableModels.length > 0 && (
                <div className="settings-models">
                  <span>Available: {availableModels.join(', ')}</span>
                </div>
              )}

              <div className="settings-row" style={{ marginBottom: 12 }}>
                <label>CrossForge Models</label>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {installedModels.length}/5 installed
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => { setShowSettingsDialog(false); setShowInstallModelsDialog(true); }}
                >
                  {installedModels.length < 5 ? 'Install Models' : 'Manage Models'}
                </button>
              </div>

              <h4>Agent Models</h4>
              <div className="settings-row">
                <label>Clue Writer</label>
                {modelSelect(settings.clueModel, v => update({ clueModel: v }))}
              </div>
              <div className="settings-row">
                <label>Theme Agent</label>
                {modelSelect(settings.themeModel, v => update({ themeModel: v }))}
              </div>
              <div className="settings-row">
                <label>Word Selector</label>
                {modelSelect(settings.wordModel, v => update({ wordModel: v }))}
              </div>
              <div className="settings-row">
                <label>Grid Constructor</label>
                {modelSelect(settings.gridModel, v => update({ gridModel: v }))}
              </div>
              <div className="settings-row">
                <label>Overseer</label>
                {modelSelect(settings.overseerModel, v => update({ overseerModel: v }))}
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="settings-section">
              <div className="settings-row">
                <label>Dark Mode</label>
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={e => setDarkMode(e.target.checked)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={() => setShowSettingsDialog(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
