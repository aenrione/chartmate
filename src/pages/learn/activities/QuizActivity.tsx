import {useState} from 'react';
import {cn} from '@/lib/utils';
import type {QuizActivity as QuizActivityType} from '@/lib/curriculum/types';

interface Props {
  activity: QuizActivityType;
  onPass: () => void;
  onFail: () => void;
}

type AnswerState = 'unanswered' | 'correct' | 'incorrect';

export default function QuizActivity({activity, onPass, onFail}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [state, setState] = useState<AnswerState>('unanswered');

  function handleSelect(idx: number) {
    if (state !== 'unanswered') return;
    setSelected(idx);
    if (idx === activity.answer) {
      setState('correct');
      onPass();
    } else {
      setState('incorrect');
      onFail();
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-on-surface leading-snug">
        {activity.question}
      </h2>

      <div className="flex flex-col gap-3">
        {activity.choices.map((choice, idx) => {
          const isSelected = selected === idx;
          const isCorrect = idx === activity.answer;
          const showResult = state !== 'unanswered';

          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              className={cn(
                'w-full px-5 py-4 rounded-xl border-2 text-left font-medium text-sm transition-all',
                !showResult && 'border-outline-variant/30 text-on-surface hover:border-primary/50 hover:bg-surface-container',
                showResult && isCorrect && 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                showResult && isSelected && !isCorrect && 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400',
                showResult && !isSelected && !isCorrect && 'border-outline-variant/20 text-on-surface-variant opacity-50',
              )}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {state === 'correct' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
          Correct! {activity.explanation && <span className="font-normal opacity-90">{activity.explanation}</span>}
        </div>
      )}

      {state === 'incorrect' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm">
          <p className="font-semibold text-red-600 dark:text-red-400 mb-1">Not quite.</p>
          {activity.explanation && (
            <p className="text-on-surface-variant">{activity.explanation}</p>
          )}
          <button
            onClick={() => {
              setSelected(null);
              setState('unanswered');
            }}
            className="mt-2 text-xs text-primary underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
