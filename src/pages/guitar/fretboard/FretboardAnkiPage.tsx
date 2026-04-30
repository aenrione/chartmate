import {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft, CheckCircle, XCircle} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useAnkiSession} from './hooks/useAnkiSession';
import Fretboard from './components/Fretboard';
import NoteButtons from './components/NoteButtons';
import {getMnemonic} from './lib/mnemonics';
import {noteAtPosition, NOTES} from './lib/musicTheory';
import {QUALITY_LABELS, REVIEW_QUALITIES, previewButtonLabel, isLearningCard} from '@/lib/repertoire/sm2';
import type {ReviewQuality} from '@/lib/repertoire/sm2';
import type {HighlightedPosition} from './components/Fretboard';

const QUALITY_COLORS: Record<ReviewQuality, string> = {
  1: 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20',
  3: 'border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20',
  4: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
  5: 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
};

const STRING_NAMES = ['Low E', 'A', 'D', 'G', 'B', 'High E'];
const ACCENT = '#C6BFFF';

// ── Fret selector (note_to_pos front) ───────────────────────────────────────

function FretButtons({onSelect}: {onSelect: (fret: number) => void}) {
  return (
    <div className="w-full space-y-1.5">
      {/* Open string — full-width distinctive button */}
      <button
        onClick={() => onSelect(0)}
        className="w-full py-2 rounded-xl border border-outline-variant/20 bg-surface-container text-sm font-semibold text-on-surface hover:bg-surface-container-high active:scale-[0.98] transition-all"
      >
        Open (0)
      </button>
      {/* Frets 1–12 in a 6-column grid */}
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({length: 12}, (_, i) => i + 1).map(f => (
          <button
            key={f}
            onClick={() => onSelect(f)}
            className="py-2 rounded-xl border border-outline-variant/20 bg-surface-container text-sm font-semibold text-on-surface hover:bg-surface-container-high active:scale-[0.98] transition-all"
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function FretboardAnkiPage() {
  const navigate = useNavigate();
  const {state, submitNoteAnswer, submitPositionAnswer, rateCard} = useAnkiSession();
  const {phase, currentCard, lastWasCorrect, selectedAnswer, reviewedCount, correctCount, totalUniqueCards} = state;

  useEffect(() => {
    const KEY_MAP: Record<string, ReviewQuality> = {'1': 1, '2': 3, '3': 4, '4': 5};
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { navigate('/guitar/fretboard'); return; }
      if (phase === 'showing_back' && e.key in KEY_MAP) {
        rateCard(KEY_MAP[e.key as keyof typeof KEY_MAP]);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, rateCard, navigate]);

  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-on-surface-variant text-sm">Loading cards…</p>
      </div>
    );
  }

  if (phase === 'completed') {
    const accuracy = reviewedCount > 0 ? Math.round((correctCount / reviewedCount) * 100) : 0;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-6">
        <div className="text-6xl">🎸</div>
        <h2 className="text-2xl font-black font-headline text-on-surface">All caught up!</h2>
        <div className="flex gap-8 text-center">
          <div>
            <p className="text-3xl font-bold text-primary">{reviewedCount}</p>
            <p className="text-sm text-on-surface-variant">Cards reviewed</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-secondary">{accuracy}%</p>
            <p className="text-sm text-on-surface-variant">Accuracy</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/guitar/fretboard')}
          className="px-8 py-3 rounded-2xl bg-primary text-on-primary font-bold hover:bg-primary/90 active:scale-95 transition-all"
        >
          Back to FretboardIQ
        </button>
      </div>
    );
  }

  if (!currentCard) return null;

  const correctNote = noteAtPosition(currentCard.stringIndex, currentCard.fret);
  const mnemonic = getMnemonic(currentCard.stringIndex, currentCard.fret);
  const isPosFront = currentCard.direction === 'pos_to_note';

  // Build highlighted positions
  const highlighted: HighlightedPosition[] = [];
  if (isPosFront) {
    highlighted.push({
      string: currentCard.stringIndex,
      fret: currentCard.fret,
      color: phase === 'showing_back'
        ? (lastWasCorrect ? '#00CEC9' : '#FFB4AB')
        : ACCENT,
      glow: true,
      pulse: phase === 'showing_front',
      label: phase === 'showing_back' ? correctNote : undefined,
    });
  } else if (phase === 'showing_back') {
    // Show the correct fret
    highlighted.push({
      string: currentCard.stringIndex,
      fret: currentCard.fret,
      color: lastWasCorrect ? '#00CEC9' : '#FFB4AB',
      glow: true,
      label: correctNote,
    });
    // Show the wrong fret the user guessed (if incorrect)
    if (!lastWasCorrect && selectedAnswer) {
      const [, wrongFret] = selectedAnswer.split(',').map(Number);
      if (wrongFret !== currentCard.fret) {
        highlighted.push({
          string: currentCard.stringIndex,
          fret: wrongFret,
          color: '#FFB4AB',
          glow: false,
        });
      }
    }
  }

  // Highlight target string on note_to_pos front
  const highlightedStrings =
    !isPosFront && phase === 'showing_front'
      ? [{string: currentCard.stringIndex, color: ACCENT}]
      : undefined;

  // Auto-scroll:
  // - pos_to_note: always scroll to the highlighted fret
  // - note_to_pos front: scroll to start (fret 0)
  // - note_to_pos back: scroll to the correct fret so user sees where it was
  const scrollToFret = !isPosFront && phase === 'showing_front' ? 0 : currentCard.fret;

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Compact header */}
      <header className="flex items-center justify-between px-4 py-2 shrink-0">
        <button
          onClick={() => navigate('/guitar/fretboard')}
          className="p-1.5 rounded-full hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-on-surface-variant" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-32 h-1 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{width: `${totalUniqueCards > 0 ? (reviewedCount / totalUniqueCards) * 100 : 0}%`}}
            />
          </div>
          <span className="text-xs text-on-surface-variant tabular-nums font-mono">
            {reviewedCount} / {totalUniqueCards}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-3 pb-3 gap-2.5">
        {/* Prompt label */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">
            {isPosFront
              ? 'Name this note'
              : `Find on the ${STRING_NAMES[currentCard.stringIndex]} string`}
          </span>
          {isLearningCard(currentCard.repetitions) && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-1 rounded-full">
              Learning
            </span>
          )}
        </div>

        {/* Note to find (note_to_pos front) */}
        {!isPosFront && phase === 'showing_front' && (
          <div className="text-4xl lg:text-5xl font-black font-headline text-primary leading-none py-1">
            {correctNote}
          </div>
        )}

        {/* Fretboard — key resets scroll on card change; scrollToFret handles phase changes */}
        <section className="w-full">
          <Fretboard
            key={currentCard.id}
            highlightedPositions={highlighted}
            interactive={false}
            maxFret={12}
            compact
            highlightedStrings={highlightedStrings}
            scrollToFret={scrollToFret}
          />
        </section>

        {/* Note buttons (pos_to_note front — user names the note) */}
        {isPosFront && phase === 'showing_front' && (
          <section className="w-full max-w-4xl px-2">
            <NoteButtons
              options={[...NOTES]}
              onSelect={submitNoteAnswer}
              disabled={false}
              showResult={false}
            />
          </section>
        )}

        {/* Fret buttons (note_to_pos front — user picks the fret) */}
        {!isPosFront && phase === 'showing_front' && (
          <section className="w-full max-w-lg px-1">
            <FretButtons onSelect={fret => submitPositionAnswer(currentCard.stringIndex, fret)} />
          </section>
        )}

        {/* Back side — result + confidence rating */}
        {phase === 'showing_back' && (
          <div className="w-full max-w-lg flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-2xl',
              lastWasCorrect ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
            )}>
              {lastWasCorrect
                ? <CheckCircle className="h-4 w-4 shrink-0" />
                : <XCircle className="h-4 w-4 shrink-0" />}
              <div>
                <p className="font-bold text-sm">
                  {lastWasCorrect ? 'Correct!' : 'Not quite —'} {correctNote}
                  {!isPosFront && ` at fret ${currentCard.fret === 0 ? 'Open' : currentCard.fret}`}
                </p>
                {mnemonic && (
                  <p className="text-xs opacity-80 mt-0.5 italic">{mnemonic}</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-center text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
                How confident are you?
              </p>
              <div className="grid grid-cols-4 gap-2">
                {REVIEW_QUALITIES.map(q => {
                  const nextLabel = previewButtonLabel(
                    q,
                    currentCard.repetitions,
                    currentCard.easeFactor,
                    currentCard.interval,
                  );
                  return (
                    <button
                      key={q}
                      onClick={() => rateCard(q)}
                      className={cn(
                        'flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-xl border font-semibold transition-all active:scale-95 text-sm',
                        QUALITY_COLORS[q],
                        lastWasCorrect === false && q === 1 && 'ring-2 ring-red-400/50',
                      )}
                    >
                      <span>{QUALITY_LABELS[q]}</span>
                      <span className="text-[10px] opacity-60">{nextLabel}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-xs text-outline/60 mt-2 hidden lg:block">
                <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">1</kbd> Again &nbsp;
                <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">2</kbd> Hard &nbsp;
                <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">3</kbd> Good &nbsp;
                <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">4</kbd> Easy
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
