import {useState, useEffect, useCallback, useRef} from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Upload, Trash2, Download, Music, FileAudio, Loader2} from 'lucide-react';
import {
  type SoundfontEntry,
  type DownloadableSoundfont,
  DOWNLOADABLE_SOUNDFONTS,
  getAllSoundfonts,
  getActiveSoundfontId,
  setActiveSoundfontId,
  deleteSoundfont,
  importSoundfontFile,
  downloadSoundfont,
} from '@/lib/soundfont-store';
import {formatSize} from '@/lib/format-utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsDialog({open, onOpenChange}: SettingsDialogProps) {
  const [soundfonts, setSoundfonts] = useState<SoundfontEntry[]>([]);
  const [activeId, setActiveId] = useState(getActiveSoundfontId());
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const all = await getAllSoundfonts();
    setSoundfonts(all);
  }, []);

  useEffect(() => {
    if (open) {
      reload();
      setActiveId(getActiveSoundfontId());
    }
  }, [open, reload]);

  const handleSelectSoundfont = (id: string) => {
    setActiveId(id);
    setActiveSoundfontId(id);
    window.dispatchEvent(new CustomEvent('soundfont-changed'));
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const entry = await importSoundfontFile(file);
      await reload();
      handleSelectSoundfont(entry.id);
    } catch (err) {
      console.error('Failed to import soundfont:', err);
    }
    e.target.value = '';
  };

  const handleDelete = async (id: string) => {
    await deleteSoundfont(id);
    if (activeId === id) {
      setActiveId('sonivox');
    }
    await reload();
  };

  const handleDownload = async (dl: DownloadableSoundfont) => {
    // Check if already installed
    if (soundfonts.some(sf => sf.id === dl.id)) return;
    setDownloading(dl.id);
    setDownloadProgress(0);
    setDownloadError(null);
    try {
      const entry = await downloadSoundfont(dl, (loaded, total) => {
        if (total > 0) setDownloadProgress(Math.round((loaded / total) * 100));
      });
      await reload();
      handleSelectSoundfont(entry.id);
    } catch (err) {
      console.error('Failed to download soundfont:', err);
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(null);
      setDownloadProgress(0);
    }
  };

  const installedIds = new Set(soundfonts.map(sf => sf.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden" aria-describedby={undefined}>
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-outline-variant/10">
          <DialogTitle className="text-xl font-bold">Settings</DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
          <section>
            <div className="mb-6">
              <h3 className="text-lg font-bold font-headline text-primary mb-1">Soundfont</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Controls the instrument sound quality for tab playback
              </p>
            </div>

            <div className="space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-widest text-outline">
                Active Soundfont
              </label>
              <Select value={activeId} onValueChange={handleSelectSoundfont}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {soundfonts.map(sf => (
                    <SelectItem key={sf.id} value={sf.id}>
                      {sf.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-6">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant/30 text-primary text-sm font-semibold hover:bg-primary/10 transition-all active:scale-95"
              >
                <Upload className="h-4 w-4" />
                Import .sf2 file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sf2"
                className="hidden"
                onChange={handleImport}
              />
            </div>
          </section>

          <section>
            <label className="block text-xs font-semibold uppercase tracking-widest text-outline mb-4">
              Installed Soundfonts
            </label>
            <div className="space-y-1">
              {soundfonts.map(sf => (
                <div
                  key={sf.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-surface-container/50 hover:bg-surface-container transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    {sf.source === 'built-in' ? (
                      <FileAudio className="h-5 w-5 text-on-surface-variant" />
                    ) : (
                      <Music className="h-5 w-5 text-secondary" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-on-surface">{sf.name}</div>
                      <div className="text-[11px] font-mono text-outline uppercase">
                        {sf.source === 'built-in' ? 'Built-in' : sf.source === 'downloaded' ? 'Downloaded' : 'User Library'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-outline">{formatSize(sf.size)}</span>
                    {sf.source !== 'built-in' ? (
                      <button
                        onClick={() => handleDelete(sf.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-outline-variant hover:text-error hover:bg-error/10 transition-all"
                        title="Delete soundfont"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="w-8" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {DOWNLOADABLE_SOUNDFONTS.length > 0 && (
            <section>
              <label className="block text-xs font-semibold uppercase tracking-widest text-outline mb-4">
                Download Library
              </label>
              {downloadError && (
                <p className="text-error text-sm mb-3">{downloadError}</p>
              )}
              <div className="space-y-2">
                {DOWNLOADABLE_SOUNDFONTS.map(dl => {
                  const installed = installedIds.has(dl.id);
                  const isDownloading = downloading === dl.id;
                  return (
                    <div
                      key={dl.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-outline-variant/15 hover:bg-surface-container/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <div className="text-sm font-medium text-on-surface">{dl.name}</div>
                        <div className="text-xs text-on-surface-variant mt-0.5">{dl.description}</div>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[11px] font-mono text-outline">{dl.size}</span>
                          <span className="text-[11px] text-outline">{dl.license}</span>
                        </div>
                      </div>
                      {installed ? (
                        <span className="text-xs font-medium text-secondary px-3 py-1 rounded-full bg-secondary/10">
                          Installed
                        </span>
                      ) : isDownloading ? (
                        <div className="flex items-center gap-2 text-primary">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-xs font-mono">{downloadProgress}%</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownload(dl)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-primary text-xs font-semibold hover:bg-primary/10 transition-all active:scale-95 border border-primary/30"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
