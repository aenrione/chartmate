import {useState, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';
import {open} from '@tauri-apps/plugin-dialog';
import {readFile} from '@tauri-apps/plugin-fs';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {
  Guitar,
  FileMusic,
  FolderOpen,
  Clock,
  Trash2,
} from 'lucide-react';
import {useLocalStorage} from '@/lib/useLocalStorage';

import {parsePsarc} from '@/lib/rocksmith/parsePsarc';
import {parseSng} from '@/lib/rocksmith/parseSng';
import type {SngManifestInfo} from '@/lib/rocksmith/parseSng';

interface RecentFile {
  path: string;
  name: string;
  type: 'guitarpro' | 'rocksmith';
  openedAt: number;
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
        const data = await readFile(selected);
        const fileName = selected.split(/[\\/]/).pop() ?? selected;
        const isPsarc = selected.toLowerCase().endsWith('.psarc');

        if (isPsarc) {
          const psarc = await parsePsarc(data);

          // Parse manifest JSONs for metadata
          const manifestMap = new Map<string, SngManifestInfo>();
          for (const m of psarc.manifests) {
            try {
              const json = JSON.parse(new TextDecoder().decode(m.data));
              const entry = Object.values(json.Entries)[0] as Record<string, unknown>;
              const attrs = (entry as {Attributes: Record<string, unknown>}).Attributes as Record<string, string>;
              // Match manifest to SNG by arrangement name in path
              const arrName = m.path.split('/').pop()?.replace('.json', '') ?? '';
              manifestMap.set(arrName, {
                arrangementName: attrs.ArrangementName ?? arrName,
                songName: attrs.SongName ?? '',
                artistName: attrs.ArtistName ?? '',
                albumName: attrs.AlbumName ?? '',
              });
            } catch { /* skip invalid manifests */ }
          }

          if (psarc.sngFiles.length > 0) {
            // Parse SNG files → RocksmithArrangement → alphaTab Score
            const sng = psarc.sngFiles[0];
            const sngName = sng.path.split('/').pop()?.replace('.sng', '') ?? '';
            const manifest = manifestMap.get(sngName);

            const arrangement = await parseSng(sng.data, 'windows', manifest);

            // Pass the parsed arrangement (serializable) — Score is built in GuitarSongView
            navigate('/guitar/song', {
              state: {
                fileData: null,
                fileName,
                filePath: selected,
                fileType: 'psarc' as const,
                psarcArrangement: arrangement,
              },
            });
          } else if (psarc.arrangements.length > 0) {
            // Fall back to XML arrangements
            navigate('/guitar/song', {
              state: {
                fileData: Array.from(psarc.arrangements[0].data),
                fileName,
                filePath: selected,
                fileType: 'rocksmith' as const,
              },
            });
          } else {
            setError('No arrangements found in PSARC file');
            return;
          }
        } else {
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
    [navigate, setRecentFiles],
  );

  const openRecentFile = useCallback(
    async (recent: RecentFile) => {
      setError(null);
      setLoading(true);
      try {
        const data = await readFile(recent.path);
        const isPsarc = recent.path.toLowerCase().endsWith('.psarc');

        setRecentFiles(prev => {
          const filtered = prev.filter(f => f.path !== recent.path);
          return [{...recent, openedAt: Date.now()}, ...filtered].slice(0, 20);
        });

        if (isPsarc) {
          const psarc = await parsePsarc(data);
          const manifestMap = new Map<string, SngManifestInfo>();
          for (const m of psarc.manifests) {
            try {
              const json = JSON.parse(new TextDecoder().decode(m.data));
              const entry = Object.values(json.Entries)[0] as Record<string, unknown>;
              const attrs = (entry as {Attributes: Record<string, unknown>}).Attributes as Record<string, string>;
              const arrName = m.path.split('/').pop()?.replace('.json', '') ?? '';
              manifestMap.set(arrName, {
                arrangementName: attrs.ArrangementName ?? arrName,
                songName: attrs.SongName ?? '',
                artistName: attrs.ArtistName ?? '',
                albumName: attrs.AlbumName ?? '',
              });
            } catch { /* skip */ }
          }

          if (psarc.sngFiles.length > 0) {
            const sng = psarc.sngFiles[0];
            const sngName = sng.path.split('/').pop()?.replace('.sng', '') ?? '';
            const arrangement = await parseSng(sng.data, 'windows', manifestMap.get(sngName));
            navigate('/guitar/song', {
              state: {
                fileData: null,
                fileName: recent.name,
                filePath: recent.path,
                fileType: 'psarc' as const,
                psarcArrangement: arrangement,
              },
            });
          } else if (psarc.arrangements.length > 0) {
            navigate('/guitar/song', {
              state: {
                fileData: Array.from(psarc.arrangements[0].data),
                fileName: recent.name,
                filePath: recent.path,
                fileType: 'rocksmith' as const,
              },
            });
          } else {
            setError('No arrangements found in PSARC file');
            return;
          }
        } else {
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
    [navigate, setRecentFiles],
  );

  const removeRecent = useCallback(
    (path: string) => {
      setRecentFiles(prev => prev.filter(f => f.path !== path));
    },
    [setRecentFiles],
  );

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Guitar className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold">Guitar Tablature</h1>
            <p className="text-sm text-muted-foreground">
              Open Guitar Pro or Rocksmith files to view and practice
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => !loading && openFile('guitarpro')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileMusic className="h-5 w-5" />
                Guitar Pro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Open .gp, .gp3, .gp4, .gp5, .gpx files
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => !loading && openFile('rocksmith')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderOpen className="h-5 w-5" />
                Rocksmith
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Open .psarc archives or .xml arrangements
              </p>
            </CardContent>
          </Card>
        </div>

        {recentFiles.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Files
            </h2>
            <div className="space-y-1">
              {recentFiles.map(file => (
                <div
                  key={file.path}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 group"
                >
                  <button
                    className="flex-1 text-left text-sm truncate cursor-pointer"
                    onClick={() => openRecentFile(file)}
                    disabled={loading}
                  >
                    <span className="font-medium">{file.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {file.type === 'guitarpro' ? 'Guitar Pro' : 'Rocksmith'}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100"
                    onClick={e => {
                      e.stopPropagation();
                      removeRecent(file.path);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center text-muted-foreground py-8">
            Loading file...
          </div>
        )}
      </div>
    </div>
  );
}
