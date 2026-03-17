import {useState, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';
import {open} from '@tauri-apps/plugin-dialog';
import {readFile} from '@tauri-apps/plugin-fs';
import {invoke} from '@tauri-apps/api/core';
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

  const navigateWithPsarc = useCallback(
    async (filePath: string, fileName: string) => {
      const result = await invoke<PsarcResult>('parse_psarc', {path: filePath});
      if (result.arrangements.length === 0) {
        throw new Error('No arrangements found in PSARC file');
      }
      // Use the first arrangement (typically Lead)
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
