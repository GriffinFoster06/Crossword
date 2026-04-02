import { useMemo } from 'react';
import { usePuzzleStore } from '../../stores/puzzleStore';
import { useUiStore } from '../../stores/uiStore';

// NYT averages for comparison
const NYT_AVERAGES = {
  wordCount15: 74,
  avgWordLength15: 5.3,
  blackPct15: 16.6,
  crosswordesePct: 5,
};

// Common crosswordese words
const CROSSWORDESE = new Set([
  'EPEE', 'ALOE', 'ALEE', 'ASEA', 'OLEO', 'OREO', 'ARIA', 'AEON', 'ERAS',
  'IRES', 'ESNE', 'ETNA', 'ERNE', 'EIRE', 'NARC', 'SMEW', 'IBIS', 'INIA',
  'RETE', 'TARE', 'ESNE', 'ANTE', 'ARETE', 'SNEE', 'OBOE', 'EMOTE', 'ARÊTE',
  'OLEO', 'ALOE', 'OLES', 'ENOW', 'ERST', 'ENTR', 'AMOR', 'AMOK', 'ALAI',
  'ORLE', 'DACE', 'NETT', 'OGEE', 'SPAE', 'TACE', 'ARCO',
]);

function getScoreBucket(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

// Simple word score approximation based on letter patterns
function approximateWordScore(word: string): number {
  if (CROSSWORDESE.has(word)) return 25;
  if (word.length <= 3) return 50;
  if (word.length >= 7) return 70;
  return 60;
}

export function StatsPanel() {
  const slots = usePuzzleStore((s) => s.slots);
  const cells = usePuzzleStore((s) => s.cells);
  const size = usePuzzleStore((s) => s.size);
  const setShowStatsPanel = useUiStore((s) => s.setShowStatsPanel);

  const stats = useMemo(() => {
    const totalCells = size * size;
    const blackCount = cells.flat().filter((c) => c.is_black).length;
    const blackPct = (blackCount / totalCells) * 100;

    const completedSlots = slots.filter((s) => !s.pattern.includes('_') && s.pattern.length >= 3);
    const allWords = completedSlots.map((s) => s.pattern);
    const wordCount = slots.length;

    const avgWordLength = slots.length > 0
      ? slots.reduce((sum, s) => sum + s.length, 0) / slots.length
      : 0;

    const scores = allWords.map(approximateWordScore);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const crosswordeseCount = allWords.filter((w) => CROSSWORDESE.has(w)).length;
    const crosswordesePct = allWords.length > 0 ? (crosswordeseCount / allWords.length) * 100 : 0;

    const buckets = { excellent: 0, good: 0, fair: 0, poor: 0 };
    for (const s of scores) {
      const bucket = getScoreBucket(s) as keyof typeof buckets;
      buckets[bucket]++;
    }

    const shortWords = slots.filter((s) => s.length === 3).length;
    const longWords = slots.filter((s) => s.length >= 8).length;

    const duplicates = new Set<string>();
    const seen = new Set<string>();
    for (const w of allWords) {
      if (seen.has(w)) duplicates.add(w);
      seen.add(w);
    }

    return {
      wordCount,
      blackCount,
      blackPct,
      avgWordLength,
      avgScore,
      crosswordeseCount,
      crosswordesePct,
      buckets,
      shortWords,
      longWords,
      completedCount: completedSlots.length,
      duplicates: [...duplicates],
      totalWords: allWords.length,
    };
  }, [slots, cells, size]);

  const getStatusColor = (value: number, target: number, lowerIsBetter = false) => {
    const diff = lowerIsBetter ? value - target : target - value;
    if (Math.abs(diff) <= target * 0.05) return 'stat-good';
    if (diff > 0) return 'stat-warn';
    return 'stat-ok';
  };

  return (
    <div className="stats-panel-overlay" onClick={(e) => e.target === e.currentTarget && setShowStatsPanel(false)}>
      <div className="stats-panel">
        <div className="stats-panel-header">
          <h3>Puzzle Statistics</h3>
          <button className="stats-close-btn" onClick={() => setShowStatsPanel(false)}>✕</button>
        </div>

        <div className="stats-grid">
          {/* Grid metrics */}
          <div className="stats-section">
            <h4>Grid</h4>
            <div className="stats-row">
              <span>Size</span>
              <span>{size}×{size}</span>
            </div>
            <div className="stats-row">
              <span>Word count</span>
              <span className={getStatusColor(stats.wordCount, NYT_AVERAGES.wordCount15, true)}>
                {stats.wordCount} <span className="stats-nyt">NYT ≤{NYT_AVERAGES.wordCount15}</span>
              </span>
            </div>
            <div className="stats-row">
              <span>Black squares</span>
              <span className={getStatusColor(stats.blackPct, NYT_AVERAGES.blackPct15, true)}>
                {stats.blackCount} ({stats.blackPct.toFixed(1)}%)
                <span className="stats-nyt"> NYT ~{NYT_AVERAGES.blackPct15}%</span>
              </span>
            </div>
            <div className="stats-row">
              <span>Avg word length</span>
              <span>{stats.avgWordLength.toFixed(1)} letters</span>
            </div>
            <div className="stats-row">
              <span>3-letter words</span>
              <span>{stats.shortWords}</span>
            </div>
            <div className="stats-row">
              <span>8+ letter words</span>
              <span className="stat-good">{stats.longWords}</span>
            </div>
          </div>

          {/* Fill quality */}
          <div className="stats-section">
            <h4>Fill Quality</h4>
            <div className="stats-row">
              <span>Filled words</span>
              <span>{stats.completedCount} / {stats.wordCount}</span>
            </div>
            <div className="stats-row">
              <span>Avg score</span>
              <span className={stats.avgScore >= 60 ? 'stat-good' : stats.avgScore >= 40 ? 'stat-warn' : 'stat-bad'}>
                {stats.avgScore.toFixed(0)} / 100
              </span>
            </div>
            <div className="stats-row">
              <span>Crosswordese</span>
              <span className={stats.crosswordesePct > 10 ? 'stat-bad' : stats.crosswordesePct > 5 ? 'stat-warn' : 'stat-good'}>
                {stats.crosswordeseCount} ({stats.crosswordesePct.toFixed(1)}%)
              </span>
            </div>
            {stats.duplicates.length > 0 && (
              <div className="stats-row stats-warning">
                <span>Duplicates</span>
                <span className="stat-bad">{stats.duplicates.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Score distribution */}
          {stats.totalWords > 0 && (
            <div className="stats-section stats-section-full">
              <h4>Score Distribution</h4>
              <div className="stats-histogram">
                {(['excellent', 'good', 'fair', 'poor'] as const).map((bucket) => {
                  const count = stats.buckets[bucket];
                  const pct = stats.totalWords > 0 ? (count / stats.totalWords) * 100 : 0;
                  return (
                    <div key={bucket} className="stats-histogram-row">
                      <span className="stats-bucket-label">{bucket.charAt(0).toUpperCase() + bucket.slice(1)}</span>
                      <div className="stats-bar-container">
                        <div
                          className={`stats-bar stats-bar-${bucket}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="stats-bucket-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* NYT comparison */}
          <div className="stats-section stats-section-full">
            <h4>vs NYT Averages ({size}×{size})</h4>
            <div className="stats-comparison-grid">
              <div className="stats-compare-item">
                <div className="stats-compare-label">Words</div>
                <div className={`stats-compare-value ${stats.wordCount <= NYT_AVERAGES.wordCount15 ? 'stat-good' : 'stat-bad'}`}>
                  {stats.wordCount}
                </div>
                <div className="stats-compare-nyt">{NYT_AVERAGES.wordCount15}</div>
              </div>
              <div className="stats-compare-item">
                <div className="stats-compare-label">Avg Length</div>
                <div className="stats-compare-value">{stats.avgWordLength.toFixed(1)}</div>
                <div className="stats-compare-nyt">{NYT_AVERAGES.avgWordLength15}</div>
              </div>
              <div className="stats-compare-item">
                <div className="stats-compare-label">Black %</div>
                <div className={`stats-compare-value ${stats.blackPct <= NYT_AVERAGES.blackPct15 + 2 ? 'stat-good' : 'stat-warn'}`}>
                  {stats.blackPct.toFixed(1)}%
                </div>
                <div className="stats-compare-nyt">{NYT_AVERAGES.blackPct15}%</div>
              </div>
              <div className="stats-compare-item">
                <div className="stats-compare-label">Crosswordese</div>
                <div className={`stats-compare-value ${stats.crosswordesePct <= NYT_AVERAGES.crosswordesePct ? 'stat-good' : 'stat-warn'}`}>
                  {stats.crosswordesePct.toFixed(1)}%
                </div>
                <div className="stats-compare-nyt">{NYT_AVERAGES.crosswordesePct}%</div>
              </div>
            </div>
            <div className="stats-compare-legend">
              <span className="stat-good">■</span> You &nbsp;
              <span className="stats-nyt">■</span> NYT avg
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
