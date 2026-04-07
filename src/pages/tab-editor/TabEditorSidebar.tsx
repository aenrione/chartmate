import {useState} from 'react';
import {cn} from '@/lib/utils';
import {Plus, Trash2, Guitar, Drum, Volume2, VolumeOff} from 'lucide-react';
import {getTuningsForInstrument, getDefaultTuningPreset, type TuningPreset} from '@/lib/tab-editor/tunings';
import type {InstrumentType} from '@/lib/tab-editor/newScore';

interface TrackInfo {
  name: string;
  instrument: InstrumentType;
  stringCount: number;
  tuningName: string;
}

interface TabEditorSidebarProps {
  tracks: TrackInfo[];
  activeTrackIndex: number;
  onTrackSelect: (index: number) => void;
  onAddTrack: (instrument: InstrumentType, stringCount: number) => void;
  onRemoveTrack: (index: number) => void;
  onToggleMute: (index: number) => void;
  mutedTracks: Set<number>;
  onTuningChange: (trackIndex: number, tuning: number[]) => void;
  tempo: number;
  onTempoChange: (bpm: number) => void;
  title: string;
  onTitleChange: (title: string) => void;
  artist: string;
  onArtistChange: (artist: string) => void;
}

export default function TabEditorSidebar({
  tracks,
  activeTrackIndex,
  onTrackSelect,
  onAddTrack,
  onRemoveTrack,
  onToggleMute,
  mutedTracks,
  onTuningChange,
  tempo,
  onTempoChange,
  title,
  onTitleChange,
  artist,
  onArtistChange,
}: TabEditorSidebarProps) {
  const [showAddTrack, setShowAddTrack] = useState(false);

  const activeTrack = tracks[activeTrackIndex];
  const tuningPresets = activeTrack && activeTrack.instrument !== 'drums'
    ? getTuningsForInstrument(activeTrack.instrument, activeTrack.stringCount)
    : [];

  return (
    <div className="w-64 border-r border-outline-variant/20 bg-surface-container-low flex flex-col h-full overflow-hidden">
      {/* Song metadata */}
      <div className="p-4 border-b border-outline-variant/20 space-y-2">
        <input
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="Song Title"
          className="w-full bg-transparent text-sm font-bold text-on-surface placeholder:text-on-surface-variant/40 outline-none border-b border-transparent focus:border-primary transition-colors"
        />
        <input
          value={artist}
          onChange={e => onArtistChange(e.target.value)}
          placeholder="Artist"
          className="w-full bg-transparent text-xs text-on-surface-variant placeholder:text-on-surface-variant/40 outline-none border-b border-transparent focus:border-primary transition-colors"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-on-surface-variant">BPM:</label>
          <input
            type="number"
            value={tempo}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              if (v > 0 && v <= 300) onTempoChange(v);
            }}
            min={20}
            max={300}
            className="w-16 bg-surface-container text-xs text-on-surface px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Tracks */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Tracks</span>
          <button
            onClick={() => setShowAddTrack(!showAddTrack)}
            className="p-1 rounded hover:bg-surface-container-high transition-colors text-on-surface-variant"
            title="Add Track"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {showAddTrack && (
          <div className="mx-4 mb-2 p-2 bg-surface-container rounded-lg space-y-1">
            <button
              onClick={() => { onAddTrack('guitar', 6); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Guitar className="h-3 w-3" /> Guitar (6-string)
            </button>
            <button
              onClick={() => { onAddTrack('guitar', 7); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Guitar className="h-3 w-3" /> Guitar (7-string)
            </button>
            <button
              onClick={() => { onAddTrack('bass', 4); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Guitar className="h-3 w-3" /> Bass (4-string)
            </button>
            <button
              onClick={() => { onAddTrack('bass', 5); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Guitar className="h-3 w-3" /> Bass (5-string)
            </button>
            <button
              onClick={() => { onAddTrack('drums', 0); setShowAddTrack(false); }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface-container-high transition-colors flex items-center gap-2"
            >
              <Drum className="h-3 w-3" /> Drums
            </button>
          </div>
        )}

        <div className="space-y-0.5 px-2">
          {tracks.map((track, i) => (
            <div
              key={i}
              className={cn(
                'group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors',
                i === activeTrackIndex
                  ? 'bg-primary/10 text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-container-high',
              )}
              onClick={() => onTrackSelect(i)}
            >
              {track.instrument === 'drums' ? (
                <Drum className="h-4 w-4 shrink-0" />
              ) : (
                <Guitar className="h-4 w-4 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{track.name}</div>
                <div className="text-[10px] text-on-surface-variant/60 truncate">
                  {track.instrument === 'drums' ? 'Percussion' : track.tuningName}
                </div>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onToggleMute(i);
                  }}
                  className={cn(
                    'p-1 rounded transition-colors',
                    mutedTracks.has(i) ? 'text-error opacity-100' : 'text-on-surface-variant hover:bg-surface-container-high',
                  )}
                  title={mutedTracks.has(i) ? 'Unmute Track' : 'Mute Track'}
                >
                  {mutedTracks.has(i) ? <VolumeOff className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </button>
                {tracks.length > 1 && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onRemoveTrack(i);
                    }}
                    className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant"
                    title="Remove Track"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tuning config for active track */}
      {activeTrack && activeTrack.instrument !== 'drums' && (
        <div className="p-4 border-t border-outline-variant/20">
          <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
            Tuning
          </div>
          <select
            value={activeTrack.tuningName}
            onChange={e => {
              const preset = tuningPresets.find(t => t.name === e.target.value);
              if (preset) onTuningChange(activeTrackIndex, preset.values);
            }}
            className="w-full bg-surface-container text-xs text-on-surface px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-primary"
          >
            {tuningPresets.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
