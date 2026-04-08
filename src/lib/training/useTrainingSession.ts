// src/lib/training/useTrainingSession.ts
import {useReducer, useCallback, useRef, useEffect} from 'react';

// ── Generic types ────────────────────────────────────────────────────────────

export type TrainingPhase =
  | 'idle'
  | 'configuring'
  | 'awaiting_answer'
  | 'showing_feedback'
  | 'completed';

export interface TrainingConfig {
  questionCount: number;
  [key: string]: unknown; // tool-specific fields pass through
}

export interface TrainingDescriptor<Q, C extends TrainingConfig> {
  generate(config: C, weights?: unknown[]): Q;
  validate(question: Q, answer: string): boolean;
  getHint(question: Q): string;
}

export interface AnswerResult<Q> {
  question: Q;
  givenAnswer: string | null;
  isCorrect: boolean;
  isSkipped: boolean;
  responseTimeMs: number;
}

export interface TrainingState<Q, C extends TrainingConfig> {
  phase: TrainingPhase;
  config: C | null;
  currentQuestion: Q | null;
  questionIndex: number;
  results: AnswerResult<Q>[];
  score: number;
  streak: number;
  bestStreak: number;
  startTime: number;
  questionStartTime: number;
  lastAnswerCorrect: boolean | null;
  hint: string | null;
  sessionId: number | null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

type TrainingAction<Q, C extends TrainingConfig> =
  | {type: 'START_CONFIGURING'}
  | {type: 'START_SESSION'; config: C}
  | {type: 'SHOW_QUESTION'; question: Q}
  | {type: 'SUBMIT_ANSWER'; answer: string; responseTimeMs: number; isCorrect: boolean; speedBonus: number}
  | {type: 'SKIP_QUESTION'; responseTimeMs: number}
  | {type: 'SHOW_HINT'; hint: string}
  | {type: 'FINISH'; sessionId: number}
  | {type: 'RESET'};

// ── Reducer ──────────────────────────────────────────────────────────────────

function makeInitialState<Q, C extends TrainingConfig>(): TrainingState<Q, C> {
  return {
    phase: 'idle', config: null, currentQuestion: null,
    questionIndex: 0, results: [], score: 0, streak: 0,
    bestStreak: 0, startTime: 0, questionStartTime: 0,
    lastAnswerCorrect: null, hint: null, sessionId: null,
  };
}

function trainingReducer<Q, C extends TrainingConfig>(
  state: TrainingState<Q, C>,
  action: TrainingAction<Q, C>,
): TrainingState<Q, C> {
  switch (action.type) {
    case 'START_CONFIGURING':
      return {...makeInitialState<Q, C>(), phase: 'configuring'};

    case 'START_SESSION':
      return {
        ...makeInitialState<Q, C>(),
        phase: 'awaiting_answer',
        config: action.config,
        startTime: Date.now(),
        questionStartTime: Date.now(),
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
      const result: AnswerResult<Q> = {
        question: state.currentQuestion!,
        givenAnswer: action.answer,
        isCorrect: action.isCorrect,
        isSkipped: false,
        responseTimeMs: action.responseTimeMs,
      };
      const newStreak = action.isCorrect ? state.streak + 1 : 0;
      const scoreGain = action.isCorrect ? 10 + action.speedBonus : 0;
      return {
        ...state,
        phase: 'showing_feedback',
        results: [...state.results, result],
        score: state.score + scoreGain,
        streak: newStreak,
        bestStreak: Math.max(state.bestStreak, newStreak),
        lastAnswerCorrect: action.isCorrect,
        questionIndex: state.questionIndex + 1,
      };
    }

    case 'SKIP_QUESTION': {
      const result: AnswerResult<Q> = {
        question: state.currentQuestion!,
        givenAnswer: null,
        isCorrect: false,
        isSkipped: true,
        responseTimeMs: action.responseTimeMs,
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
      return {...state, hint: action.hint};

    case 'FINISH':
      return {...state, phase: 'completed', sessionId: action.sessionId};

    case 'RESET':
      return makeInitialState<Q, C>();

    default:
      return state;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseTrainingSessionOptions<Q, C extends TrainingConfig> {
  descriptor: TrainingDescriptor<Q, C>;
  weights?: unknown[];
  feedbackDelayMs?: number;
  skipDelayMs?: number;
  onSessionComplete(
    results: AnswerResult<Q>[],
    config: C,
    stats: {score: number; bestStreak: number; durationMs: number},
  ): Promise<number>;
}

export function useTrainingSession<Q, C extends TrainingConfig>(
  options: UseTrainingSessionOptions<Q, C>,
) {
  const {descriptor, weights = [], feedbackDelayMs = 1200, skipDelayMs = 800} = options;
  const [state, dispatch] = useReducer(
    trainingReducer as (s: TrainingState<Q, C>, a: TrainingAction<Q, C>) => TrainingState<Q, C>,
    undefined,
    () => makeInitialState<Q, C>(),
  );

  const weightsRef = useRef<unknown[]>(weights);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finishRef = useRef<() => void>(() => {});
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    weightsRef.current = weights;
  }, [weights]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const startConfiguring = useCallback(() => {
    dispatch({type: 'START_CONFIGURING'});
  }, []);

  const startSession = useCallback((config: C) => {
    dispatch({type: 'START_SESSION', config});
    const question = descriptor.generate(config, weightsRef.current as any);
    dispatch({type: 'SHOW_QUESTION', question});
  }, [descriptor]);

  const advanceOrFinish = useCallback((config: C, nextIndex: number) => {
    if (nextIndex >= config.questionCount) {
      finishRef.current();
    } else {
      const question = descriptor.generate(config, weightsRef.current as any);
      dispatch({type: 'SHOW_QUESTION', question});
    }
  }, [descriptor]);

  const submitAnswer = useCallback((answer: string) => {
    const s = stateRef.current;
    if (s.phase !== 'awaiting_answer' || !s.config || !s.currentQuestion) return;
    const responseTimeMs = Date.now() - s.questionStartTime;
    const isCorrect = descriptor.validate(s.currentQuestion, answer);
    const speedBonus = isCorrect ? (responseTimeMs < 1000 ? 5 : responseTimeMs < 2000 ? 3 : 0) : 0;
    dispatch({type: 'SUBMIT_ANSWER', answer, responseTimeMs, isCorrect, speedBonus});

    timerRef.current = setTimeout(() => {
      const current = stateRef.current;
      if (!current.config) return;
      advanceOrFinish(current.config, current.questionIndex);
    }, feedbackDelayMs);
  }, [descriptor, feedbackDelayMs, advanceOrFinish]);

  const skipQuestion = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'awaiting_answer') return;
    const responseTimeMs = Date.now() - s.questionStartTime;
    dispatch({type: 'SKIP_QUESTION', responseTimeMs});

    timerRef.current = setTimeout(() => {
      const current = stateRef.current;
      if (!current.config) return;
      advanceOrFinish(current.config, current.questionIndex);
    }, skipDelayMs);
  }, [skipDelayMs, advanceOrFinish]);

  const showHint = useCallback(() => {
    const s = stateRef.current;
    if (!s.currentQuestion) return;
    dispatch({type: 'SHOW_HINT', hint: descriptor.getHint(s.currentQuestion)});
  }, [descriptor]);

  const finishSession = useCallback(async () => {
    const s = stateRef.current;
    if (!s.config) return;
    const durationMs = Date.now() - s.startTime;
    const correctCount = s.results.filter(r => r.isCorrect).length;
    const streakBonus = s.bestStreak * 5;
    const perfectBonus = correctCount === s.config.questionCount ? 50 : 0;
    const totalScore = s.score + streakBonus + perfectBonus;

    try {
      const sessionId = await options.onSessionComplete(
        s.results,
        s.config,
        {score: totalScore, bestStreak: s.bestStreak, durationMs},
      );
      dispatch({type: 'FINISH', sessionId});
    } catch {
      dispatch({type: 'FINISH', sessionId: -1});
    }
  }, [options]);

  finishRef.current = finishSession;

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    dispatch({type: 'RESET'});
  }, []);

  return {state, startConfiguring, startSession, submitAnswer, skipQuestion, showHint, reset};
}
