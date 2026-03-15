import { useState } from 'react';
import { getLocalDb } from '@/lib/local-db/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { downloadSong } from '@/lib/local-songs-folder';
import { toast } from 'sonner';

type Chart = {
  md5: string;
  name: string;
  artist: string;
  charter: string;
  diff_drums: number | null;
  diff_guitar: number | null;
  song_length: number | null;
};

export default function BrowseCharts() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Chart[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    const db = await getLocalDb();
    const rows = await db
      .selectFrom('chorus_charts')
      .select(['md5', 'name', 'artist', 'charter', 'diff_drums', 'diff_guitar', 'song_length'])
      .where(eb =>
        eb.or([
          eb('name', 'like', `%${query}%`),
          eb('artist', 'like', `%${query}%`),
          eb('charter', 'like', `%${query}%`),
        ])
      )
      .limit(50)
      .execute();
    setResults(rows);
  };

  const download = async (chart: Chart) => {
    setDownloading(chart.md5);
    try {
      await downloadSong(
        chart.artist,
        chart.name,
        chart.charter,
        `https://files.enchor.us/${chart.md5}.sng`,
        { asSng: false },
      );
      toast.success(`Downloaded: ${chart.name}`);
    } catch (err: any) {
      toast.error(`Download failed: ${err.message}`);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search by song, artist, or charter..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <Button onClick={search}>Search</Button>
      </div>
      {results.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Song</TableHead>
              <TableHead>Artist</TableHead>
              <TableHead>Charter</TableHead>
              <TableHead>Drums</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map(chart => (
              <TableRow key={chart.md5}>
                <TableCell>{chart.name}</TableCell>
                <TableCell>{chart.artist}</TableCell>
                <TableCell>{chart.charter}</TableCell>
                <TableCell>{chart.diff_drums ?? '—'}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    disabled={downloading === chart.md5}
                    onClick={() => download(chart)}>
                    {downloading === chart.md5 ? 'Downloading...' : 'Download'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
