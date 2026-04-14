import {useState, useCallback, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {open} from '@tauri-apps/plugin-dialog';
import {readFile} from '@tauri-apps/plugin-fs';
import {invoke} from '@tauri-apps/api/core';
import {useLocalStorage} from '@/lib/useLocalStorage';
import {
  Guitar,
  FileMusic,
  Clock,
  Trash2,
  Play,
  Grid3X3,
  Dumbbell,
  Speaker,
  Music,
  ChevronRight,
  BookMarked,
} from 'lucide-react';
import {getRepertoireStats} from '@/lib/local-db/repertoire';

import type {RocksmithArrangement} from '@/lib/rocksmith/types';

interface RecentFile {
  path: string;
  name: string;
  type: 'guitarpro' | 'rocksmith';
  openedAt: number;
}

/** Shape of the Rust PsarcResult returned by invoke('parse_psarc') */
interface PsarcResult {
  arrangements: RocksmithArrangement[];
}

const GP_EXTENSIONS = ['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gp7'];
const RS_EXTENSIONS = ['xml', 'psarc'];

export default function GuitarPage() {
  const navigate = useNavigate();
  const [recentFiles, setRecentFiles] = useLocalStorage<RecentFile[]>(
    'guitar.recentFiles',
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repertoireDue, setRepertoireDue] = useState<number | null>(null);

  useEffect(() => {
    getRepertoireStats()
      .then(s => setRepertoireDue(s.dueToday))
      .catch(() => setRepertoireDue(null));
  }, []);

  const navigateWithPsarc = useCallback(
    async (filePath: string, fileName: string) => {
      const result = await invoke<PsarcResult>('parse_psarc', {path: filePath});
      if (result.arrangements.length === 0) {
        throw new Error('No arrangements found in PSARC file');
      }
      navigate('/guitar/song', {
        state: {
          fileData: null,
          fileName,
          filePath,
          fileType: 'psarc' as const,
          psarcArrangement: result.arrangements[0],
          psarcArrangements: result.arrangements,
        },
      });
    },
    [navigate],
  );

  const openFile = useCallback(
    async (fileType: 'guitarpro' | 'rocksmith') => {
      setError(null);
      const extensions = fileType === 'guitarpro' ? GP_EXTENSIONS : RS_EXTENSIONS;

      const selected = await open({
        multiple: false,
        title: fileType === 'guitarpro' ? 'Open Guitar Pro File' : 'Open Rocksmith File',
        filters: [{
          name: fileType === 'guitarpro' ? 'Guitar Pro Files' : 'Rocksmith Files',
          extensions,
        }],
      });

      if (!selected || typeof selected !== 'string') return;

      setLoading(true);
      try {
        const fileName = selected.split(/[\\/]/).pop() ?? selected;
        const isPsarc = selected.toLowerCase().endsWith('.psarc');

        if (isPsarc) {
          await navigateWithPsarc(selected, fileName);
        } else {
          const data = await readFile(selected);
          navigate('/guitar/song', {
            state: {
              fileData: Array.from(data),
              fileName,
              filePath: selected,
              fileType,
            },
          });
        }

        setRecentFiles(prev => {
          const filtered = prev.filter(f => f.path !== selected);
          return [
            {path: selected, name: fileName, type: fileType, openedAt: Date.now()},
            ...filtered,
          ].slice(0, 20);
        });
      } catch (err) {
        setError(
          `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [navigate, setRecentFiles, navigateWithPsarc],
  );

  const openRecentFile = useCallback(
    async (recent: RecentFile) => {
      setError(null);
      setLoading(true);
      try {
        setRecentFiles(prev => {
          const filtered = prev.filter(f => f.path !== recent.path);
          return [{...recent, openedAt: Date.now()}, ...filtered].slice(0, 20);
        });

        const isPsarc = recent.path.toLowerCase().endsWith('.psarc');

        if (isPsarc) {
          await navigateWithPsarc(recent.path, recent.name);
        } else {
          const data = await readFile(recent.path);
          navigate('/guitar/song', {
            state: {
              fileData: Array.from(data),
              fileName: recent.name,
              filePath: recent.path,
              fileType: recent.type,
            },
          });
        }
      } catch (err) {
        setError(
          `Failed to open file: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [navigate, setRecentFiles, navigateWithPsarc],
  );

  const removeRecent = useCallback(
    (path: string) => {
      setRecentFiles(prev => prev.filter(f => f.path !== path));
    },
    [setRecentFiles],
  );

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-on-surface-variant">Practice</span>
          <ChevronRight className="h-3.5 w-3.5 text-on-surface-variant" />
          <span className="text-secondary font-medium">Guitar</span>
        </nav>

        {/* Hero */}
        <header className="space-y-2">
          <h1 className="font-headline font-extrabold text-4xl text-on-surface tracking-tight">
            Guitar Hub
          </h1>
          <p className="text-on-surface-variant text-base max-w-xl leading-relaxed">
            Your practice headquarters. Open tabs, explore the fretboard, and sharpen your technique -- all in one place.
          </p>
        </header>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-3 text-on-surface-variant text-sm py-4">
            <div className="h-4 w-4 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
            Loading file...
          </div>
        )}

        {/* Tools Section */}
        <section className="space-y-4">
          <p className="text-xs font-mono font-semibold tracking-[0.2em] uppercase text-outline">
            Guitarist Toolbox
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Tab Viewer -- primary tool, spans 2 cols */}
            <div className="md:col-span-2 bg-surface-container-low rounded-xl p-6 border border-white/[0.04] group">
              <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <FileMusic className="h-6 w-6 text-secondary" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="font-headline font-bold text-lg text-on-surface">Tab Viewer</h3>
                    <p className="text-on-surface-variant text-sm mt-1 leading-relaxed">
                      Open Guitar Pro (.gp, .gp3-.gp7, .gpx) and Rocksmith (.psarc, .xml) files.
                      Follow along with scrolling tablature and synchronized audio playback.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => !loading && openFile('guitarpro')}
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-black text-sm font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Play className="h-4 w-4" />
                      Launch Studio
                    </button>
                    <button
                      onClick={() => !loading && openFile('rocksmith')}
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high text-on-surface text-sm font-medium hover:bg-surface-container-high/80 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Guitar className="h-4 w-4" />
                      Open Rocksmith
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Fretboard IQ -- Active */}
            <button
              onClick={() => navigate('/guitar/fretboard')}
              className="bg-surface-container-low rounded-xl p-5 border border-secondary-container/20 hover:bg-surface-container transition-all cursor-pointer text-left hover:scale-[1.02]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-secondary-container/10 flex items-center justify-center">
                  <Grid3X3 className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">Fretboard IQ</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Note recognition drills & fretboard mastery</p>
                  <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-secondary">
                    6 drills available
                  </span>
                </div>
              </div>
            </button>

            {/* Chord Finder -- Active */}
            <button
              onClick={() => navigate('/guitar/chords')}
              className="bg-surface-container-low rounded-xl p-5 border border-secondary-container/20 hover:bg-surface-container transition-all cursor-pointer text-left hover:scale-[1.02]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-secondary-container/10 flex items-center justify-center">
                  <Music className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">Chord Finder</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Search voicings & chord shapes</p>
                  <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-secondary">
                    120+ voicings
                  </span>
                </div>
              </div>
            </button>

            {/* RepertoireIQ -- Active */}
            <button
              onClick={() => navigate('/guitar/repertoire')}
              className="bg-surface-container-low rounded-xl p-5 border border-tertiary/20 hover:bg-surface-container transition-all cursor-pointer text-left hover:scale-[1.02]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-tertiary/10 flex items-center justify-center">
                  <BookMarked className="h-5 w-5 text-tertiary" />
                </div>
                <div>
                  <h3 className="font-headline font-semibold text-sm text-on-surface">RepertoireIQ</h3>
                  <p className="text-on-surface-variant text-xs mt-0.5">Spaced repetition for your repertoire</p>
                  {repertoireDue !== null && (
                    <span className={`inline-block mt-2 text-[10px] font-mono uppercase tracking-wider ${repertoireDue > 0 ? 'text-tertiary' : 'text-outline'}`}>
                      {repertoireDue > 0 ? `${repertoireDue} due today` : 'All caught up'}
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* Placeholder cards -- future tools */}
            {[
              {icon: Dumbbell, name: 'Technique Drills', desc: 'Speed & accuracy exercises'},
              {icon: Speaker, name: 'Tone Studio', desc: 'Amp & effects chain'},
            ].map(tool => (
              <div
                key={tool.name}
                className="bg-surface-container-low rounded-xl p-5 border border-white/[0.04] opacity-60 select-none"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-white/[0.04] flex items-center justify-center">
                    <tool.icon className="h-5 w-5 text-on-surface-variant" />
                  </div>
                  <div>
                    <h3 className="font-headline font-semibold text-sm text-on-surface">{tool.name}</h3>
                    <p className="text-on-surface-variant text-xs mt-0.5">{tool.desc}</p>
                    <span className="inline-block mt-2 text-[10px] font-mono uppercase tracking-wider text-outline">
                      Coming soon
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recently Opened */}
        {recentFiles.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-on-surface-variant" />
              <h2 className="font-headline font-bold text-on-surface text-base">
                Recently Opened
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {recentFiles.map(file => (
                <div
                  key={file.path}
                  className="bg-surface-container rounded-lg px-4 py-3 border border-white/[0.04] group hover:border-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileMusic className="h-4 w-4 flex-shrink-0 text-on-surface-variant" />
                    <button
                      className="flex-1 min-w-0 text-left cursor-pointer"
                      onClick={() => openRecentFile(file)}
                      disabled={loading}
                    >
                      <p className="text-sm font-medium text-on-surface truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        <span>{file.type === 'guitarpro' ? 'Guitar Pro' : 'Rocksmith'}</span>
                        <span className="mx-1.5 text-outline">|</span>
                        <span className="text-outline">{formatTimeAgo(file.openedAt)}</span>
                      </p>
                    </button>
                    <button
                      className="flex-shrink-0 h-7 w-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] transition-all cursor-pointer"
                      onClick={e => {
                        e.stopPropagation();
                        removeRecent(file.path);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-on-surface-variant" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
