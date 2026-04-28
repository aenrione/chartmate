import {useCallback, useRef} from 'react';
import {
  useTrainingSession,
  type TrainingPhase,
  type TrainingConfig,
  type TrainingDescriptor,
  type AnswerResult,
} from '@/lib/training/useTrainingSession';
import type {DrillQuestion, DrillConfig, PositionWeight} from '../drills/types';
import type {DrillDescriptor} from '../drills/types';
import type {DrillType, AttemptStatus} from '@/lib/local-db/fretboard';
import {createFretboardSession, saveAttempts} from '@/lib/local-db/fretboard';
import {recordEventSafely} from '@/lib/progression';

// ── Re-export for consumers ──────────────────────────────────────────────────

/** SessionPhase is now an alias for TrainingPhase from useTrainingSession. */
export type SessionPhase = TrainingPhase;

// ── Adapter: DrillDescriptor → TrainingDescriptor ────────────────────────────

/**
 * Wraps the FretboardIQ DrillDescriptor (generator + validator pattern) into
 * the generic TrainingDescriptor interface expected by useTrainingSession.
 */
function makeTrainingDescriptor(
  drill: DrillDescriptor,
): TrainingDescriptor<DrillQuestion, DrillConfig & TrainingConfig> {
  return {
    generate(config, weights) {
      return drill.generator.generate(config as DrillConfig, weights as PositionWeight[]);
    },
    validate(question, answer) {
      return drill.validator.validate(question, answer);
    },
    getHint(question) {
      return drill.generator.getHint(question);
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getQuestionPosition(question: DrillQuestion): {string: number; fret: number} {
  switch (question.type) {
    case 'note-finder':
      return question.position;
    case 'interval-spotter':
      return question.rootPosition;
    case 'scale-navigator':
      return question.positionsToFill[0] ?? {string: 0, fret: 0};
    case 'chord-tone-finder':
      return question.validPositions[0] ?? {string: 0, fret: 0};
    case 'octave-mapper':
      return question.sourcePosition;
    case 'caged-shapes':
      return question.shapePositions[0] ?? {string: 0, fret: 0};
  }
}

function getExpectedAnswer(question: DrillQuestion): string {
  return question.correctAnswer;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Thin wrapper around useTrainingSession that preserves the FretboardIQ API:
 *   { state, selectDrill, startDrill, submitAnswer, skipQuestion, showHint, reset }
 *
 * `state` shape mirrors the old SessionState so FretboardDrillPage needs no changes.
 */
export function useDrillSession() {
  // Track the selected drill outside the generic hook (generic hook has no concept of "drill")
  const drillRef = useRef<DrillDescriptor | null>(null);
  const weightsRef = useRef<PositionWeight[]>([]);

  // Descriptor ref so we can swap when drill changes without remounting
  const descriptorRef = useRef<TrainingDescriptor<DrillQuestion, DrillConfig & TrainingConfig> | null>(null);

  // Build a stable descriptor shim that always delegates to drillRef.current
  // This avoids recreating useTrainingSession's callbacks when drill changes.
  const stableDescriptor = useRef<TrainingDescriptor<DrillQuestion, DrillConfig & TrainingConfig>>({
    generate(config, weights) {
      return descriptorRef.current!.generate(config, weights);
    },
    validate(question, answer) {
      return descriptorRef.current!.validate(question, answer);
    },
    getHint(question) {
      return descriptorRef.current!.getHint(question);
    },
  }).current;

  const onSessionComplete = useCallback(
    async (
      results: AnswerResult<DrillQuestion>[],
      config: DrillConfig & TrainingConfig,
      stats: {score: number; bestStreak: number; durationMs: number},
    ): Promise<number> => {
      const drill = drillRef.current;
      if (!drill) return -1;

      const correctCount = results.filter(r => r.isCorrect).length;
      const totalQuestions = results.length;

      const sessionId = await createFretboardSession({
        drillType: drill.type as DrillType,
        difficulty: drill.difficulty,
        totalQuestions,
        correctAnswers: correctCount,
        durationMs: stats.durationMs,
        xpEarned: stats.score,
      });

      await saveAttempts(
        sessionId,
        results.map(r => {
          const position = getQuestionPosition(r.question);
          return {
            drillType: drill.type as DrillType,
            stringIndex: position.string,
            fret: position.fret,
            expectedAnswer: getExpectedAnswer(r.question),
            givenAnswer: r.givenAnswer,
            status: (r.isSkipped
              ? 'skipped'
              : r.isCorrect
                ? 'correct'
                : 'incorrect') as AttemptStatus,
            responseTimeMs: r.responseTimeMs,
          };
        }),
      );

      const responseTimes = results
        .map(r => r.responseTimeMs)
        .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n))
        .sort((a, b) => a - b);
      const medianMs = responseTimes.length > 0
        ? responseTimes[Math.floor(responseTimes.length / 2)]
        : 0;
      await recordEventSafely({
        kind: 'fretboard_session_finished',
        drillType: drill.type as string,
        difficulty: (drill.difficulty as 'easy' | 'medium' | 'hard') ?? 'medium',
        correct: correctCount,
        total: totalQuestions,
        medianMs,
        sessionId,
      });

      return sessionId;
    },
    [],
  );

  const {state, startConfiguring, startSession, submitAnswer, skipQuestion, showHint, reset} =
    useTrainingSession<DrillQuestion, DrillConfig & TrainingConfig>({
      descriptor: stableDescriptor,
      weights: weightsRef.current,
      feedbackDelayMs: 1200,
      skipDelayMs: 800,
      onSessionComplete,
    });

  // ── FretboardIQ-specific actions ────────────────────────────────────────────

  const selectDrill = useCallback((drill: DrillDescriptor) => {
    drillRef.current = drill;
    descriptorRef.current = makeTrainingDescriptor(drill);
    startConfiguring();
  }, [startConfiguring]);

  const startDrill = useCallback(
    (config: DrillConfig, weights?: PositionWeight[]) => {
      weightsRef.current = weights ?? [];
      startSession(config as DrillConfig & TrainingConfig);
    },
    [startSession],
  );

  // ── Compose state with drill field (preserves SessionState shape) ────────────

  const composedState = {
    ...state,
    drill: drillRef.current,
  };

  return {
    state: composedState,
    selectDrill,
    startDrill,
    submitAnswer,
    skipQuestion,
    showHint,
    reset,
  };
}
