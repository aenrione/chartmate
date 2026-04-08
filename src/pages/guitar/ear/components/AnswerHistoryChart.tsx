// src/pages/guitar/ear/components/AnswerHistoryChart.tsx
interface ItemStat {
  item: string;
  correct: number;
  total: number;
}

interface Props {
  stats: ItemStat[];
}

export function AnswerHistoryChart({stats}: Props) {
  if (stats.length === 0) return null;
  const sorted = [...stats].sort((a, b) => b.total - a.total);

  return (
    <div className="flex flex-col gap-2">
      {sorted.map(({item, correct, total}) => {
        const pct = total > 0 ? correct / total : 0;
        const barColor = pct >= 0.75 ? 'bg-green-500' : pct >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
        return (
          <div key={item} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-right text-xs font-mono text-on-surface-variant">{item}</span>
            <div className="relative flex-1 h-5 rounded-full bg-surface-container-high overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{width: `${pct * 100}%`}}
              />
            </div>
            <span className="w-16 shrink-0 text-xs text-on-surface-variant">
              {Math.round(pct * 100)}% ({correct}/{total})
            </span>
          </div>
        );
      })}
    </div>
  );
}
