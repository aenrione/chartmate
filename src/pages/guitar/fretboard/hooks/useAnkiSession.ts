import {useState, useCallback, useEffect} from 'react';
import {
  seedAnkiCards,
  getAnkiDueCards,
  updateAnkiCard,
  type FretboardCard,
} from '@/lib/local-db/fretboard';
import {noteAtPosition} from '../lib/musicTheory';
import {previewNextInterval} from '@/lib/repertoire/sm2';
import type {ReviewQuality} from '@/lib/repertoire/sm2';

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
}

const NEW_CARD_LIMIT = 10;

export function useAnkiSession() {
  const [state, setState] = useState<AnkiSessionState>({
    phase: 'loading',
    cards: [],
    currentIndex: 0,
    currentCard: null,
    lastWasCorrect: null,
    selectedAnswer: null,
    reviewedCount: 0,
    correctCount: 0,
  });

  useEffect(() => {
    async function init() {
      await seedAnkiCards();
      const allDue = await getAnkiDueCards();

      const newCards = allDue.filter(c => c.repetitions === 0).slice(0, NEW_CARD_LIMIT);
      const reviewCards = allDue.filter(c => c.repetitions > 0);

      const queue = [...shuffle(newCards), ...shuffle(reviewCards)];

      setState(prev => ({
        ...prev,
        phase: queue.length === 0 ? 'completed' : 'showing_front',
        cards: queue,
        currentCard: queue[0] ?? null,
      }));
    }
    init();
  }, []);

  const submitNoteAnswer = useCallback((note: string) => {
    setState(prev => {
      if (!prev.currentCard || prev.phase !== 'showing_front') return prev;
      const correct = noteAtPosition(prev.currentCard.stringIndex, prev.currentCard.fret);
      const isCorrect = areEnharmonicSimple(note, correct);
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

    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      const isCorrect = quality >= 3;
      const nextCard = prev.cards[nextIndex] ?? null;
      return {
        ...prev,
        phase: nextCard ? 'showing_front' : 'completed',
        currentIndex: nextIndex,
        currentCard: nextCard,
        lastWasCorrect: null,
        selectedAnswer: null,
        reviewedCount: prev.reviewedCount + 1,
        correctCount: prev.correctCount + (isCorrect ? 1 : 0),
      };
    });

    await updateAnkiCard(card.id, quality);
  }, [state.cards, state.currentIndex]);

  return {
    state,
    submitNoteAnswer,
    submitPositionAnswer,
    rateCard,
    previewNextInterval,
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

const ENHARMONIC_PAIRS: Record<string, string> = {
  'C#': 'Db', 'Db': 'C#',
  'D#': 'Eb', 'Eb': 'D#',
  'F#': 'Gb', 'Gb': 'F#',
  'G#': 'Ab', 'Ab': 'G#',
  'A#': 'Bb', 'Bb': 'A#',
};

function areEnharmonicSimple(a: string, b: string): boolean {
  if (a === b) return true;
  return ENHARMONIC_PAIRS[a] === b || ENHARMONIC_PAIRS[b] === a;
}
