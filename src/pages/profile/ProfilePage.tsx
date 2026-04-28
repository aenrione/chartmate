// src/pages/profile/ProfilePage.tsx
//
// Single-user local profile. Stores display name + avatar style in localStorage (no backend, no
// auth — chartmate is a single-user desktop app). Surfaces lifetime progression stats and a
// quick path into achievements / settings.

import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {Pencil, Check, Award, Flame, Star, Target, Trophy, Guitar, Drum, Music, Clock} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {
  getLearnStats,
  getAllInstrumentLevels,
  setDailyGoalTarget,
  type InstrumentLevelView,
} from '@/lib/local-db/learn';
import {getLocalDb} from '@/lib/local-db/client';
import {getRecentlyPracticedSongs, type RecentSongView} from '@/lib/local-db/playbook';
import {ACHIEVEMENT_CATALOG} from '@/lib/progression';
import {
  getDailyActiveTimeForRange,
  getDailyContextBreakdownForRange,
  type ContextBreakdown,
} from '@/lib/local-db/active-time';

interface Stats {
  streak: number;
  longestStreak: number;
  todayXp: number;
  dailyGoalTarget: number;
}

const AVATAR_OPTIONS = [
  {key: 'initials', label: 'Initials', Icon: null},
  {key: 'guitar', label: 'Guitar', Icon: Guitar},
  {key: 'drums', label: 'Drums', Icon: Drum},
  {key: 'music', label: 'Music', Icon: Music},
] as const;

type AvatarKind = (typeof AVATAR_OPTIONS)[number]['key'];

const AVATAR_COLORS = [
  {key: 'amber', class: 'bg-amber-500/15 text-amber-600 ring-amber-500/30'},
  {key: 'emerald', class: 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/30'},
  {key: 'sky', class: 'bg-sky-500/15 text-sky-600 ring-sky-500/30'},
  {key: 'rose', class: 'bg-rose-500/15 text-rose-600 ring-rose-500/30'},
  {key: 'violet', class: 'bg-violet-500/15 text-violet-600 ring-violet-500/30'},
] as const;

type AvatarColor = (typeof AVATAR_COLORS)[number]['key'];

const CONTEXT_LABELS: Record<string, string> = {
  browse: 'Browsing',
  lesson: 'Lessons',
  drill: 'Fretboard Drill',
  ear: 'Ear Training',
  repertoire: 'Repertoire',
  fill: 'Fills',
  rudiment: 'Rudiments',
  tab_editor: 'Tab Editor',
  playbook: 'Playbook',
};

const CONTEXT_COLORS: Record<string, string> = {
  browse: 'bg-slate-400',
  lesson: 'bg-primary',
  drill: 'bg-violet-500',
  ear: 'bg-sky-500',
  repertoire: 'bg-emerald-500',
  fill: 'bg-orange-400',
  rudiment: 'bg-amber-500',
  tab_editor: 'bg-rose-500',
  playbook: 'bg-pink-500',
};

function fmtMs(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return '< 1m';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getLast7Days(): {from: string; to: string; dates: string[]} {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('sv'));
  }
  return {from: dates[0], to: dates[6], dates};
}

const PROFILE_KEY = 'chartmate.profile.v1';

interface ProfileData {
  name: string;
  avatarKind: AvatarKind;
  avatarColor: AvatarColor;
}

const DEFAULT_PROFILE: ProfileData = {name: 'Musician', avatarKind: 'music', avatarColor: 'amber'};

function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    return {...DEFAULT_PROFILE, ...parsed};
  } catch {
    return DEFAULT_PROFILE;
  }
}

function saveProfile(p: ProfileData) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [levels, setLevels] = useState<InstrumentLevelView[]>([]);
  const [earnedCount, setEarnedCount] = useState<number>(0);
  const [missionsCompleted, setMissionsCompleted] = useState<number>(0);
  const [lessonsCompleted, setLessonsCompleted] = useState<number>(0);
  const [recentSongs, setRecentSongs] = useState<RecentSongView[]>([]);
  const [weeklyTimeByDate, setWeeklyTimeByDate] = useState<Map<string, number>>(new Map());
  const [weeklyCtxTotals, setWeeklyCtxTotals] = useState<ContextBreakdown[]>([]);
  const [weekDates, setWeekDates] = useState<string[]>([]);

  useEffect(() => {
    setProfile(loadProfile());
    (async () => {
      try {
        const {from, to, dates} = getLast7Days();
        setWeekDates(dates);
        const [s, lv, timeMap, ctxMap] = await Promise.all([
          getLearnStats(),
          getAllInstrumentLevels(),
          getDailyActiveTimeForRange(from, to),
          getDailyContextBreakdownForRange(from, to),
        ]);
        setStats({
          streak: s.streak,
          longestStreak: s.longestStreak,
          todayXp: s.todayXp,
          dailyGoalTarget: s.dailyGoalTarget,
        });
        setLevels(lv);
        setWeeklyTimeByDate(timeMap);

        // Aggregate context totals across the week
        const totals = new Map<string, number>();
        for (const breakdowns of ctxMap.values()) {
          for (const b of breakdowns) {
            totals.set(b.context, (totals.get(b.context) ?? 0) + b.total_ms);
          }
        }
        setWeeklyCtxTotals(
          [...totals.entries()]
            .map(([context, total_ms]) => ({context, total_ms}))
            .filter(b => b.context !== 'browse')
            .sort((a, b) => b.total_ms - a.total_ms),
        );

        const db = await getLocalDb();
        const [achRow, missionsRow, lessonsRow] = await Promise.all([
          db.selectFrom('earned_achievements').select(eb => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
          db.selectFrom('active_missions').select(eb => eb.fn.countAll<number>().as('n')).where('state', '=', 'completed').executeTakeFirst(),
          db.selectFrom('learn_progress').select(eb => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
        ]);
        setEarnedCount(Number(achRow?.n ?? 0));
        setMissionsCompleted(Number(missionsRow?.n ?? 0));
        setLessonsCompleted(Number(lessonsRow?.n ?? 0));
        setRecentSongs(await getRecentlyPracticedSongs(5));
      } catch {
        // tables may not yet exist on a fresh install — leave defaults
      }
    })();
  }, []);

  const totalLifetimeXp = useMemo(
    () => levels.reduce((sum, l) => sum + l.cum_xp, 0),
    [levels],
  );

  function applyEdits(next: Partial<ProfileData>) {
    const merged = {...profile, ...next};
    setProfile(merged);
    saveProfile(merged);
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-surface">
      <div className="max-w-3xl mx-auto p-5 flex flex-col gap-6">
        {/* Avatar + name */}
        <section className="flex items-center gap-5">
          <Avatar profile={profile} large />
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                type="text"
                value={profile.name}
                onChange={e => applyEdits({name: e.target.value})}
                className="w-full bg-surface-container px-3 py-2 rounded-lg text-lg font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-primary"
                autoFocus
              />
            ) : (
              <h1 className="text-2xl font-bold text-on-surface truncate">{profile.name}</h1>
            )}
            <p className="text-sm text-on-surface-variant">
              {totalLifetimeXp.toLocaleString()} lifetime XP · {earnedCount}/{ACHIEVEMENT_CATALOG.length} achievements
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(prev => !prev)}
            aria-label={editing ? 'Save profile' : 'Edit profile'}
          >
            {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </Button>
        </section>

        {/* Avatar customization (only in edit mode) */}
        {editing && (
          <section className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-on-surface">Avatar</h2>
            <div className="flex items-center gap-3 flex-wrap">
              {AVATAR_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => applyEdits({avatarKind: opt.key})}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    profile.avatarKind === opt.key
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {AVATAR_COLORS.map(c => (
                <button
                  key={c.key}
                  onClick={() => applyEdits({avatarColor: c.key})}
                  className={cn(
                    'h-7 w-7 rounded-full ring-2 transition-all',
                    c.class,
                    profile.avatarColor === c.key ? 'ring-offset-2 ring-offset-surface' : 'opacity-60',
                  )}
                  aria-label={`${c.key} color`}
                />
              ))}
            </div>
          </section>
        )}

        {/* Stat cards */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Flame className="h-4 w-4 text-orange-500" />}
            label="Streak"
            value={`${stats?.streak ?? 0} days`}
            sub={`Longest: ${stats?.longestStreak ?? 0}`}
          />
          <StatCard
            icon={<Star className="h-4 w-4 text-amber-500" />}
            label="Today's XP"
            value={`${stats?.todayXp ?? 0} / ${stats?.dailyGoalTarget ?? 10}`}
            sub="daily goal"
          />
          <StatCard
            icon={<Target className="h-4 w-4 text-emerald-500" />}
            label="Missions"
            value={`${missionsCompleted}`}
            sub="completed"
          />
          <StatCard
            icon={<Trophy className="h-4 w-4 text-amber-500" />}
            label="Lessons"
            value={`${lessonsCompleted}`}
            sub="finished"
          />
        </section>

        {/* Per-instrument levels */}
        {levels.length > 0 && (
          <section className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-on-surface">Levels</h2>
            <div className="flex flex-col gap-2.5">
              {levels.map(l => {
                const Icon = l.instrument === 'guitar' ? Guitar : l.instrument === 'drums' ? Drum : Music;
                const total = l.xp_into_level + l.xp_to_next;
                const pct = total > 0 ? Math.min(100, Math.round((l.xp_into_level / total) * 100)) : 0;
                return (
                  <div key={l.instrument} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-on-surface-variant shrink-0" />
                    <div className="w-20 text-sm text-on-surface capitalize shrink-0">{l.instrument}</div>
                    <div className="text-xs font-bold text-on-surface w-10 shrink-0">Lv {l.level}</div>
                    <div className="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{width: `${pct}%`}} />
                    </div>
                    <div className="text-xs text-on-surface-variant tabular-nums">
                      {l.xp_into_level}/{total}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Practice time — last 7 days */}
        {weekDates.length > 0 && (() => {
          const maxMs = Math.max(...weekDates.map(d => weeklyTimeByDate.get(d) ?? 0), 1);
          const weekTotal = weekDates.reduce((s, d) => s + (weeklyTimeByDate.get(d) ?? 0), 0);
          return (
            <section className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Practice time
                </h2>
                {weekTotal > 0 && (
                  <span className="text-xs text-on-surface-variant">{fmtMs(weekTotal)} this week</span>
                )}
              </div>

              {/* 7-day bar chart */}
              <div className="flex items-end gap-1 h-16">
                {weekDates.map(d => {
                  const ms = weeklyTimeByDate.get(d) ?? 0;
                  const heightPct = maxMs > 0 ? Math.max(2, Math.round((ms / maxMs) * 100)) : 2;
                  const dayLabel = new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {weekday: 'short'}).slice(0, 1);
                  const isToday = d === new Date().toLocaleDateString('sv');
                  return (
                    <div key={d} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end" style={{height: '48px'}}>
                        <div
                          className={cn(
                            'w-full rounded-t-sm transition-all',
                            ms > 0 ? (isToday ? 'bg-primary' : 'bg-primary/40') : 'bg-surface-container-high',
                          )}
                          style={{height: `${heightPct}%`}}
                          title={ms > 0 ? fmtMs(ms) : 'No activity'}
                        />
                      </div>
                      <span className={cn('text-[9px] font-medium', isToday ? 'text-primary' : 'text-on-surface-variant')}>
                        {dayLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Context breakdown */}
              {weeklyCtxTotals.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1 border-t border-outline-variant/20">
                  {weeklyCtxTotals.slice(0, 5).map(b => {
                    const pct = weeklyCtxTotals[0].total_ms > 0
                      ? Math.round((b.total_ms / weeklyCtxTotals[0].total_ms) * 100)
                      : 0;
                    const barColor = CONTEXT_COLORS[b.context] ?? 'bg-primary';
                    return (
                      <div key={b.context} className="flex items-center gap-2">
                        <div className={cn('h-2 w-2 rounded-full shrink-0', barColor)} />
                        <span className="text-xs text-on-surface flex-1 min-w-0 truncate">
                          {CONTEXT_LABELS[b.context] ?? b.context}
                        </span>
                        <span className="text-xs tabular-nums text-on-surface-variant shrink-0">
                          {fmtMs(b.total_ms)}
                        </span>
                        <div className="w-16 h-1 bg-surface-container-high rounded-full overflow-hidden shrink-0">
                          <div className={cn('h-full rounded-full', barColor)} style={{width: `${pct}%`}} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {weekTotal === 0 && (
                <p className="text-xs text-on-surface-variant">No activity tracked this week yet.</p>
              )}
            </section>
          );
        })()}

        {/* Settings */}
        <section className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-on-surface">Daily goal</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {[5, 10, 15, 20].map(opt => (
              <button
                key={opt}
                onClick={async () => {
                  await setDailyGoalTarget(opt);
                  setStats(prev => (prev ? {...prev, dailyGoalTarget: opt} : prev));
                }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  stats?.dailyGoalTarget === opt
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
                )}
              >
                {opt} XP
              </button>
            ))}
          </div>
        </section>

        {/* Songs you're learning */}
        {recentSongs.length > 0 && (
          <section className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-4 flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-on-surface">Songs you're learning</h2>
            <div className="flex flex-col gap-1.5">
              {recentSongs.map(s => {
                const pct = s.totalSections > 0 ? Math.round((s.nailedSections / s.totalSections) * 100) : 0;
                return (
                  <div key={s.chartMd5} className="flex items-center gap-3 px-2 py-1.5">
                    <Music className="h-4 w-4 text-on-surface-variant shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-on-surface truncate">
                        {s.chartMd5.slice(0, 12)}…
                      </div>
                      <div className="text-[10px] text-on-surface-variant">
                        {s.nailedSections}/{s.totalSections} nailed · {s.practicingSections} practicing
                      </div>
                    </div>
                    <div className="w-20 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-primary')} style={{width: `${pct}%`}} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Quick links */}
        <section className="grid grid-cols-2 gap-3">
          <Link
            to="/learn/achievements"
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"
          >
            <Award className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-on-surface">View achievements</span>
          </Link>
          <Link
            to="/learn"
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"
          >
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-on-surface">Open learn page</span>
          </Link>
        </section>
      </div>
    </div>
  );
}

function StatCard({icon, label, value, sub}: {icon: React.ReactNode; label: string; value: string; sub?: string}) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container/40 p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-on-surface">{value}</div>
      {sub && <div className="text-[10px] text-on-surface-variant uppercase tracking-wide">{sub}</div>}
    </div>
  );
}

function Avatar({profile, large}: {profile: ProfileData; large?: boolean}) {
  const opt = AVATAR_OPTIONS.find(a => a.key === profile.avatarKind) ?? AVATAR_OPTIONS[0];
  const color = AVATAR_COLORS.find(c => c.key === profile.avatarColor) ?? AVATAR_COLORS[0];
  return (
    <div
      className={cn(
        'rounded-full ring-2 flex items-center justify-center font-bold shrink-0',
        color.class,
        large ? 'h-20 w-20 text-2xl' : 'h-10 w-10 text-sm',
      )}
    >
      {opt.Icon ? <opt.Icon className={large ? 'h-9 w-9' : 'h-5 w-5'} /> : initials(profile.name)}
    </div>
  );
}
