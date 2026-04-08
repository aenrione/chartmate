// src/pages/guitar/ear/EarSessionPage.tsx
import {useEffect, useRef, useState, useCallback} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {SessionConfigDialog} from './SessionConfigDialog';
import {SessionHUD} from './components/SessionHUD';
import {AudioPlayer} from './components/AudioPlayer';
import {AnswerGrid} from './components/AnswerGrid';
import {getExercise} from './exercises/index';
import {useEarSession} from './hooks/useEarSession';
import {useEarProgress} from './hooks/useEarProgress';
import type {EarExerciseType} from '@/lib/local-db/ear-training';
import type {EarConfig} from './exercises/types';

// Trigger registrations
import './exercises/index';

export default function EarSessionPage() {
  const {exerciseType} = useParams<{exerciseType: string}>();
  const navigate = useNavigate();

  const descriptor = (() => {
    try { return getExercise(exerciseType as EarExerciseType); }
    catch { return null; }
  })();

  const {weights} = useEarProgress(exerciseType as EarExerciseType);
  const {state, startConfiguring, startSession, submitAnswer, skipQuestion, showHint, reset} =
    useEarSession(descriptor, weights);

  const [configOpen, setConfigOpen] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Start in configuring mode on mount
  useEffect(() => {
    startConfiguring();
    setConfigOpen(true);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Timer
  useEffect(() => {
    if (state.phase === 'awaiting_answer' || state.phase === 'showing_feedback') {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setElapsed(Date.now() - state.startTime), 1000);
      }
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined; }
    }
  }, [state.phase, state.startTime]);

  // Navigate to summary on completion
  useEffect(() => {
    if (state.phase === 'completed') {
      navigate('/guitar/ear/summary', {state: {results: state.results, exerciseType, sessionId: state.sessionId}});
    }
  }, [state.phase]);

  // Reset selected answer on new question
  useEffect(() => {
    if (state.phase === 'awaiting_answer') setSelectedAnswer(null);
  }, [state.currentQuestion?.id]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (state.phase !== 'awaiting_answer') return;
      if (e.code === 'Space') { e.preventDefault(); handlePlay(); }
      if (e.key === 'a' || e.key === 'A') handlePlay();
      if (e.key === 's' || e.key === 'S') skipQuestion();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase]);

  async function handlePlay() {
    if (!descriptor || !state.currentQuestion) return;
    await descriptor.play(state.currentQuestion, state.config ?? {questionCount: 20, playbackMode: 'melodic', direction: 'both', speed: 'medium', fixedRoot: false, autoAdvance: true, scope: []});
  }

  function handleAnswer(answer: string) {
    setSelectedAnswer(answer);
    submitAnswer(answer);
  }

  function handleLaunch(config: EarConfig) {
    setConfigOpen(false);
    startSession(config);
  }

  if (!descriptor) {
    return <div className="p-8 text-on-surface-variant">Unknown exercise type: {exerciseType}</div>;
  }

  const options = state.currentQuestion ? descriptor.allOptions : [];
  const correctAnswer = state.phase === 'showing_feedback' ? state.currentQuestion?.correctAnswer ?? null : null;

  // Context display (key info for contextual exercises)
  const context = (() => {
    if (!state.currentQuestion) return null;
    const q = state.currentQuestion as any;
    if (q.key) return `Key of ${q.key} Major`;
    return null;
  })();

  return (
    <div className="flex flex-col h-full">
      {state.phase !== 'idle' && state.phase !== 'configuring' && (
        <SessionHUD
          exerciseName={descriptor.name}
          questionIndex={state.questionIndex}
          totalQuestions={state.config?.questionCount ?? 0}
          score={state.score}
          streak={state.streak}
          elapsedMs={elapsed}
        />
      )}

      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center gap-8 p-8">
        {(state.phase === 'awaiting_answer' || state.phase === 'showing_feedback') && (
          <>
            <AudioPlayer onPlay={handlePlay} disabled={state.phase === 'showing_feedback'} />

            {context && (
              <div className="rounded-full bg-surface-container-high px-4 py-1.5 text-sm text-on-surface-variant">
                {context}
              </div>
            )}

            {state.hint && (
              <p className="text-sm text-on-surface-variant italic">{state.hint}</p>
            )}

            <div className="w-full max-w-2xl">
              <AnswerGrid
                options={options}
                selectedAnswer={selectedAnswer}
                correctAnswer={correctAnswer}
                onSelect={handleAnswer}
                columns={options.length <= 4 ? 2 : options.length <= 9 ? 3 : 4}
              />
            </div>

            <button
              onClick={skipQuestion}
              className="text-xs text-on-surface-variant hover:text-on-surface"
            >
              Skip this question → <span className="opacity-50">[S]</span>
            </button>
          </>
        )}
      </div>

      <div className="border-t border-surface-container-high px-6 py-3 flex items-center justify-between">
        <span className="text-xs text-on-surface-variant">
          Auto-advance: {state.config?.autoAdvance ? 'on' : 'off'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => { reset(); navigate('/guitar/ear'); }}
            className="rounded-full px-4 py-2 text-xs font-medium bg-surface-container-high text-on-surface"
          >
            End Exercise
          </button>
        </div>
      </div>

      <SessionConfigDialog
        descriptor={descriptor}
        open={configOpen}
        onLaunch={handleLaunch}
        onCancel={() => navigate('/guitar/ear')}
      />
    </div>
  );
}
