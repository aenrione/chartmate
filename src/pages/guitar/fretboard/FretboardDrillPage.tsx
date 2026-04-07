import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';
import {getDrill} from './drills/registry';
import {useDrillSession} from './hooks/useDrillSession';
import {usePositionStats, computeWeights} from './hooks/useProgress';
import Fretboard from './components/Fretboard';
import type {HighlightedPosition} from './components/Fretboard';
import NoteButtons from './components/NoteButtons';
import DrillHUD from './components/DrillHUD';
import MasteryMeter from './components/MasteryMeter';
import type {DrillType} from '@/lib/local-db/fretboard';
import type {DrillConfig} from './drills/types';

const DEFAULT_CONFIGS: Record<string, DrillConfig> = {
  beginner: {stringRange: [0, 5], fretRange: [0, 5], questionCount: 10},
  intermediate: {stringRange: [0, 5], fretRange: [0, 12], questionCount: 15},
  advanced: {stringRange: [0, 5], fretRange: [0, 22], questionCount: 20},
};

export default function FretboardDrillPage() {
  const {drillType} = useParams<{drillType: string}>();
  const navigate = useNavigate();
  const drill = drillType ? getDrill(drillType as DrillType) : null;
  const {stats: positionStats} = usePositionStats(drillType as DrillType);
  const {state, selectDrill, startDrill, submitAnswer, skipQuestion, showHint, reset} = useDrillSession();
  const [elapsed, setElapsed] = useState(0);

  // Initialize drill
  useEffect(() => {
    if (drill && state.phase === 'idle') {
      selectDrill(drill);
    }
  }, [drill, state.phase, selectDrill]);

  // Auto-start with default config
  useEffect(() => {
    if (drill && state.phase === 'configuring') {
      const config = DEFAULT_CONFIGS[drill.difficulty];
      const weights = computeWeights(positionStats);
      startDrill(config, weights);
    }
  }, [drill, state.phase, positionStats, startDrill]);

  // Timer
  useEffect(() => {
    if (state.phase === 'awaiting_answer' || state.phase === 'showing_feedback') {
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - state.startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [state.phase, state.startTime]);

  // Keyboard shortcuts — note keys + controls
  // Map keyboard keys to note names for fast input
  const NOTE_KEYS: Record<string, string> = {
    'c': 'C', 'C': 'C',
    'd': 'D', 'D': 'D',
    'e': 'E', 'E': 'E',
    'f': 'F', 'F': 'F',
    'g': 'G', 'G': 'G',
    'a': 'A', 'A': 'A',
    'b': 'B', 'B': 'B',
  };
  // Number keys for chromatic notes: 1=C, 2=C#, 3=D, ... 0=Bb, -=B (for drills with all 12)
  const NUMBER_KEYS: Record<string, number> = {
    '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5,
    '7': 6, '8': 7, '9': 8, '0': 9, '-': 10, '=': 11,
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        navigate('/guitar/fretboard');
        return;
      }

      if (state.phase !== 'awaiting_answer') return;

      if (e.key === ' ') {
        e.preventDefault();
        skipQuestion();
        return;
      }

      // H for hint (only when not a note key being used)
      if ((e.key === 'h' || e.key === 'H') && !e.shiftKey) {
        // If drill uses note buttons and 'h' isn't needed, show hint
        // But if answer options don't include notes, always show hint
        if (drill && !drill.generator.getAnswerOptions().includes('H')) {
          e.preventDefault();
          showHint();
          return;
        }
      }

      // Sharp/flat modifiers: press # after a letter to get sharp
      // e.g. press 'c' then '#' → C#, or press 'e' then 'b' → Eb
      // For simplicity, use number keys for exact chromatic selection
      if (e.key in NUMBER_KEYS && drill) {
        e.preventDefault();
        const options = drill.generator.getAnswerOptions();
        const idx = NUMBER_KEYS[e.key];
        if (idx < options.length) {
          submitAnswer(options[idx]);
        }
        return;
      }

      // Direct note letter keys (natural notes only — fast for beginners)
      if (e.key in NOTE_KEYS) {
        e.preventDefault();
        submitAnswer(NOTE_KEYS[e.key]);
        return;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.phase, skipQuestion, showHint, navigate, submitAnswer, drill]);

  // Navigate to summary when complete
  useEffect(() => {
    if (state.phase === 'completed' && state.sessionId) {
      navigate('/guitar/fretboard/summary', {
        state: {
          sessionId: state.sessionId,
          drillType: drill?.type,
          drillName: drill?.name,
          results: state.results,
          score: state.score,
          bestStreak: state.bestStreak,
          durationMs: Date.now() - state.startTime,
          totalQuestions: state.config?.questionCount ?? 0,
        },
      });
    }
  }, [state.phase, state.sessionId]);

  if (!drill) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-on-surface-variant">Drill not found.</p>
      </div>
    );
  }

  // Build highlighted positions from current question
  const highlighted = getHighlightedPositions();

  function getHighlightedPositions(): HighlightedPosition[] {
    const question = state.currentQuestion;
    if (!question) return [];

    switch (question.type) {
      case 'note-finder':
        return [{
          ...question.position,
          color: state.lastAnswerCorrect === true ? '#00CEC9' :
                 state.lastAnswerCorrect === false ? '#FFB4AB' : '#00CEC9',
          glow: true,
          pulse: state.phase === 'awaiting_answer',
          label: state.phase === 'showing_feedback' ? question.correctAnswer : undefined,
        }];

      case 'interval-spotter':
        return [
          {...question.rootPosition, color: '#C6BFFF', glow: true, label: 'R'},
          {...question.targetPosition, color: '#00CEC9', glow: true, pulse: state.phase === 'awaiting_answer'},
        ];

      case 'octave-mapper':
        return [
          {...question.sourcePosition, color: '#C6BFFF', glow: true, label: question.sourceNote},
          ...(state.phase === 'showing_feedback'
            ? question.octavePositions.map(p => ({...p, color: '#00CEC9', label: question.sourceNote}))
            : []),
        ];

      case 'chord-tone-finder':
        return state.phase === 'showing_feedback'
          ? question.validPositions.map(p => ({...p, color: '#00CEC9', glow: true}))
          : [];

      case 'scale-navigator':
        return [
          ...question.allScalePositions
            .filter(p => !question.positionsToFill.some(f => f.string === p.string && f.fret === p.fret))
            .map(p => ({...p, color: '#C6BFFF'})),
          ...(state.phase === 'showing_feedback'
            ? question.positionsToFill.map(p => ({...p, color: '#00CEC9', glow: true}))
            : []),
        ];

      case 'caged-shapes':
        return question.shapePositions.map(p => ({...p, color: '#C6BFFF', glow: true}));

      default:
        return [];
    }
  }

  const answerOptions = drill.generator.getAnswerOptions();
  const mastery = state.config
    ? Math.round((state.results.filter(r => r.isCorrect).length / Math.max(1, state.results.length)) * 100)
    : 0;

  const prompt = getPromptText();

  function getPromptText(): string {
    const q = state.currentQuestion;
    if (!q) return '';
    switch (q.type) {
      case 'note-finder': return 'Select the correct note';
      case 'interval-spotter': return 'What interval is between these notes?';
      case 'scale-navigator': return `Fill in the ${q.rootNote} ${q.scaleName} scale`;
      case 'chord-tone-finder': return `Find the ${q.targetTone} of ${q.chordRoot} ${q.chordType}`;
      case 'octave-mapper': return `Find all octaves of ${q.sourceNote}`;
      case 'caged-shapes': return `Which CAGED shape is this?`;
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/guitar/fretboard')}
            className="p-2 rounded-full hover:bg-surface-container transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-on-surface-variant" />
          </button>
          <span className="font-headline tracking-tight font-bold text-lg text-on-surface">{drill.name}</span>
        </div>
        <DrillHUD
          timer={elapsed}
          streak={state.streak}
          score={state.score}
          questionIndex={state.questionIndex}
          totalQuestions={state.config?.questionCount ?? 0}
          difficulty={drill.difficulty}
        />
      </header>

      {/* Main Drill Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
        {/* Fretboard */}
        <section className="w-full max-w-[95vw] mb-12 relative">
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-outline-variant/10 text-[80px] font-black select-none pointer-events-none uppercase tracking-tighter">
            Fretboard
          </div>
          <Fretboard
            highlightedPositions={highlighted}
            interactive={state.currentQuestion?.type === 'scale-navigator' ||
                         state.currentQuestion?.type === 'chord-tone-finder' ||
                         state.currentQuestion?.type === 'octave-mapper'}
            onPositionClick={(pos) => submitAnswer(JSON.stringify(pos))}
            className="shadow-[0_0_20px_rgba(198,191,255,0.1)]"
          />
        </section>

        {/* Prompt */}
        <h2 className="text-sm font-label uppercase tracking-[0.2em] text-outline mb-8">
          {prompt}
        </h2>

        {/* Hint */}
        {state.hint && (
          <div className="mb-6 px-4 py-2 bg-surface-container rounded-lg text-sm text-on-surface-variant">
            {state.hint}
          </div>
        )}

        {/* Answer Buttons */}
        <section className="w-full max-w-4xl px-6">
          <NoteButtons
            options={answerOptions}
            onSelect={submitAnswer}
            disabled={state.phase !== 'awaiting_answer'}
            showResult={state.phase === 'showing_feedback'}
            selectedNote={state.results[state.results.length - 1]?.givenAnswer ?? undefined}
            correctNote={state.currentQuestion?.correctAnswer ?? undefined}
          />
        </section>
      </main>

      {/* Side HUD */}
      <aside className="fixed right-6 top-1/2 -translate-y-1/2 hidden xl:flex flex-col gap-4">
        <MasteryMeter percentage={mastery} />
      </aside>

      {/* Keyboard Hints */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6">
        <div className="flex items-center gap-2 text-xs text-outline/60 font-mono">
          <span className="px-2 py-1 bg-surface-container rounded-md border border-outline-variant/10">1-0 - =</span>
          <span>Select Note</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-outline/60 font-mono">
          <span className="px-2 py-1 bg-surface-container rounded-md border border-outline-variant/10">A-G</span>
          <span>Natural Notes</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-outline/60 font-mono">
          <span className="px-2 py-1 bg-surface-container rounded-md border border-outline-variant/10">SPACE</span>
          <span>Skip</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-outline/60 font-mono">
          <span className="px-2 py-1 bg-surface-container rounded-md border border-outline-variant/10">H</span>
          <span>Hint</span>
        </div>
      </div>
    </div>
  );
}
