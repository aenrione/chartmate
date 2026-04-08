// src/pages/guitar/ear/hooks/useEarSession.ts
import {useTrainingSession} from '@/lib/training/useTrainingSession';
import {createEarSession, saveEarAttempts} from '@/lib/local-db/ear-training';
import type {EarExerciseType, EarAttemptStatus} from '@/lib/local-db/ear-training';
import type {ExerciseDescriptor, EarConfig, EarQuestion, EarAnswerResult, ItemWeight} from '../exercises/types';

export type {TrainingPhase as EarSessionPhase} from '@/lib/training/useTrainingSession';

export function useEarSession(
  descriptor: ExerciseDescriptor | null,
  weights: ItemWeight[] = [],
) {
  const safeDescriptor = descriptor ?? {
    generate: () => ({type: 'interval-recognition', id: '', rootNote: 'C', targetNote: 'G', resolvedDirection: 'ascending', correctAnswer: 'P5'} as EarQuestion),
    validate: () => false,
    getHint: () => '',
  };

  return useTrainingSession<EarQuestion, EarConfig>({
    descriptor: safeDescriptor,
    weights,
    onSessionComplete: async (results, config, {score, bestStreak, durationMs}) => {
      if (!descriptor) return -1;
      const correctCount = results.filter(r => r.isCorrect).length;
      const skippedCount = results.filter(r => r.isSkipped).length;
      const isPerfect = correctCount === config.questionCount;
      const xpEarned = score + bestStreak * 5 + (isPerfect ? 50 : 0);

      const sessionId = await createEarSession({
        exerciseType: descriptor.type,
        difficulty: descriptor.difficulty,
        totalQuestions: results.length,
        correctAnswers: correctCount,
        skippedCount,
        durationMs,
        xpEarned,
        playbackMode: config.playbackMode,
        direction: config.direction,
        speed: config.speed,
      });

      await saveEarAttempts(
        sessionId,
        results.map(r => ({
          exerciseType: descriptor.type,
          promptItem: descriptor.getPromptItem(r.question),
          answerContext: descriptor.getAnswerContext(r.question),
          expectedAnswer: r.question.correctAnswer,
          givenAnswer: r.givenAnswer,
          status: (r.isSkipped ? 'skipped' : r.isCorrect ? 'correct' : 'incorrect') as EarAttemptStatus,
          responseTimeMs: r.responseTimeMs,
        })),
      );

      return sessionId;
    },
  });
}
