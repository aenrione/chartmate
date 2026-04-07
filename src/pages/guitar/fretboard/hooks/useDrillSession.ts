import {useReducer, useCallback, useRef, useEffect} from 'react';
import type {DrillQuestion, DrillConfig, AnswerResult, PositionWeight} from '../drills/types';
import type {DrillDescriptor} from '../drills/types';
import type {DrillType, Difficulty, AttemptStatus} from '@/lib/local-db/fretboard';
import {createFretboardSession, saveAttempts} from '@/lib/local-db/fretboard';

// ── State ────────────────────────────────────────────────────────────────────

export type SessionPhase =
  | 'idle'
  | 'configuring'
  | 'showing_question'
  | 'awaiting_answer'
  | 'showing_feedback'
  | 'completed';

export interface SessionState {
  phase: SessionPhase;
  drill: DrillDescriptor | null;
  config: DrillConfig | null;
  currentQuestion: DrillQuestion | null;
  questionIndex: number;
  results: AnswerResult[];
  score: number;
  streak: number;
  bestStreak: number;
  startTime: number;
  questionStartTime: number;
  lastAnswerCorrect: boolean | null;
  hint: string | null;
  sessionId: number | null;
}

const INITIAL_STATE: SessionState = {
  phase: 'idle',
  drill: null,
  config: null,
  currentQuestion: null,
  questionIndex: 0,
  results: [],
  score: 0,
  streak: 0,
  bestStreak: 0,
  startTime: 0,
  questionStartTime: 0,
  lastAnswerCorrect: null,
  hint: null,
  sessionId: null,
};

// ── Actions ──────────────────────────────────────────────────────────────────

type SessionAction =
  | {type: 'START_CONFIGURING'; drill: DrillDescriptor}
  | {type: 'START_DRILL'; config: DrillConfig; weights?: PositionWeight[]}
  | {type: 'SHOW_QUESTION'; question: DrillQuestion}
  | {type: 'SUBMIT_ANSWER'; answer: string; responseTimeMs: number}
  | {type: 'SKIP_QUESTION'}
  | {type: 'SHOW_HINT'}
  | {type: 'FEEDBACK_COMPLETE'}
  | {type: 'FINISH_DRILL'; sessionId: number}
  | {type: 'RESET'};

// ── Reducer ──────────────────────────────────────────────────────────────────

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'START_CONFIGURING':
      return {
        ...INITIAL_STATE,
        phase: 'configuring',
        drill: action.drill,
      };

    case 'START_DRILL':
      return {
        ...state,
        phase: 'showing_question',
        config: action.config,
        startTime: Date.now(),
        questionStartTime: Date.now(),
        results: [],
        score: 0,
        streak: 0,
        bestStreak: 0,
        questionIndex: 0,
      };

    case 'SHOW_QUESTION':
      return {
        ...state,
        phase: 'awaiting_answer',
        currentQuestion: action.question,
        questionStartTime: Date.now(),
        hint: null,
        lastAnswerCorrect: null,
      };

    case 'SUBMIT_ANSWER': {
      if (!state.drill || !state.currentQuestion) return state;
      const isCorrect = state.drill.validator.validate(state.currentQuestion, action.answer);
      const result: AnswerResult = {
        question: state.currentQuestion,
        givenAnswer: action.answer,
        isCorrect,
        isSkipped: false,
        responseTimeMs: action.responseTimeMs,
      };

      const newStreak = isCorrect ? state.streak + 1 : 0;
      const speedBonus = isCorrect ? (action.responseTimeMs < 1000 ? 5 : action.responseTimeMs < 2000 ? 3 : 0) : 0;
      const scoreGain = isCorrect ? 10 + speedBonus : 0;

      return {
        ...state,
        phase: 'showing_feedback',
        results: [...state.results, result],
        score: state.score + scoreGain,
        streak: newStreak,
        bestStreak: Math.max(state.bestStreak, newStreak),
        lastAnswerCorrect: isCorrect,
        questionIndex: state.questionIndex + 1,
      };
    }

    case 'SKIP_QUESTION': {
      if (!state.currentQuestion) return state;
      const result: AnswerResult = {
        question: state.currentQuestion,
        givenAnswer: null,
        isCorrect: false,
        isSkipped: true,
        responseTimeMs: Date.now() - state.questionStartTime,
      };
      return {
        ...state,
        phase: 'showing_feedback',
        results: [...state.results, result],
        streak: 0,
        lastAnswerCorrect: false,
        questionIndex: state.questionIndex + 1,
      };
    }

    case 'SHOW_HINT':
      if (!state.drill || !state.currentQuestion) return state;
      return {
        ...state,
        hint: state.drill.generator.getHint(state.currentQuestion),
      };

    case 'FEEDBACK_COMPLETE':
      return {
        ...state,
        phase: 'showing_question',
      };

    case 'FINISH_DRILL':
      return {
        ...state,
        phase: 'completed',
        sessionId: action.sessionId,
      };

    case 'RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDrillSession() {
  const [state, dispatch] = useReducer(sessionReducer, INITIAL_STATE);
  const weightsRef = useRef<PositionWeight[]>([]);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finishDrillRef = useRef<() => void>(() => {});

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const selectDrill = useCallback((drill: DrillDescriptor) => {
    dispatch({type: 'START_CONFIGURING', drill});
  }, []);

  const startDrill = useCallback(
    (config: DrillConfig, weights?: PositionWeight[]) => {
      if (!state.drill) return;
      weightsRef.current = weights ?? [];
      dispatch({type: 'START_DRILL', config, weights});

      // Generate first question
      const question = state.drill.generator.generate(config, weights);
      dispatch({type: 'SHOW_QUESTION', question});
    },
    [state.drill],
  );

  const submitAnswer = useCallback(
    (answer: string) => {
      if (state.phase !== 'awaiting_answer' || !state.config || !state.drill) return;
      const responseTimeMs = Date.now() - state.questionStartTime;
      dispatch({type: 'SUBMIT_ANSWER', answer, responseTimeMs});

      // Auto-advance after feedback delay
      feedbackTimerRef.current = setTimeout(() => {
        if (state.questionIndex + 1 >= (state.config?.questionCount ?? 20)) {
          finishDrillRef.current();
        } else {
          dispatch({type: 'FEEDBACK_COMPLETE'});
          const nextQuestion = state.drill!.generator.generate(
            state.config!,
            weightsRef.current,
          );
          dispatch({type: 'SHOW_QUESTION', question: nextQuestion});
        }
      }, 1200);
    },
    [state.phase, state.config, state.drill, state.questionIndex, state.questionStartTime],
  );

  const skipQuestion = useCallback(() => {
    if (state.phase !== 'awaiting_answer') return;
    dispatch({type: 'SKIP_QUESTION'});

    feedbackTimerRef.current = setTimeout(() => {
      if (!state.config || !state.drill) return;
      if (state.questionIndex + 1 >= state.config.questionCount) {
        finishDrillRef.current();
      } else {
        dispatch({type: 'FEEDBACK_COMPLETE'});
        const nextQuestion = state.drill.generator.generate(
          state.config,
          weightsRef.current,
        );
        dispatch({type: 'SHOW_QUESTION', question: nextQuestion});
      }
    }, 800);
  }, [state.phase, state.config, state.drill, state.questionIndex]);

  const showHint = useCallback(() => {
    dispatch({type: 'SHOW_HINT'});
  }, []);

  const finishDrill = useCallback(async () => {
    if (!state.drill || !state.config) return;
    const durationMs = Date.now() - state.startTime;
    const correctCount = state.results.filter(r => r.isCorrect).length + (state.lastAnswerCorrect ? 1 : 0);
    const totalQuestions = state.results.length + 1;

    const isPerfect = correctCount === totalQuestions;
    const streakBonus = state.bestStreak * 5;
    const perfectBonus = isPerfect ? 50 : 0;
    const xpEarned = state.score + streakBonus + perfectBonus;

    try {
      const sessionId = await createFretboardSession({
        drillType: state.drill.type,
        difficulty: state.drill.difficulty,
        totalQuestions,
        correctAnswers: correctCount,
        durationMs,
        xpEarned,
      });

      // Save individual attempts
      const allResults = [...state.results];
      if (state.currentQuestion) {
        allResults.push({
          question: state.currentQuestion,
          givenAnswer: state.lastAnswerCorrect !== null ? 'last' : null,
          isCorrect: state.lastAnswerCorrect ?? false,
          isSkipped: false,
          responseTimeMs: Date.now() - state.questionStartTime,
        });
      }

      await saveAttempts(
        sessionId,
        allResults.map(r => {
          const position = getQuestionPosition(r.question);
          return {
            drillType: state.drill!.type,
            stringIndex: position.string,
            fret: position.fret,
            expectedAnswer: getExpectedAnswer(r.question),
            givenAnswer: r.givenAnswer,
            status: (r.isSkipped ? 'skipped' : r.isCorrect ? 'correct' : 'incorrect') as AttemptStatus,
            responseTimeMs: r.responseTimeMs,
          };
        }),
      );

      dispatch({type: 'FINISH_DRILL', sessionId});
    } catch (error) {
      console.error('Failed to save drill session:', error);
      dispatch({type: 'FINISH_DRILL', sessionId: -1});
    }
  }, [state]);

  // Keep ref in sync
  finishDrillRef.current = finishDrill;

  const reset = useCallback(() => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    dispatch({type: 'RESET'});
  }, []);

  return {
    state,
    selectDrill,
    startDrill,
    submitAnswer,
    skipQuestion,
    showHint,
    reset,
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
