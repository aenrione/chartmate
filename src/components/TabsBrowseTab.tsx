import {useState, useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {useTabSearch} from '@/hooks/useTabSearch';
import {TAB_SOURCES, type TabSearchResult} from '@/lib/tab-sources';
import {saveComposition} from '@/lib/local-db/tab-compositions';
import {toast} from 'sonner';
import {Search, BookOpen, Download, Loader2, ExternalLink} from 'lucide-react';

export default function TabsBrowseTab() {
  const {results, loading, error, search} = useTabSearch();
  const [query, setQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    search(query);
  }

  async function openInBrowser(url: string) {
    const {openUrl} = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  }

  async function fetchGp5Bytes(result: TabSearchResult): Promise<ArrayBuffer> {
    const source = TAB_SOURCES.find(s => s.sourceId === result.sourceId);
    if (!source) throw new Error('Unknown source');
    const url = await source.getDownloadUrl(result);
    const response = await tauriFetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return response.arrayBuffer();
  }

  async function handleOpenInEditor(result: TabSearchResult) {
    setActionLoadingId(`open-${result.sourceId}-${result.id}`);
    try {
      const bytes = await fetchGp5Bytes(result);
      const id = await saveComposition(bytes, {
        title: result.title,
        artist: result.artist,
        album: '',
        tempo: 120,
        instrument: 'guitar',
      });
      navigate(`/tab-editor/${id}`);
    } catch (err) {
      toast.error(`Failed to open tab: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSaveFile(result: TabSearchResult) {
    setActionLoadingId(`save-${result.sourceId}-${result.id}`);
    try {
      const bytes = await fetchGp5Bytes(result);
      const filename = `${result.artist} - ${result.title}.gp5`
        .replace(/[/\\?%*:|"<>]/g, '_');
      const blob = new Blob([bytes], {type: 'application/octet-stream'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Saved ${filename}`);
    } catch (err) {
      toast.error(`Failed to save tab: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoadingId(null);
    }
  }

  const sourceName = (sourceId: string) =>
    TAB_SOURCES.find(s => s.sourceId === sourceId)?.name ?? sourceId;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 pt-2 pb-4 shrink-0">
          <form onSubmit={handleSearch} className="flex gap-2 max-w-xl">
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by song or artist…"
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2">Search</span>
            </Button>
          </form>
          {error && (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          {results.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-48 text-on-surface-variant/50 gap-2">
              <BookOpen className="h-8 w-8" />
              <p className="text-sm">Search for a song to find tabs</p>
            </div>
          )}

          {results.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Artist</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map(result => {
                  const rowKey = `${result.sourceId}-${result.id}`;
                  const isOpenLoading = actionLoadingId === `open-${rowKey}`;
                  const isSaveLoading = actionLoadingId === `save-${rowKey}`;
                  const isAnyLoading = isOpenLoading || isSaveLoading;
                  return (
                    <TableRow key={rowKey}>
                      <TableCell className="font-medium">{result.title}</TableCell>
                      <TableCell className="text-on-surface-variant">{result.artist}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{sourceName(result.sourceId)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {result.viewUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isAnyLoading}
                              onClick={() => openInBrowser(result.viewUrl!)}
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span className="ml-1.5">View</span>
                            </Button>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isAnyLoading || !result.hasGp}
                                  onClick={() => handleOpenInEditor(result)}
                                >
                                  {isOpenLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <BookOpen className="h-3 w-3" />
                                  )}
                                  <span className="ml-1.5">Open</span>
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!result.hasGp && (
                              <TooltipContent>
                                Requires Songsterr Plus login (coming soon)
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isAnyLoading || !result.hasGp}
                                  onClick={() => handleSaveFile(result)}
                                >
                                  {isSaveLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Download className="h-3 w-3" />
                                  )}
                                  <span className="ml-1.5">Save</span>
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!result.hasGp && (
                              <TooltipContent>
                                Requires Songsterr Plus login (coming soon)
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
