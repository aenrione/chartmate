import { cn } from '@/lib/utils';

type DifficultyDotsProps = {
  level: number | null | undefined;
};

export function DifficultyDots({ level }: DifficultyDotsProps) {
  const max = 6;
  const filled = level != null ? Math.min(Math.round(level / 100 * max), max) : 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            i < filled ? 'bg-tertiary' : 'bg-surface-container-high',
          )}
        />
      ))}
    </div>
  );
}
