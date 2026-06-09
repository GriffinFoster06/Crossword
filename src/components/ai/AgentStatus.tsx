import { useAiStore } from '../../stores/aiStore';
import { useUiStore } from '../../stores/uiStore';

export function AgentStatus() {
  const isGenerating = useAiStore((s) => s.isGenerating);
  const isBatchGenerating = useAiStore((s) => s.isBatchGenerating);
  const batchProgress = useAiStore((s) => s.batchProgress);
  const batchTotal = useAiStore((s) => s.batchTotal);
  const ollamaAvailable = useUiStore((s) => s.ollamaAvailable);

  const status: 'connected' | 'disconnected' | 'busy' = !ollamaAvailable
    ? 'disconnected'
    : isGenerating || isBatchGenerating
    ? 'busy'
    : 'connected';

  return (
    <div className={`agent-status agent-status--${status}`}>
      <span className="agent-status__dot" />
      <span className="agent-status__label">
        {status === 'disconnected' && 'AI offline'}
        {status === 'connected' && 'AI ready'}
        {status === 'busy' && (
          isBatchGenerating && batchTotal > 0
            ? `Generating ${batchProgress}/${batchTotal}`
            : 'Generating...'
        )}
      </span>
    </div>
  );
}
