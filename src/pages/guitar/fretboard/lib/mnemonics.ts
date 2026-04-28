// src/pages/guitar/fretboard/lib/mnemonics.ts

export interface MnemonicEntry {
  note: string;
  mnemonic: string;
}

export const LOW_E_MNEMONICS: Record<number, MnemonicEntry> = {
  0:  {note: 'E', mnemonic: 'Open string — the E string'},
  1:  {note: 'F', mnemonic: 'F is first'},
  3:  {note: 'G', mnemonic: 'Top note of a G chord'},
  5:  {note: 'A', mnemonic: 'Five is alive → A'},
  7:  {note: 'B', mnemonic: 'Your birthday is on the 7th → B'},
  8:  {note: 'C', mnemonic: 'Crazy eight → C'},
  10: {note: 'D', mnemonic: 'Decade = 10 → D'},
  12: {note: 'E', mnemonic: 'Double dot — notes start over → E'},
};

export function getMnemonic(stringIndex: number, fret: number): string | null {
  if (stringIndex !== 0) return null;
  return LOW_E_MNEMONICS[fret]?.mnemonic ?? null;
}
