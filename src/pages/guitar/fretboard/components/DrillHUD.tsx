import {Timer, Flame, Trophy} from 'lucide-react';

interface DrillHUDProps {
  timer: number;
  streak: number;
  score: number;
  questionIndex: number;
  totalQuestions: number;
  difficulty: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function DrillHUD({
  timer,
  streak,
  score,
  questionIndex,
  totalQuestions,
  difficulty,
}: DrillHUDProps) {
  return (
    <div className="flex items-center gap-2 lg:gap-6 min-w-0 overflow-hidden">
      {/* Progress */}
      <div className="flex items-center gap-1 lg:gap-2 text-sm text-on-surface-variant font-mono shrink-0">
        <span className="text-on-surface font-bold">{questionIndex + 1}</span>
        <span>/</span>
        <span>{totalQuestions}</span>
      </div>

      {/* Stats cluster */}
      <div className="flex items-center gap-2 lg:gap-4 bg-surface-container-low px-2 lg:px-4 py-1.5 lg:py-2 rounded-xl shadow-studio-sm shrink-0">
        {/* Timer */}
        <div className="flex items-center gap-1 lg:gap-2">
          <Timer className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-primary" />
          <span className="font-mono text-xs lg:text-sm tracking-tight text-on-surface">{formatTime(timer)}</span>
        </div>

        <div className="w-px h-3.5 bg-outline-variant/20" />

        {/* Streak */}
        <div className="flex items-center gap-1 lg:gap-2">
          <Flame className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-tertiary" />
          <span className="font-mono text-xs lg:text-sm text-on-surface">{streak}</span>
        </div>

        <div className="w-px h-3.5 bg-outline-variant/20" />

        {/* Score */}
        <div className="flex items-center gap-1 lg:gap-2">
          <Trophy className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-secondary" />
          <span className="font-mono text-xs lg:text-sm text-on-surface">{score}</span>
        </div>
      </div>

      {/* Difficulty badge — hidden on small mobile to save space */}
      <span className={`hidden sm:inline px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-bold bg-surface-container-high shrink-0 ${
        difficulty === 'beginner' ? 'text-primary' :
        difficulty === 'intermediate' ? 'text-tertiary' :
        'text-error'
      }`}>
        {difficulty}
      </span>
    </div>
  );
}
