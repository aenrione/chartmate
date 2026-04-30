import {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft, CheckCircle, XCircle} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useAnkiSession} from './hooks/useAnkiSession';
import Fretboard from './components/Fretboard';
import NoteButtons from './components/NoteButtons';
import {getMnemonic} from './lib/mnemonics';
import {noteAtPosition, NOTES} from './lib/musicTheory';
import {QUALITY_LABELS, REVIEW_QUALITIES, previewNextInterval} from '@/lib/repertoire/sm2';
import type {ReviewQuality} from '@/lib/repertoire/sm2';
import type {HighlightedPosition} from './components/Fretboard';

const QUALITY_COLORS: Record<ReviewQuality, string> = {
  1: 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20',
  3: 'border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20',
  4: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
  5: 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
};

const STRING_NAMES = ['Low E', 'A', 'D', 'G', 'B', 'High E'];

export default function FretboardAnkiPage() {
  const navigate = useNavigate();
  const {state, submitNoteAnswer, submitPositionAnswer, rateCard} = useAnkiSession();
  const {phase, currentCard, currentIndex, cards, lastWasCorrect, selectedAnswer, reviewedCount, correctCount} = state;

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

  const highlighted: HighlightedPosition[] = [];
  if (isPosFront) {
    highlighted.push({
      string: currentCard.stringIndex,
      fret: currentCard.fret,
      color: phase === 'showing_back'
        ? (lastWasCorrect ? '#00CEC9' : '#FFB4AB')
        : '#C6BFFF',
      glow: true,
      pulse: phase === 'showing_front',
      label: phase === 'showing_back' ? correctNote : undefined,
    });
  } else {
    if (phase === 'showing_back') {
      highlighted.push({
        string: currentCard.stringIndex,
        fret: currentCard.fret,
        color: lastWasCorrect ? '#00CEC9' : '#FFB4AB',
        glow: true,
        label: correctNote,
      });
      if (!lastWasCorrect && selectedAnswer) {
        const [tapStr, tapFret] = selectedAnswer.split(',').map(Number);
        if (tapStr !== currentCard.stringIndex || tapFret !== currentCard.fret) {
          highlighted.push({string: tapStr, fret: tapFret, color: '#FFB4AB', glow: false});
        }
      }
    }
  }

  const clickablePositions = (!isPosFront && phase === 'showing_front')
    ? Array.from({length: 13}, (_, f) => ({string: currentCard.stringIndex, fret: f}))
    : undefined;

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate('/guitar/fretboard')}
          className="p-2 rounded-full hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-on-surface-variant" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-40 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{width: `${cards.length > 0 ? (currentIndex / cards.length) * 100 : 0}%`}}
            />
          </div>
          <span className="text-sm text-on-surface-variant tabular-nums font-mono">
            {currentIndex + 1} / {cards.length}
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-12 gap-8">
        <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">
          {isPosFront ? 'Name this note' : `Find this note on the ${STRING_NAMES[currentCard.stringIndex]} string`}
        </span>

        {!isPosFront && phase === 'showing_front' && (
          <div className="text-6xl font-black font-headline text-primary">
            {correctNote}
          </div>
        )}

        <section className="w-full max-w-[95vw]">
          <Fretboard
            highlightedPositions={highlighted}
            interactive={!isPosFront && phase === 'showing_front'}
            clickablePositions={clickablePositions}
            onPositionClick={pos => submitPositionAnswer(pos.string, pos.fret)}
          />
        </section>

        {isPosFront && phase === 'showing_front' && (
          <section className="w-full max-w-4xl px-6">
            <NoteButtons
              options={[...NOTES]}
              onSelect={submitNoteAnswer}
              disabled={false}
              showResult={false}
            />
          </section>
        )}

        {phase === 'showing_back' && (
          <div className="w-full max-w-lg flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className={cn(
              'flex items-center gap-3 px-5 py-3 rounded-2xl',
              lastWasCorrect ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
            )}>
              {lastWasCorrect
                ? <CheckCircle className="h-5 w-5 shrink-0" />
                : <XCircle className="h-5 w-5 shrink-0" />}
              <div>
                <p className="font-bold text-sm">
                  {lastWasCorrect ? 'Correct!' : 'Not quite —'} {correctNote}
                </p>
                {mnemonic && (
                  <p className="text-xs opacity-80 mt-0.5 italic">{mnemonic}</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-center text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">
                How confident are you?
              </p>
              <div className="grid grid-cols-4 gap-3">
                {REVIEW_QUALITIES.map(q => {
                  const nextDays = previewNextInterval(
                    q,
                    currentCard.repetitions,
                    currentCard.easeFactor,
                    currentCard.interval,
                  );
                  const nextLabel = nextDays === 0 ? 'now'
                    : nextDays === 1 ? '1d'
                    : nextDays < 7 ? `${nextDays}d`
                    : nextDays < 30 ? `${Math.round(nextDays / 7)}w`
                    : `${Math.round(nextDays / 30)}mo`;
                  return (
                    <button
                      key={q}
                      onClick={() => rateCard(q)}
                      className={cn(
                        'flex flex-col items-center gap-1 py-3 px-2 rounded-xl border font-semibold transition-all active:scale-95 text-sm',
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
              <p className="text-center text-xs text-outline/60 mt-3">
                <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">1</kbd> Again &nbsp;
                <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">2</kbd> Hard &nbsp;
                <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">3</kbd> Good &nbsp;
                <kbd className="bg-surface-container px-1.5 py-0.5 rounded text-[10px]">4</kbd> Easy
              </p>
            </div>
          </div>
        )}

        {!isPosFront && phase === 'showing_front' && (
          <p className="text-sm text-on-surface-variant">Tap the correct fret on the fretboard above</p>
        )}
      </main>
    </div>
  );
}
