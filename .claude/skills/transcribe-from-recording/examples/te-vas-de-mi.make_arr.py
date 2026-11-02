# Writes te-vas-de-mi.arrangement.json (hand-authored figures + bar map): the arrangement as code.
# usage: python te-vas-de-mi.make_arr.py <out.json>   (strum(shape, "D..UDU") -> strum tokens)
import json, sys
E = []
def F(*slots, chords=None):
    sl = [list(x) if isinstance(x, (list, tuple)) else x for x in slots]
    assert len(sl) == 6
    return {'chords': chords, 'slots': sl} if chords else sl

shapes = {'G': '320033', 'C': 'x32010', 'C/G': '332010', 'Cmaj7': 'x32000', 'D': 'xx0232', 'D/A': 'x00232',
          'Em': '022000', 'Cadd9': 'x32033', 'Bm7': 'x24232', 'A#m7': 'x13121', 'Am7': 'x02010', 'Dsus4/A': 'x00233'}

def strum(ch, hits, top_up='1-3'):
    """hits: 6-char pattern, D/U/. per slot"""
    out = []
    for c in hits:
        if c == 'D': out.append(f'{ch}:D')
        elif c == 'U': out.append(f'{ch}:U:{top_up}')
        else: out.append([])
    return out

fig = {
 # ---- Intro / interlude / outro (picked + pinched chords)
 'I1': F(['G2','B2','D3','G3','D4'], E, E, E, ['G2','B2','G3'], E, chords={'0': 'G'}),
 'I2': F(['G2','G3','D4','G4'], ['D3'], E, ['G3','D4'], ['G3'], ['G3','D4'], chords={'0': 'G'}),
 'I3': F(['C3','G3'], ['D4'], ['E3'], ['D4'], ['G3'], E, chords={'0': 'Cadd9'}),
 'I4': F(['C3','G3','D4','G4'], E, E, ['G3','D4','G4'], ['G3'], ['G3'], chords={'0': 'Cadd9'}),
 'I7': F(['D3','A3','D4','F#4'], E, E, E, E, ['C3','E3'], chords={'0': 'D'}),
 'I8': F(['G2','C3','E3','G3','C4','E4'], E, E, E, ['G3'], E, chords={'0': 'C/G'}),
 # ---- Verse (picked: bass + arpeggio on the first bar of a chord, pinch + strummed fill on the second)
 'V1': F(['G2','B2','D3','G3'], E, E, ['G2','B2','G3'], ['G2','G3'], E, chords={'0': 'G'}),
 'V2': F(['G2','D3','G3','D4','G4'], ['G4'], E, ['G3','D4','G4'], ['D3'], ['G3'], chords={'0': 'G'}),
 'V3': F(['C3','G3'], ['D4'], ['E3'], ['D4'], ['G3'], E, chords={'0': 'Cadd9'}),
 'V4': F(['C3','E3','G3','D4','G4'], E, E, ['G3','D4'], ['G3'], ['G3','B3'], chords={'0': 'Cadd9'}),
 'V5': F(['E2','B2','E3'], ['B3'], ['B2'], E, ['E3'], E, chords={'0': 'Em'}),
 'V6': F(['E2','B2','E3','G3','B3','G4'], E, E, ['E3','G3','B3'], ['E3','G3'], ['G3'], chords={'0': 'Em'}),
 'V7': F(['B2','F#3','A3','D4','F#4'], E, ['F#3','D4'], ['F#3','D4','F#4'], ['A3'], E, chords={'0': 'Bm7'}),
 'V8': F(['B2','F#3','A3','D4','F#4'], E, E, ['F3','G#3','C#4','F4'], E, E, chords={'0': 'Bm7', '3': 'A#m7'}),
 'V9': F(['A2','E3','G3','C4','E4'], E, E, ['C4','E4'], ['E2','E3','G3'], E, chords={'0': 'Am7'}),
 'V10': F(['E2','E3','G3','B3'], ['C4'], ['E4'], ['E3','G3','C4','E4'], ['E3','G3'], ['G3','B3'], chords={'0': 'Em', '1': 'Cmaj7/E'}),
 'V11': F(['A2','D3','A3','D4','G4'], E, E, ['A3','D4','F#4'], ['D3','A3','D4'], ['G3'], chords={'0': 'Dsus4/A', '3': 'D'}),
 'V12a': F(['C3','G3'], ['C4'], ['E3'], ['C3'], ['G3'], ['A2','G3'], chords={'0': 'C'}),
 'V12b': F(['A2','E3','G3','C4'], ['E3'], E, ['E3','G3','C4','E4'], ['G3'], ['G2','C3','E3','G3','C4','E4'], chords={'0': 'Am7', '5': 'C/G'}),
 # ---- Chorus (strummed; pendulum: even slots down, odd slots up)
 'C1': strum('C/G', 'D..UD.'),
 'C2': strum('C', 'D..UDU'),
 'C2m': strum('Cmaj7', 'D..UDU'),
 'C3': strum('G', 'D.DUDU'),
 'C4': strum('D/A', 'D.DUDU'),
 'C5': strum('C/G', 'D..UDU'),
 'C6': strum('C', 'D..UDU'),
 'C7': strum('G', 'D..UDU'),
 'C8': strum('D/A', 'D.DUDU'),
 'C9': strum('C/G', 'D..UD.'),
 'C10': strum('C', 'D..UDU'),
 'C11': strum('G', 'D..UDU'),
 'C12': strum('D/A', 'D..UDU'),
 'C13': strum('C/G', 'D..UD.'),
 'C14': strum('C', 'D.DU.U'),
 'C14m': strum('Cmaj7', 'D.DU.U'),
 'C15': strum('Dsus4/A', 'D.DUDU'),
 'C16': strum('D/A', 'DU.UDU'),
 # ---- Tag (strummed)
 'T1': strum('C/G', 'D..UDU'),
 'T2': strum('Cmaj7', 'D..UDU'),
 'T3': strum('D/A', 'D..UDU'),
 'T4': strum('D/A', 'D..UDU'),
 'T5': strum('C', 'D..UDU'),
 'T8': strum('C/G', 'D.D.D.'),
}
fig['I5'] = fig['V5']; fig['I6'] = fig['V6']

chorus = ['C1','C2','C3','C4','C5','C6','C7','C8','C9','C10','C11','C12','C13','C14','C15','C16']
intro = ['I1','I2','I3','I4','I5','I6','I7','I8']
verse_a = ['V1','V2','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12a']
verse_b = verse_a[:-1] + ['V12b']
ch2 = list(chorus); ch2[1] = 'C2m'; ch2[13] = 'C14m'
bars = (intro + verse_a + verse_b + chorus + intro + verse_a + verse_b + ch2 + chorus
        + ['T1','T2','T3','T4','T1','T5','T1','T8'] + ['I1','I2','I3','I4'])
assert len(bars) == 124, len(bars)
bars.append({'beats': [{'duration': '2.', 'notes': ['G2','B2','D3','G3','D4','G4']}], 'fermata': True})
sections = {1: 'Intro', 9: 'Verse 1', 33: 'Chorus 1', 49: 'Interlude', 57: 'Verse 2', 81: 'Chorus 2',
            97: 'Chorus 3', 113: 'Tag', 121: 'Outro'}
arr = {'title': 'Te vas de mí', 'artist': 'Tata Barahona', 'tempo': 118, 'timeSignature': [3, 4],
       'slotsPerBar': 6, 'slotDuration': '8', 'tuning': ['E4','B3','G3','D3','A2','E2'], 'capo': 0,
       'shapes': shapes, 'figures': fig, 'bars': bars, 'sections': {str(k): v for k, v in sections.items()}}
json.dump(arr, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)
print('bars', len(bars))
