import {useState, useCallback, useEffect, useRef} from 'react';
import {
  seedAnkiCards,
  getAnkiDueCards,
  updateAnkiCard,
  type FretboardCard,
} from '@/lib/local-db/fretboard';
import {noteAtPosition, areEnharmonic} from '../lib/musicTheory';
import {isLearningCard, type ReviewQuality} from '@/lib/repertoire/sm2';

export type AnkiPhase = 'loading' | 'showing_front' | 'showing_back' | 'completed';

export interface AnkiSessionState {
  phase: AnkiPhase;
  cards: FretboardCard[];
  currentIndex: number;
  currentCard: FretboardCard | null;
  lastWasCorrect: boolean | null;
  selectedAnswer: string | null;
  reviewedCount: number;
  correctCount: number;
  /** Original queue length — used for progress bar (cards.length grows when requeuing). */
  totalUniqueCards: number;
}

export function useAnkiSession() {
  const ratingInFlightRef = useRef<number | null>(null);
  const [state, setState] = useState<AnkiSessionState>({
    phase: 'loading',
    cards: [],
    currentIndex: 0,
    currentCard: null,
    lastWasCorrect: null,
    selectedAnswer: null,
    reviewedCount: 0,
    correctCount: 0,
    totalUniqueCards: 0,
  });

  useEffect(() => {
    async function init() {
      await seedAnkiCards();
      const allDue = await getAnkiDueCards();

      const newCards = allDue.filter(c => c.repetitions === 0);
      const reviewCards = allDue.filter(c => c.repetitions > 0);

      const queue = [...shuffle(newCards), ...shuffle(reviewCards)];

      setState(prev => ({
        ...prev,
        phase: queue.length === 0 ? 'completed' : 'showing_front',
        cards: queue,
        currentCard: queue[0] ?? null,
        totalUniqueCards: queue.length,
      }));
    }
    init();
  }, []);

  const submitNoteAnswer = useCallback((note: string) => {
    setState(prev => {
      if (!prev.currentCard || prev.phase !== 'showing_front') return prev;
      const correct = noteAtPosition(prev.currentCard.stringIndex, prev.currentCard.fret);
      const isCorrect = areEnharmonic(note, correct);
      return {
        ...prev,
        phase: 'showing_back',
        selectedAnswer: note,
        lastWasCorrect: isCorrect,
      };
    });
  }, []);

  const submitPositionAnswer = useCallback((stringIndex: number, fret: number) => {
    setState(prev => {
      if (!prev.currentCard || prev.phase !== 'showing_front') return prev;
      const isCorrect =
        stringIndex === prev.currentCard.stringIndex && fret === prev.currentCard.fret;
      return {
        ...prev,
        phase: 'showing_back',
        selectedAnswer: `${stringIndex},${fret}`,
        lastWasCorrect: isCorrect,
      };
    });
  }, []);

  const rateCard = useCallback(async (quality: ReviewQuality) => {
    const card = state.cards[state.currentIndex];
    if (!card) return;
    if (ratingInFlightRef.current === card.id) return;
    ratingInFlightRef.current = card.id;

    const requeue = isLearningCard(card.repetitions) && quality < 4;

    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      const isCorrect = quality >= 3;

      let newCards = prev.cards;
      if (requeue) {
        const insertAt = Math.min(nextIndex + 4, prev.cards.length);
        newCards = [
          ...prev.cards.slice(0, insertAt),
          card,
          ...prev.cards.slice(insertAt),
        ];
      }

      const nextCard = newCards[nextIndex] ?? null;
      return {
        ...prev,
        cards: newCards,
        phase: nextCard ? 'showing_front' : 'completed',
        currentIndex: nextIndex,
        currentCard: nextCard,
        lastWasCorrect: null,
        selectedAnswer: null,
        reviewedCount: requeue ? prev.reviewedCount : prev.reviewedCount + 1,
        correctCount: requeue ? prev.correctCount : prev.correctCount + (isCorrect ? 1 : 0),
      };
    });

    if (!requeue) {
      await updateAnkiCard(card.id, quality);
    }
    ratingInFlightRef.current = null;
  }, [state.cards, state.currentIndex]);

  return {
    state,
    submitNoteAnswer,
    submitPositionAnswer,
    rateCard,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
