export const DEGREES = ['I', 'IIm', 'IIIm', 'IV', 'V', 'VIm', 'VII°'] as const;

export interface KeyInfo {
  key: string;
  /** Sharp-normalized pitch classes — for matching FretNote.name */
  scaleNotes: string[];
  /** Display chord names for degrees I–VII */
  chords: string[];
}

export const KEYS: KeyInfo[] = [
  { key: 'C',  scaleNotes: ['C','D','E','F','G','A','B'],                 chords: ['C','Dm','Em','F','G','Am','B°']       },
  { key: 'G',  scaleNotes: ['G','A','B','C','D','E','F#'],                chords: ['G','Am','Bm','C','D','Em','F#°']      },
  { key: 'D',  scaleNotes: ['D','E','F#','G','A','B','C#'],               chords: ['D','Em','F#m','G','A','Bm','C#°']     },
  { key: 'A',  scaleNotes: ['A','B','C#','D','E','F#','G#'],              chords: ['A','Bm','C#m','D','E','F#m','G#°']    },
  { key: 'E',  scaleNotes: ['E','F#','G#','A','B','C#','D#'],             chords: ['E','F#m','G#m','A','B','C#m','D#°']   },
  { key: 'B',  scaleNotes: ['B','C#','D#','E','F#','G#','A#'],            chords: ['B','C#m','D#m','E','F#','G#m','A#°']  },
  { key: 'F#', scaleNotes: ['F#','G#','A#','B','C#','D#','F'],            chords: ['F#','G#m','A#m','B','C#','D#m','F°']  },
  { key: 'Db', scaleNotes: ['C#','D#','F','F#','G#','A#','C'],            chords: ['Db','Ebm','Fm','Gb','Ab','Bbm','C°']  },
  { key: 'Ab', scaleNotes: ['G#','A#','C','C#','D#','F','G'],             chords: ['Ab','Bbm','Cm','Db','Eb','Fm','G°']   },
  { key: 'Eb', scaleNotes: ['D#','F','G','G#','A#','C','D'],              chords: ['Eb','Fm','Gm','Ab','Bb','Cm','D°']    },
  { key: 'Bb', scaleNotes: ['A#','C','D','D#','F','G','A'],               chords: ['Bb','Cm','Dm','Eb','F','Gm','A°']     },
  { key: 'F',  scaleNotes: ['F','G','A','A#','C','D','E'],                chords: ['F','Gm','Am','Bb','C','Dm','E°']      },
];

export function getKeyInfo(key: string): KeyInfo | undefined {
  return KEYS.find(k => k.key === key);
}
