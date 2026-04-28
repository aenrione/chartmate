import {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
  Guitar, Drum, Music, BookOpen, Timer, Key,
  TrendingUp, Ruler, Layers, Sparkles, Network,
  Palette, Lock, Crown, ChevronDown, ChevronUp,
  CheckCircle2, Circle, X, Play,
} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Instrument, LoadedUnit} from '@/lib/curriculum/types';
import {loadAllUnits} from '@/lib/curriculum/loader';
import {getCompletedLessons, getUnitMinStars} from '@/lib/local-db/learn';

// ── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  guitar: Guitar,
  drum: Drum,
  drums: Drum,
  music: Music,
  'music2': Music,
  'book-open': BookOpen,
  'book': BookOpen,
  timer: Timer,
  piano: Key, // closest available
  key: Key,
  'trending-up': TrendingUp,
  ruler: Ruler,
  layers: Layers,
  sparkles: Sparkles,
  network: Network,
  palette: Palette,
};

function UnitIcon({icon, className}: {icon?: string; className?: string}) {
  const Icon: React.ElementType = (icon ? ICON_MAP[icon] : undefined) ?? Music;
  return <Icon className={cn('h-6 w-6', className)} />;
}

// ── Types ────────────────────────────────────────────────────────────────────

type UnitStatus = 'locked' | 'available' | 'in_progress' | 'completed';

function getUnitStatus(
  unit: LoadedUnit,
  completedLessonIds: Set<string>,
  completedUnitIds: Set<string>,
): UnitStatus {
  const prereqsMet = unit.prerequisites.every(p => completedUnitIds.has(p));
  if (!prereqsMet) return 'locked';
  const done = unit.lessons.filter(l => completedLessonIds.has(`${unit.id}/${l}`));
  if (done.length === 0) return 'available';
  if (done.length === unit.lessons.length) return 'completed';
  return 'in_progress';
}

// ── Tier computation ──────────────────────────────────────────────────────────

function computeTiers(units: LoadedUnit[]): LoadedUnit[][] {
  const depths = new Map<string, number>();
  function depth(unitId: string): number {
    if (depths.has(unitId)) return depths.get(unitId)!;
    const unit = units.find(u => u.id === unitId);
    if (!unit || unit.prerequisites.length === 0) {
      depths.set(unitId, 0);
      return 0;
    }
    const d = Math.max(...unit.prerequisites.map(p => depth(p))) + 1;
    depths.set(unitId, d);
    return d;
  }
  units.forEach(u => depth(u.id));
  const maxDepth = Math.max(0, ...Array.from(depths.values()));
  return Array.from({length: maxDepth + 1}, (_, i) =>
    units.filter(u => depths.get(u.id) === i),
  );
}

// Check if the path tree actually branches (any tier has > 1 node)
function hasBranching(tiers: LoadedUnit[][]): boolean {
  return tiers.some(tier => tier.length > 1);
}

// ── Progress Ring ─────────────────────────────────────────────────────────────

function ProgressRing({
  progress,
  status,
  size = 80,
}: {
  progress: number;
  status: UnitStatus;
  size?: number;
}) {
  const stroke = 5;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(progress, 1));

  const trackColor = status === 'locked' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)';
  const ringColor =
    status === 'completed'
      ? '#f59e0b'
      : status === 'available'
      ? 'var(--color-primary, #6366f1)'
      : status === 'in_progress'
      ? 'var(--color-primary, #6366f1)'
      : 'rgba(255,255,255,0.15)';

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0"
      style={{transform: 'rotate(-90deg)'}}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
      {(progress > 0 || status === 'locked') && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={status === 'locked' ? circ * 0.85 : offset}
          opacity={status === 'locked' ? 0.35 : 1}
        />
      )}
    </svg>
  );
}

// ── Path Node ─────────────────────────────────────────────────────────────────

interface PathNodeProps {
  unit: LoadedUnit;
  status: UnitStatus;
  completedCount: number;
  isCurrentUnit: boolean;
  unitMinStars?: number; // 1..3, undefined if no lessons have been completed yet
  onClick: () => void;
}

function PathNode({unit, status, completedCount, isCurrentUnit, unitMinStars, onClick}: PathNodeProps) {
  const progress = unit.lessons.length > 0 ? completedCount / unit.lessons.length : 0;
  const size = 80;

  const bgColor = {
    locked: 'bg-surface-container',
    available: 'bg-primary',
    in_progress: 'bg-primary',
    completed: 'bg-emerald-500',
  }[status];

  const iconColor = {
    locked: 'text-on-surface-variant/50',
    available: 'text-on-primary',
    in_progress: 'text-on-primary',
    completed: 'text-white',
  }[status];

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 group"
      style={{width: size + 24}}
    >
      <div className="relative" style={{width: size, height: size}}>
        {/* Glow for current / available */}
        {(status === 'available' || isCurrentUnit) && (
          <div className="absolute inset-0 rounded-full bg-primary/30 blur-md scale-110 animate-pulse" />
        )}

        {/* Progress ring */}
        <ProgressRing progress={progress} status={status} size={size} />

        {/* Inner circle */}
        <div
          className={cn(
            'absolute rounded-full flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95',
            bgColor,
          )}
          style={{inset: 8}}
        >
          {status === 'locked' && <Lock className="h-5 w-5 text-on-surface-variant/40" />}
          {status === 'completed' && <Crown className="h-5 w-5 text-white" />}
          {(status === 'available' || status === 'in_progress') && (
            <UnitIcon icon={unit.icon} className={iconColor} />
          )}
        </div>

        {/* Completed badge */}
        {status === 'completed' && (
          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-amber-400 border-2 border-surface flex items-center justify-center">
            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
          </div>
        )}

        {/* Lesson count badge for in_progress */}
        {status === 'in_progress' && (
          <div className="absolute -bottom-1 -right-1 h-6 px-1.5 min-w-6 rounded-full bg-primary border-2 border-surface flex items-center justify-center">
            <span className="text-[10px] font-bold text-on-primary">
              {completedCount}/{unit.lessons.length}
            </span>
          </div>
        )}
      </div>

      {/* Label */}
      <span
        className={cn(
          'text-xs font-semibold text-center leading-tight max-w-[96px]',
          status === 'locked' ? 'text-on-surface-variant/40' : 'text-on-surface',
        )}
      >
        {unit.title}
      </span>

      {/* Stars row + completion count */}
      {status !== 'locked' && completedCount > 0 && (
        <span className="flex items-center gap-1 text-[10px] text-on-surface-variant leading-none">
          <span aria-label={`${unitMinStars ?? 0} of 3 stars across this unit`}>
            {[1, 2, 3].map(i => (
              <span key={i} className={cn(i <= (unitMinStars ?? 0) ? 'text-amber-400' : 'text-on-surface-variant/30')}>★</span>
            ))}
          </span>
          <span>· {completedCount}/{unit.lessons.length}</span>
        </span>
      )}

      {/* Gold pip when every lesson in the unit is 3-star */}
      {unitMinStars === 3 && status === 'completed' && (
        <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Mastered</span>
      )}
    </button>
  );
}

// ── Zigzag Connector ──────────────────────────────────────────────────────────

function ZigzagConnector({fromX, toX}: {fromX: number; toX: number}) {
  const w = 200;
  const h = 44;
  const cx = w / 2;
  const x1 = cx + fromX;
  const x2 = cx + toX;

  return (
    <svg width={w} height={h} className="block mx-auto shrink-0" aria-hidden="true">
      <line
        x1={x1} y1={0} x2={x2} y2={h}
        stroke="currentColor"
        strokeWidth={3}
        strokeDasharray="5 5"
        strokeLinecap="round"
        className="text-outline-variant/25"
      />
    </svg>
  );
}

// ── Shared position math ──────────────────────────────────────────────────────
// Both TierRow (absolute layout) and TierConnector (SVG) use this so lines
// always land exactly on node circles.

const NODE_W = 104;   // PathNode button width  (size=80 + 24 side padding)
const NODE_H = 130;   // PathNode total height  (circle + label)
const NODE_GAP = 16;  // horizontal gap between sibling nodes
const CONN_H = 56;    // connector SVG height

function tierCenters(count: number, cw: number): number[] {
  if (count === 0 || cw === 0) return [];
  const totalW = count * NODE_W + Math.max(0, count - 1) * NODE_GAP;
  const startX = (cw - totalW) / 2 + NODE_W / 2;
  return Array.from({length: count}, (_, i) => startX + i * (NODE_W + NODE_GAP));
}

// ── Tier Connector ────────────────────────────────────────────────────────────

interface TierConnectorProps {
  fromNodes: LoadedUnit[];
  toNodes: LoadedUnit[];
  containerWidth: number;
}

function TierConnector({fromNodes, toNodes, containerWidth}: TierConnectorProps) {
  if (containerWidth === 0) return <div style={{height: CONN_H}} />;

  const fromXs = tierCenters(fromNodes.length, containerWidth);
  const toXs   = tierCenters(toNodes.length,   containerWidth);

  const paths: {d: string; key: string}[] = [];
  toNodes.forEach((toNode, toIdx) => {
    const x2 = toXs[toIdx];
    let matched = false;
    toNode.prerequisites.forEach(prereqId => {
      const fi = fromNodes.findIndex(fn => fn.id === prereqId);
      if (fi >= 0) {
        matched = true;
        const x1 = fromXs[fi];
        const cy = CONN_H / 2;
        paths.push({
          key: `${prereqId}->${toNode.id}`,
          // cubic bezier: smooth S-curve from parent bottom to child top
          d: `M ${x1} 0 C ${x1} ${cy} ${x2} ${cy} ${x2} ${CONN_H}`,
        });
      }
    });
    // fallback: straight line from nearest fromNode when no prereq is in this tier
    if (!matched && fromNodes.length > 0) {
      const x1 = fromXs[Math.floor(fromNodes.length / 2)];
      paths.push({key: `fallback->${toNode.id}`, d: `M ${x1} 0 L ${x2} ${CONN_H}`});
    }
  });

  if (paths.length === 0) return <div style={{height: CONN_H}} />;

  return (
    <svg
      width={containerWidth}
      height={CONN_H}
      className="shrink-0 block"
      aria-hidden="true"
    >
      {paths.map(({d, key}) => (
        <path
          key={key}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray="5 5"
          strokeLinecap="round"
          className="text-outline-variant/30"
        />
      ))}
    </svg>
  );
}

// ── Tier Row ──────────────────────────────────────────────────────────────────

interface TierRowProps {
  units: LoadedUnit[];
  containerWidth: number;
  completedLessonIds: Set<string>;
  completedUnitIds: Set<string>;
  currentUnitId: string | undefined;
  unitMinStars: Map<string, number>;
  onUnitClick: (unit: LoadedUnit) => void;
}

function TierRow({
  units,
  containerWidth,
  completedLessonIds,
  completedUnitIds,
  currentUnitId,
  unitMinStars,
  onUnitClick,
}: TierRowProps) {
  // Use absolute positioning so node centers match exactly what TierConnector draws.
  // Fall back to flex-center while containerWidth is still 0.
  if (containerWidth === 0) {
    return (
      <div className="flex justify-center gap-4 flex-wrap" style={{minHeight: NODE_H}}>
        {units.map(unit => {
          const status = getUnitStatus(unit, completedLessonIds, completedUnitIds);
          const completedCount = unit.lessons.filter(l => completedLessonIds.has(`${unit.id}/${l}`)).length;
          return (
            <PathNode
              key={unit.id}
              unit={unit}
              status={status}
              completedCount={completedCount}
              isCurrentUnit={unit.id === currentUnitId}
              unitMinStars={unitMinStars.get(unit.id)}
              onClick={() => onUnitClick(unit)}
            />
          );
        })}
      </div>
    );
  }

  const centers = tierCenters(units.length, containerWidth);
  return (
    <div className="relative w-full" style={{height: NODE_H}}>
      {units.map((unit, i) => {
        const status = getUnitStatus(unit, completedLessonIds, completedUnitIds);
        const completedCount = unit.lessons.filter(l => completedLessonIds.has(`${unit.id}/${l}`)).length;
        return (
          <div
            key={unit.id}
            className="absolute top-0"
            style={{left: centers[i] - NODE_W / 2}}
          >
            <PathNode
              unit={unit}
              status={status}
              completedCount={completedCount}
              isCurrentUnit={unit.id === currentUnitId}
              unitMinStars={unitMinStars.get(unit.id)}
              onClick={() => onUnitClick(unit)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Branching Path View ───────────────────────────────────────────────────────

interface BranchingPathProps {
  tiers: LoadedUnit[][];
  completedLessonIds: Set<string>;
  completedUnitIds: Set<string>;
  currentUnitId: string | undefined;
  unitMinStars: Map<string, number>;
  onUnitClick: (unit: LoadedUnit) => void;
}

function BranchingPath({
  tiers,
  completedLessonIds,
  completedUnitIds,
  currentUnitId,
  unitMinStars,
  onUnitClick,
}: BranchingPathProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(320);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col items-stretch py-8 pb-20 gap-0">
      {tiers.map((tier, tierIdx) => {
        const prevTier = tierIdx > 0 ? tiers[tierIdx - 1] : null;

        // Decide which connector to render:
        // - No prev tier → no connector
        // - Prev tier has 1 node and current tier has 1 node → simple zigzag
        // - Otherwise → TierConnector with branching SVG
        const showBranchingConnector =
          prevTier !== null && (prevTier.length > 1 || tier.length > 1);
        const showSimpleConnector =
          prevTier !== null && prevTier.length === 1 && tier.length === 1;

        return (
          <div key={tierIdx} className="flex flex-col items-stretch">
            {showBranchingConnector && prevTier && (
              <TierConnector
                fromNodes={prevTier}
                toNodes={tier}
                containerWidth={containerWidth}
              />
            )}
            {showSimpleConnector && (
              <ZigzagConnector fromX={0} toX={0} />
            )}
            <TierRow
              units={tier}
              containerWidth={containerWidth}
              completedLessonIds={completedLessonIds}
              completedUnitIds={completedUnitIds}
              currentUnitId={currentUnitId}
              unitMinStars={unitMinStars}
              onUnitClick={onUnitClick}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Unit Preview Sheet ─────────────────────────────────────────────────────────

interface PreviewSheetProps {
  unit: LoadedUnit;
  status: UnitStatus;
  completedLessonIds: Set<string>;
  instrument: Instrument;
  onClose: () => void;
  onStart: (lessonId: string) => void;
}

function UnitPreviewSheet({
  unit,
  status,
  completedLessonIds,
  instrument,
  onClose,
  onStart,
}: PreviewSheetProps) {
  const firstIncomplete = unit.loadedLessons.find(
    l => !completedLessonIds.has(`${unit.id}/${l.id}`),
  );
  const startLesson = firstIncomplete ?? unit.loadedLessons[0];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl border-t border-outline-variant/20 max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="shrink-0 flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-outline-variant/40" />
        </div>

        {/* Header */}
        <div className="shrink-0 flex items-start gap-3 px-5 py-3">
          <div
            className={cn(
              'h-12 w-12 rounded-xl flex items-center justify-center shrink-0',
              status === 'completed'
                ? 'bg-emerald-500'
                : status === 'locked'
                ? 'bg-surface-container'
                : 'bg-primary',
            )}
          >
            {status === 'locked' ? (
              <Lock className="h-5 w-5 text-on-surface-variant/50" />
            ) : status === 'completed' ? (
              <Crown className="h-5 w-5 text-white" />
            ) : (
              <UnitIcon icon={unit.icon} className="text-on-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-on-surface text-base leading-tight">{unit.title}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5 leading-snug">{unit.description}</p>
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-full hover:bg-surface-container">
            <X className="h-4 w-4 text-on-surface-variant" />
          </button>
        </div>

        {/* Locked notice */}
        {status === 'locked' && (
          <div className="mx-5 mb-3 px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/20">
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Complete <strong className="text-on-surface">
                {unit.prerequisites.join(', ').replace(/-/g, ' ')}
              </strong> first to unlock this unit.
            </p>
          </div>
        )}

        {/* Lesson list */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-1.5">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
            {unit.lessons.length} Lessons · {unit.loadedLessons.reduce((s, l) => s + l.xp, 0)} XP
          </p>
          {unit.loadedLessons.map((lesson, i) => {
            const done = completedLessonIds.has(`${unit.id}/${lesson.id}`);
            return (
              <button
                key={lesson.id}
                onClick={() => status !== 'locked' && onStart(lesson.id)}
                disabled={status === 'locked'}
                className={cn(
                  'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors text-left',
                  status === 'locked'
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-surface-container active:bg-surface-container-high cursor-pointer',
                )}
              >
                <div
                  className={cn(
                    'h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0',
                    done
                      ? 'border-primary bg-primary'
                      : 'border-outline-variant',
                  )}
                >
                  {done ? (
                    <svg className="h-3 w-3 text-on-primary" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className="text-[10px] font-bold text-on-surface-variant">{i + 1}</span>
                  )}
                </div>
                <span className={cn('flex-1 font-medium text-on-surface', done && 'line-through opacity-50')}>
                  {lesson.title}
                </span>
                <span className="text-xs text-on-surface-variant shrink-0">{lesson.xp} XP</span>
              </button>
            );
          })}
        </div>

        {/* CTA */}
        {status !== 'locked' && startLesson && (
          <div className="shrink-0 px-5 py-4 border-t border-outline-variant/20">
            <button
              onClick={() => onStart(startLesson.id)}
              className="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <Play className="h-4 w-4" />
              {status === 'completed' ? 'Review Unit' : status === 'in_progress' ? 'Continue' : 'Start Unit'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Zigzag offsets ────────────────────────────────────────────────────────────

const OFFSETS = [0, 56, 0, -56, 0, 56, 0, -56, 0, 56, 0, -56];

// ── List View ─────────────────────────────────────────────────────────────────

interface ListViewProps {
  units: LoadedUnit[];
  instrument: Instrument;
  completedLessonIds: Set<string>;
  completedUnitIds: Set<string>;
  onUnitClick: (unit: LoadedUnit) => void;
  onLessonClick: (unit: LoadedUnit, lessonId: string) => void;
}

function ListView({
  units,
  instrument,
  completedLessonIds,
  completedUnitIds,
  onUnitClick,
  onLessonClick,
}: ListViewProps) {
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(() => {
    const first = units.find(u => {
      const s = getUnitStatus(u, completedLessonIds, completedUnitIds);
      return s === 'in_progress' || s === 'available';
    });
    return first?.id ?? units[0]?.id ?? null;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {units.map(unit => {
        const status = getUnitStatus(unit, completedLessonIds, completedUnitIds);
        const completedCount = unit.lessons.filter(l =>
          completedLessonIds.has(`${unit.id}/${l}`),
        ).length;
        const isLocked = status === 'locked';
        const isExpanded = expandedUnitId === unit.id;

        return (
          <div key={unit.id}>
            <button
              onClick={() => {
                if (isLocked) { onUnitClick(unit); return; }
                setExpandedUnitId(prev => prev === unit.id ? null : unit.id);
              }}
              className={cn(
                'w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left',
                isLocked
                  ? 'bg-surface-container/40 border-outline-variant/10 opacity-60'
                  : status === 'completed'
                  ? 'bg-emerald-500/8 border-emerald-500/20 hover:bg-emerald-500/12'
                  : 'bg-surface-container border-outline-variant/20 hover:bg-surface-container-high',
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                  isLocked
                    ? 'bg-surface-container-high'
                    : status === 'completed'
                    ? 'bg-emerald-500'
                    : 'bg-primary',
                )}
              >
                {isLocked && <Lock className="h-4 w-4 text-on-surface-variant/50" />}
                {status === 'completed' && <Crown className="h-4 w-4 text-white" />}
                {(status === 'available' || status === 'in_progress') && (
                  <UnitIcon icon={unit.icon} className="h-4 w-4 text-on-primary" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-on-surface truncate">{unit.title}</div>
                <div className="text-xs text-on-surface-variant mt-0.5">
                  {isLocked
                    ? 'Complete prerequisites first'
                    : `${completedCount} / ${unit.lessons.length} lessons`}
                </div>
              </div>

              {/* Progress bar (non-locked) */}
              {!isLocked && (
                <div className="w-14 h-1.5 bg-surface-container-high rounded-full shrink-0">
                  <div
                    className={cn('h-full rounded-full transition-all', status === 'completed' ? 'bg-emerald-500' : 'bg-primary')}
                    style={{width: `${(completedCount / unit.lessons.length) * 100}%`}}
                  />
                </div>
              )}

              {/* Chevron */}
              {!isLocked && (
                isExpanded
                  ? <ChevronUp className="h-4 w-4 text-on-surface-variant shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-on-surface-variant shrink-0" />
              )}
            </button>

            {/* Expanded lesson list */}
            {isExpanded && !isLocked && (
              <div className="mt-1 ml-4 space-y-0.5">
                {unit.loadedLessons.map((lesson, i) => {
                  const done = completedLessonIds.has(`${unit.id}/${lesson.id}`);
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => onLessonClick(unit, lesson.id)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm text-left hover:bg-surface-container transition-colors"
                    >
                      <div
                        className={cn(
                          'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0',
                          done ? 'border-primary bg-primary' : 'border-outline-variant',
                        )}
                      >
                        {done ? (
                          <svg className="h-3 w-3 text-on-primary" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span className="text-[10px] font-bold text-on-surface-variant">{i + 1}</span>
                        )}
                      </div>
                      <span className={cn('flex-1 font-medium text-on-surface', done && 'line-through opacity-50')}>
                        {lesson.title}
                      </span>
                      <span className="text-xs text-on-surface-variant">{lesson.xp} XP</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── SkillTree ─────────────────────────────────────────────────────────────────

export type SkillTreeView = 'path' | 'list';

interface SkillTreeProps {
  instrument: Instrument;
  view: SkillTreeView;
}

export default function SkillTree({instrument, view}: SkillTreeProps) {
  const navigate = useNavigate();
  const [units, setUnits] = useState<LoadedUnit[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [unitMinStars, setUnitMinStars] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUnit, setPreviewUnit] = useState<LoadedUnit | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPreviewUnit(null);
    Promise.all([
      loadAllUnits(instrument),
      getCompletedLessons(instrument),
      getUnitMinStars(instrument),
    ])
      .then(([loadedUnits, progress, minStars]) => {
        setUnits(loadedUnits);
        setCompletedLessonIds(new Set(progress.map(p => `${p.unitId}/${p.lessonId}`)));
        setUnitMinStars(minStars);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, [instrument]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-on-surface-variant text-sm">Loading curriculum…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-500 text-sm">Failed to load curriculum: {error}</p>
      </div>
    );
  }

  const completedUnitIds = new Set(
    units
      .filter(u => u.lessons.every(l => completedLessonIds.has(`${u.id}/${l}`)))
      .map(u => u.id),
  );

  const currentUnitId = units.find(u => {
    const s = getUnitStatus(u, completedLessonIds, completedUnitIds);
    return s === 'in_progress' || s === 'available';
  })?.id;

  function handleUnitClick(unit: LoadedUnit) {
    const status = getUnitStatus(unit, completedLessonIds, completedUnitIds);
    if (status === 'locked') { setPreviewUnit(unit); return; }
    const firstIncomplete = unit.loadedLessons.find(
      l => !completedLessonIds.has(`${unit.id}/${l.id}`),
    );
    if (firstIncomplete) {
      navigate(`/learn/lesson/${instrument}/${unit.id}/${firstIncomplete.id}`);
    } else {
      setPreviewUnit(unit);
    }
  }

  function handleStartLesson(unit: LoadedUnit, lessonId: string) {
    setPreviewUnit(null);
    navigate(`/learn/lesson/${instrument}/${unit.id}/${lessonId}`);
  }

  // Compute tiers for path view
  const tiers = computeTiers(units);
  const branching = hasBranching(tiers);

  return (
    <>
      {view === 'list' ? (
        <ListView
          units={units}
          instrument={instrument}
          completedLessonIds={completedLessonIds}
          completedUnitIds={completedUnitIds}
          onUnitClick={unit => setPreviewUnit(unit)}
          onLessonClick={(unit, lessonId) => handleStartLesson(unit, lessonId)}
        />
      ) : branching ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4">
          <BranchingPath
            tiers={tiers}
            completedLessonIds={completedLessonIds}
            completedUnitIds={completedUnitIds}
            currentUnitId={currentUnitId}
            unitMinStars={unitMinStars}
            onUnitClick={handleUnitClick}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center py-8 pb-20">
            {units.map((unit, i) => {
              const status = getUnitStatus(unit, completedLessonIds, completedUnitIds);
              const completedCount = unit.lessons.filter(l =>
                completedLessonIds.has(`${unit.id}/${l}`),
              ).length;
              const offset = OFFSETS[i % OFFSETS.length];
              const prevOffset = i > 0 ? OFFSETS[(i - 1) % OFFSETS.length] : offset;

              return (
                <div key={unit.id} className="flex flex-col items-center w-full">
                  {i > 0 && <ZigzagConnector fromX={prevOffset} toX={offset} />}
                  <div style={{transform: `translateX(${offset}px)`}}>
                    <PathNode
                      unit={unit}
                      status={status}
                      completedCount={completedCount}
                      isCurrentUnit={unit.id === currentUnitId}
                      unitMinStars={unitMinStars.get(unit.id)}
                      onClick={() => handleUnitClick(unit)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview sheet */}
      {previewUnit && (
        <UnitPreviewSheet
          unit={previewUnit}
          status={getUnitStatus(previewUnit, completedLessonIds, completedUnitIds)}
          completedLessonIds={completedLessonIds}
          instrument={instrument}
          onClose={() => setPreviewUnit(null)}
          onStart={lessonId => handleStartLesson(previewUnit, lessonId)}
        />
      )}
    </>
  );
}
