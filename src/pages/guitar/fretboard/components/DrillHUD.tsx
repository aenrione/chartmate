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
    <div className="flex items-center gap-6">
      {/* Progress */}
      <div className="flex items-center gap-2 text-sm text-on-surface-variant font-mono">
        <span className="text-on-surface font-bold">{questionIndex + 1}</span>
        <span>/</span>
        <span>{totalQuestions}</span>
      </div>

      {/* Stats cluster */}
      <div className="flex items-center gap-4 bg-surface-container-low px-4 py-2 rounded-xl shadow-studio-sm">
        {/* Timer */}
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          <span className="font-mono text-sm tracking-tight text-on-surface">{formatTime(timer)}</span>
        </div>

        <div className="w-px h-4 bg-outline-variant/20" />

        {/* Streak */}
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-tertiary" />
          <span className="font-mono text-sm text-on-surface">{streak}</span>
        </div>

        <div className="w-px h-4 bg-outline-variant/20" />

        {/* Score */}
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-secondary" />
          <span className="font-mono text-sm text-on-surface">{score}</span>
        </div>
      </div>

      {/* Difficulty badge */}
      <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-bold bg-surface-container-high ${
        difficulty === 'beginner' ? 'text-primary' :
        difficulty === 'intermediate' ? 'text-tertiary' :
        'text-error'
      }`}>
        {difficulty}
      </span>
    </div>
  );
}
