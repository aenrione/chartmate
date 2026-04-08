// src/pages/guitar/ear/components/AnswerGrid.tsx
import {cn} from '@/lib/utils';

type ButtonState = 'default' | 'selected' | 'correct' | 'incorrect';

interface Props {
  options: string[];
  selectedAnswer: string | null;
  correctAnswer: string | null; // null while awaiting answer
  onSelect: (answer: string) => void;
  disabled?: boolean;
  columns?: 2 | 3 | 4 | 6;
}

function getButtonState(option: string, selected: string | null, correct: string | null): ButtonState {
  if (correct === null) {
    return selected === option ? 'selected' : 'default';
  }
  if (option === correct) return 'correct';
  if (option === selected && option !== correct) return 'incorrect';
  return 'default';
}

const STATE_CLASSES: Record<ButtonState, string> = {
  default: 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
  selected: 'bg-primary-container text-on-primary-container ring-2 ring-primary',
  correct: 'bg-green-500/20 text-green-300 ring-2 ring-green-500',
  incorrect: 'bg-red-500/20 text-red-300 ring-2 ring-red-500 animate-shake',
};

const COL_CLASSES = {2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 6: 'grid-cols-6'};

export function AnswerGrid({options, selectedAnswer, correctAnswer, onSelect, disabled, columns = 3}: Props) {
  return (
    <div className={cn('grid gap-2', COL_CLASSES[columns])}>
      {options.map(option => {
        const st = getButtonState(option, selectedAnswer, correctAnswer);
        return (
          <button
            key={option}
            onClick={() => onSelect(option)}
            disabled={disabled || correctAnswer !== null}
            className={cn(
              'rounded-2xl px-3 py-3 text-sm font-medium transition-all duration-150 focus:outline-none',
              STATE_CLASSES[st],
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
