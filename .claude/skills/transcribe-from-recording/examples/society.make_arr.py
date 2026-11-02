# Society (Eddie Vedder) - arrangement generator. A whole song that is nothing but strumming:
# four shapes, one bar-long figure per chord, and a bar map of chord letters.
#
# The pattern is one figure per chord rather than one per bar, because strums.py measured the
# same per-slot profile in every bar of the song (every eighth struck, beat 2 at ~60% of the
# others). The strings each stroke covers came from the per-slot pitch census, not from taste:
# beat 2's lowest-heavy share was .28 against .48 on beat 1, so it only brushes the top three.
# Direction is from strumphase.py (5/5 blocks called the on-beats down), not from the pendulum.
#
# Two G's, not one. Upper-case G is Gmaj7 "324002" (G B F#, no D); lower-case g is the barre
# G "355433" (G B D, no F#). misses.py reported D3 missing in a systematic subset of the G
# bars - every G bar that leads into a D - and barchroma.py showed those bars read D high /
# F# and B low while the rest read the reverse. The split repeats at the same position in all
# three verses: the 6-bar G run is g G g G G g. Worth 3 points of coverage and 6 of confirmed.
import json

CH = list("GGGGDDDAGGGGGGDAGGADDAGGGGGGDAGGDAGGDDDAGGGGGDAGGADDAGGGGGGDAGGDAGGDAGGDAAGG")
assert len(CH) == 76, len(CH)
# the G bars that are the barre G rather than Gmaj7 (see the note above)
PLAIN = {9, 11, 14, 23, 25, 28, 32, 41, 43, 45, 54, 56, 59, 63, 67, 71}
CH = ['g' if i + 1 in PLAIN else c for i, c in enumerate(CH)]

NAME = {"G": "Gmaj7", "g": "G", "D": "D/A", "A": "A"}

# measured pattern: 1 & 2 & 3 & 4 &  ->  D U d U D U D U
#   beat 2's down is light and only brushes strings 1-3.
# Accents: per-slot attack strength (onset flux from strums.json, divided by the bar's own
# median) and post-onset RMS gain, over all 76 bars, agree that the off-beats are the loud
# ones:  slot  0    1    2    3    4    5    6    7
#        rel  .84 1.35  .49 1.25  .92 1.46  .84 1.03
#        dB  2.03 4.09  .00 2.98 3.08 4.14 1.77 1.70
# So "!" on the & of 1, 2 and 3; "!!" on the & of 3, the only slot that is above its bar's
# median in a large majority of bars (84%, against 64% and 62%). The & of 4 is not accented:
# it reads 1.03 / 1.70 dB, no louder than the on-beats.
PAT = [("D", None, ""), ("U", "1-5", "!"), ("D", "1-3", ""), ("U", "1-5", "!"),
       ("D", None, ""), ("U", "1-5", "!!"), ("D", None, ""), ("U", "1-5", "")]

figures = {key: [f"{chord}:{d}{a}" + (f":{st}" if st else "") for d, st, a in PAT]
           for key, chord in NAME.items()}

arr = {
    "title": "Society", "artist": "Eddie Vedder",
    "tempo": 81, "timeSignature": [4, 4],
    "slotsPerBar": 8, "slotDuration": "8",
    "tuning": ["E4", "B3", "G3", "D3", "A2", "E2"], "capo": 0,
    "shapes": {"Gmaj7": "324002", "G": "355433", "D/A": "x00232", "A": "x02220"},
    "figures": figures,
    "bars": CH,
    # Outro is where the 4-bar loop (Gmaj7 g D A) takes over, bar 62 - not bar 57, which is
    # still inside Verse 3's 6-bar G run. The same loop appears once at bars 31-34.
    "sections": {"1": "Verse 1", "17": "Verse 2", "36": "Instrumental",
                 "49": "Verse 3", "62": "Outro"},
}
json.dump(arr, open("society.arrangement.json", "w"), indent=1)
print("76 bars ->", "society.arrangement.json")
