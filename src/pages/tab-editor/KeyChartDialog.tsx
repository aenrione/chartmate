import {useState} from 'react';
import {X} from 'lucide-react';
import {cn} from '@/lib/utils';
import {KEYS, DEGREES, getKeyInfo} from '@/lib/tab-editor/keyData';

// ── Circle of fifths constants ─────────────────────────────────────────────────
const SIZE      = 260;
const CX        = SIZE / 2;
const CY        = SIZE / 2;
const MAJ_OUT   = 122;   // outer edge of major-key ring
const MAJ_IN    = 76;    // inner edge of major-key ring
const MIN_OUT   = 72;    // outer edge of relative-minor ring (4px gap from MAJ_IN)
const MIN_IN    = 36;    // inner edge of relative-minor ring
const MAJ_LR    = (MAJ_OUT + MAJ_IN) / 2;  // 99 — label radius for major keys
const MIN_LR    = (MIN_OUT + MIN_IN) / 2;  // 54 — label radius for minor keys

const RELATIVE_MINORS = ['Am','Em','Bm','F#m','C#m','G#m','Ebm','Bbm','Fm','Cm','Gm','Dm'] as const;
const ACCIDENTALS     = ['','1♯','2♯','3♯','4♯','5♯','6♯','5♭','4♭','3♭','2♭','1♭'] as const;

// SVG colors (can't use Tailwind inside SVG fill= attributes)
const C_SEL_FILL = 'rgba(251,191,36,0.22)';
const C_SEL_MIN  = 'rgba(251,191,36,0.10)';
const C_SEL_TEXT = '#fbbf24';
const C_HOV_FILL = 'rgba(82,82,91,0.7)';
const C_NRM_FILL = 'rgba(63,63,70,0.5)';
const C_NRM_MIN  = 'rgba(39,39,42,0.8)';
const C_HOV_MIN  = 'rgba(63,63,70,0.55)';
const C_NRM_TEXT = '#a1a1aa';
const C_DIM_TEXT = 'rgba(113,113,122,0.65)';
const C_BORDER   = 'rgba(24,24,27,0.9)';

function toXY(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180;
  return {x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad)};
}

/** Annular (donut) sector path for segment i */
function slice(i: number, r1: number, r2: number): string {
  const a0 = -105 + i * 30;
  const a1 = a0 + 30;
  const o0 = toXY(a0, r2), o1 = toXY(a1, r2);
  const i0 = toXY(a0, r1), i1 = toXY(a1, r1);
  const f = (n: number) => n.toFixed(2);
  return `M${f(o0.x)} ${f(o0.y)} A${r2} ${r2} 0 0 1 ${f(o1.x)} ${f(o1.y)} L${f(i1.x)} ${f(i1.y)} A${r1} ${r1} 0 0 0 ${f(i0.x)} ${f(i0.y)}Z`;
}

// ── CircleOfFifths SVG component ───────────────────────────────────────────────
function CircleOfFifths({
  selectedKey,
  onSelectKey,
}: {
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      className="select-none shrink-0"
    >
      {KEYS.map((k, i) => {
        const sel = selectedKey === k.key;
        const hov = hovered === k.key && !sel;
        const mid = -105 + i * 30 + 15;
        const lp  = toXY(mid, MAJ_LR);
        const mp  = toXY(mid, MIN_LR);
        const hasAcc = ACCIDENTALS[i] !== '';

        return (
          <g
            key={k.key}
            onClick={() => onSelectKey(sel ? null : k.key)}
            onMouseEnter={() => setHovered(k.key)}
            onMouseLeave={() => setHovered(null)}
            style={{cursor: 'pointer'}}
          >
            {/* Major ring */}
            <path
              d={slice(i, MAJ_IN, MAJ_OUT)}
              fill={sel ? C_SEL_FILL : hov ? C_HOV_FILL : C_NRM_FILL}
              stroke={C_BORDER}
              strokeWidth={1.5}
            />
            <text
              x={lp.x} y={hasAcc ? lp.y - 5 : lp.y}
              textAnchor="middle" dominantBaseline="central"
              fill={sel ? C_SEL_TEXT : hov ? '#e4e4e7' : C_NRM_TEXT}
              fontSize={sel ? 13 : 11}
              fontWeight={sel ? 700 : 600}
              style={{fontFamily: 'system-ui,sans-serif'}}
            >
              {k.key}
            </text>
            {hasAcc && (
              <text
                x={lp.x} y={lp.y + 7}
                textAnchor="middle" dominantBaseline="central"
                fill={C_DIM_TEXT} fontSize={7}
                style={{fontFamily: 'system-ui,sans-serif'}}
              >
                {ACCIDENTALS[i]}
              </text>
            )}

            {/* Relative-minor ring */}
            <path
              d={slice(i, MIN_IN, MIN_OUT)}
              fill={sel ? C_SEL_MIN : hov ? C_HOV_MIN : C_NRM_MIN}
              stroke={C_BORDER}
              strokeWidth={1.5}
            />
            <text
              x={mp.x} y={mp.y}
              textAnchor="middle" dominantBaseline="central"
              fill={sel ? 'rgba(251,191,36,0.75)' : C_DIM_TEXT}
              fontSize={7.5}
              style={{fontFamily: 'system-ui,sans-serif'}}
            >
              {RELATIVE_MINORS[i]}
            </text>
          </g>
        );
      })}

      {/* Center disc */}
      <circle
        cx={CX} cy={CY} r={MIN_IN - 1}
        fill="rgba(24,24,27,0.95)"
        stroke="rgba(63,63,70,0.4)"
        strokeWidth={1}
      />
      {selectedKey ? (
        <>
          <text x={CX} y={CY - 5} textAnchor="middle" dominantBaseline="central"
            fill={C_SEL_TEXT} fontSize={13} fontWeight={700}
            style={{fontFamily: 'system-ui,sans-serif'}}
          >{selectedKey}</text>
          <text x={CX} y={CY + 8} textAnchor="middle" dominantBaseline="central"
            fill={C_DIM_TEXT} fontSize={7}
            style={{fontFamily: 'system-ui,sans-serif'}}
          >major</text>
        </>
      ) : (
        <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
          fill={C_DIM_TEXT} fontSize={8}
          style={{fontFamily: 'system-ui,sans-serif'}}
        >5ths</text>
      )}
    </svg>
  );
}

// ── Chord quality helper ───────────────────────────────────────────────────────
function chordClass(chord: string) {
  if (chord.endsWith('°')) return 'text-on-surface-variant/50';
  if (chord.endsWith('m')) return 'text-on-surface-variant';
  return 'text-on-surface font-semibold';
}

// ── Dialog ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  onClose: () => void;
}

export default function KeyChartDialog({open, selectedKey, onSelectKey, onClose}: Props) {
  const [view, setView] = useState<'circle' | 'table'>('circle');
  if (!open) return null;

  const keyInfo = selectedKey ? getKeyInfo(selectedKey) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-high rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{width: 'min(640px, 95vw)', maxHeight: '88vh'}}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-outline-variant/20 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-on-surface">Key & Chord Chart</h2>
            <p className="text-[10px] text-on-surface-variant mt-0.5">
              Click a key — fretboard highlights scale notes
            </p>
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-surface-container rounded-lg p-0.5 text-xs shrink-0">
            {(['circle', 'table'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1 rounded-md capitalize transition-colors',
                  view === v
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {selectedKey && (
            <button
              onClick={() => onSelectKey(null)}
              className="text-[10px] text-on-surface-variant hover:text-on-surface px-2 py-1 rounded hover:bg-surface-container transition-colors shrink-0"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-container-highest transition-colors text-on-surface-variant shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Circle view ── */}
        {view === 'circle' && (
          <div className="flex flex-col items-center gap-4 px-6 py-5 overflow-y-auto">
            <CircleOfFifths selectedKey={selectedKey} onSelectKey={onSelectKey} />

            {/* Diatonic chords for selected key */}
            {keyInfo ? (
              <div className="w-full border border-outline-variant/20 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-surface-container flex items-center gap-2 border-b border-outline-variant/10">
                  <span className="text-sm font-bold text-amber-400">{selectedKey} major</span>
                  <span className="text-[10px] text-on-surface-variant">diatonic chords</span>
                </div>
                <div className="grid grid-cols-7 divide-x divide-outline-variant/20">
                  {DEGREES.map((deg, i) => (
                    <div key={deg} className="flex flex-col items-center gap-1 py-3">
                      <span className="text-[8px] text-on-surface-variant/50 uppercase">{deg}</span>
                      <span className={cn('text-xs text-center', chordClass(keyInfo.chords[i]))}>
                        {keyInfo.chords[i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant/40 italic pb-2">
                Click a segment to select a key
              </p>
            )}
          </div>
        )}

        {/* ── Table view ── */}
        {view === 'table' && (
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-surface-container z-10">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-on-surface-variant w-12">
                    Key
                  </th>
                  {DEGREES.map(d => (
                    <th key={d} className="px-2 py-2 text-center text-[10px] font-bold text-on-surface-variant/60">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {KEYS.map(({key, chords}) => {
                  const isSel = selectedKey === key;
                  return (
                    <tr
                      key={key}
                      onClick={() => onSelectKey(isSel ? null : key)}
                      className={cn(
                        'cursor-pointer border-t border-outline-variant/10 transition-colors',
                        isSel ? 'bg-primary/10' : 'hover:bg-surface-container',
                      )}
                    >
                      <td className={cn(
                        'px-4 py-2.5 font-bold text-sm',
                        isSel ? 'text-amber-400' : 'text-on-surface',
                      )}>
                        {key}
                      </td>
                      {chords.map((chord, i) => (
                        <td key={i} className={cn('px-2 py-2.5 text-center', chordClass(chord))}>
                          {chord}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
