import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EditorHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Kbd({children}: {children: React.ReactNode}) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded bg-surface-container text-[10px] font-mono font-semibold text-on-surface-variant border border-outline-variant/30">
      {children}
    </kbd>
  );
}

function ShortcutRow({keys, description}: {keys: React.ReactNode; description: string}) {
  return (
    <tr className="border-b border-outline-variant/10 last:border-0">
      <td className="py-1.5 pr-4 whitespace-nowrap">{keys}</td>
      <td className="py-1.5 text-on-surface-variant text-xs">{description}</td>
    </tr>
  );
}

export default function EditorHelpDialog({open, onOpenChange}: EditorHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tab Editor — Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-5 text-sm">
          {/* Note Entry */}
          <section>
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Note Entry</h3>
            <table className="w-full">
              <tbody>
                <ShortcutRow
                  keys={<><Kbd>0</Kbd> - <Kbd>9</Kbd></>}
                  description="Enter fret number. Type two digits quickly for frets 10-24 (e.g. 1 then 2 = fret 12)"
                />
                <ShortcutRow
                  keys={<><Kbd>Del</Kbd> / <Kbd>Backspace</Kbd></>}
                  description="Delete note at current position"
                />
                <ShortcutRow
                  keys={<Kbd>R</Kbd>}
                  description="Insert a rest with the current duration"
                />
              </tbody>
            </table>
          </section>

          {/* Navigation */}
          <section>
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Navigation</h3>
            <table className="w-full">
              <tbody>
                <ShortcutRow
                  keys={<><Kbd>&larr;</Kbd> <Kbd>&rarr;</Kbd></>}
                  description="Move to previous / next beat"
                />
                <ShortcutRow
                  keys={<><Kbd>&uarr;</Kbd> <Kbd>&darr;</Kbd></>}
                  description="Move to higher / lower string"
                />
                <ShortcutRow
                  keys={<><Kbd>Ctrl</Kbd> + <Kbd>&larr;</Kbd> <Kbd>&rarr;</Kbd></>}
                  description="Jump to previous / next measure"
                />
              </tbody>
            </table>
          </section>

          {/* Duration */}
          <section>
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Duration</h3>
            <table className="w-full">
              <tbody>
                <ShortcutRow keys={<><Kbd>Ctrl</Kbd> + <Kbd>1</Kbd></>} description="Whole note" />
                <ShortcutRow keys={<><Kbd>Ctrl</Kbd> + <Kbd>2</Kbd></>} description="Half note" />
                <ShortcutRow keys={<><Kbd>Ctrl</Kbd> + <Kbd>3</Kbd></>} description="Quarter note" />
                <ShortcutRow keys={<><Kbd>Ctrl</Kbd> + <Kbd>4</Kbd></>} description="Eighth note" />
                <ShortcutRow keys={<><Kbd>Ctrl</Kbd> + <Kbd>5</Kbd></>} description="Sixteenth note" />
                <ShortcutRow keys={<><Kbd>Ctrl</Kbd> + <Kbd>6</Kbd></>} description="32nd note" />
                <ShortcutRow keys={<><Kbd>Ctrl</Kbd> + <Kbd>7</Kbd></>} description="64th note" />
                <ShortcutRow keys={<Kbd>.</Kbd>} description="Toggle dotted note" />
              </tbody>
            </table>
          </section>

          {/* Effects */}
          <section>
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Effects</h3>
            <table className="w-full">
              <tbody>
                <ShortcutRow keys={<Kbd>H</Kbd>} description="Hammer-on / Pull-off" />
                <ShortcutRow keys={<Kbd>S</Kbd>} description="Slide" />
                <ShortcutRow keys={<Kbd>B</Kbd>} description="Bend (full step)" />
                <ShortcutRow keys={<Kbd>M</Kbd>} description="Palm Mute" />
                <ShortcutRow keys={<Kbd>V</Kbd>} description="Vibrato" />
                <ShortcutRow keys={<Kbd>T</Kbd>} description="Tap" />
                <ShortcutRow keys={<Kbd>G</Kbd>} description="Ghost Note" />
              </tbody>
            </table>
          </section>

          {/* Drum Shortcuts (when on drums track) */}
          <section>
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Drums (when on percussion track)</h3>
            <table className="w-full">
              <tbody>
                <ShortcutRow keys={<Kbd>K</Kbd>} description="Kick / Bass Drum" />
                <ShortcutRow keys={<Kbd>S</Kbd>} description="Snare" />
                <ShortcutRow keys={<Kbd>H</Kbd>} description="Hi-Hat (closed)" />
                <ShortcutRow keys={<Kbd>O</Kbd>} description="Hi-Hat (open)" />
                <ShortcutRow keys={<Kbd>C</Kbd>} description="Crash cymbal" />
                <ShortcutRow keys={<Kbd>D</Kbd>} description="Ride cymbal" />
                <ShortcutRow keys={<Kbd>T</Kbd>} description="High Tom" />
                <ShortcutRow keys={<Kbd>M</Kbd>} description="Mid Tom" />
                <ShortcutRow keys={<Kbd>N</Kbd>} description="Low Tom" />
                <ShortcutRow keys={<Kbd>F</Kbd>} description="Floor Tom" />
              </tbody>
            </table>
          </section>

          {/* Beat Navigation */}
          <section>
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Beat Navigation</h3>
            <table className="w-full">
              <tbody>
                <ShortcutRow keys={<Kbd>L</Kbd>} description="Advance to next beat (inserts new beat if needed)" />
                <ShortcutRow keys={<Kbd>J</Kbd>} description="Go to previous beat" />
              </tbody>
            </table>
          </section>

          {/* Measures & Playback */}
          <section>
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Measures & Playback</h3>
            <table className="w-full">
              <tbody>
                <ShortcutRow keys={<Kbd>+</Kbd>} description="Add measure after current" />
                <ShortcutRow keys={<Kbd>-</Kbd>} description="Delete current measure" />
                <ShortcutRow keys={<Kbd>Space</Kbd>} description="Play / Pause" />
                <ShortcutRow keys={<Kbd>?</Kbd>} description="Show this help dialog" />
              </tbody>
            </table>
          </section>

          {/* How to use */}
          <section className="bg-surface-container-low rounded-lg p-3">
            <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Getting Started</h3>
            <ol className="text-xs text-on-surface-variant space-y-1.5 list-decimal list-inside">
              <li>Click on a beat in the score to place your cursor, or use arrow keys to navigate</li>
              <li>Type a fret number (0-24) to place a note on the current string</li>
              <li>Use <Kbd>&uarr;</Kbd> <Kbd>&darr;</Kbd> to switch strings, <Kbd>&larr;</Kbd> <Kbd>&rarr;</Kbd> to move between beats</li>
              <li>Change note duration with <Kbd>Ctrl</Kbd>+<Kbd>1</Kbd> through <Kbd>7</Kbd> or the toolbar buttons</li>
              <li>Add effects by pressing the shortcut key (H, S, B, M, V, T, G) while on a note</li>
              <li>Use <Kbd>+</Kbd> to add more measures as needed</li>
              <li>Press <Kbd>Space</Kbd> to hear your tab played back</li>
            </ol>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
