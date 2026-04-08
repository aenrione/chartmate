// src/pages/guitar/ear/components/TrainingPulse.tsx
interface DayData {
  date: string; // YYYY-MM-DD
  count: number;
}

interface Props {
  data: DayData[];
  weeks?: number;
}

function getColor(count: number) {
  if (count === 0) return 'bg-surface-container-high';
  if (count === 1) return 'bg-primary/30';
  if (count <= 3) return 'bg-primary/60';
  return 'bg-primary';
}

export function TrainingPulse({data, weeks = 12}: Props) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - weeks * 7 + 1);

  const countMap = new Map(data.map(d => [d.date, d.count]));
  const days: Array<{date: string; count: number}> = [];
  const cursor = new Date(startDate);
  while (cursor <= today) {
    const key = cursor.toISOString().split('T')[0];
    days.push({date: key, count: countMap.get(key) ?? 0});
    cursor.setDate(cursor.getDate() + 1);
  }

  // Pad to full weeks
  const cols: Array<typeof days> = [];
  for (let i = 0; i < days.length; i += 7) {
    cols.push(days.slice(i, i + 7));
  }

  return (
    <div className="flex gap-1 overflow-hidden">
      {cols.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map(({date, count}) => (
            <div
              key={date}
              title={`${date}: ${count} session${count !== 1 ? 's' : ''}`}
              className={`h-3 w-3 rounded-sm ${getColor(count)}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
