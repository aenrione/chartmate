import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSpotifyAuth } from '@/contexts/SpotifyAuthContext';
import { Badge } from '@/components/ui/badge';

export default function Layout({ children }: { children: ReactNode }) {
  const { isConnected } = useSpotifyAuth();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="border-b px-6 py-3 flex items-center gap-6 flex-shrink-0">
        <Link to="/" className="font-bold text-lg">Chartmate</Link>
        <nav className="flex gap-4 text-sm">
          <Link to="/sheet-music">Sheet Music</Link>
          <Link to="/guitar">Guitar</Link>
          <Link to="/rudiments">Rudiments</Link>
          <Link to="/spotify">Spotify</Link>
          <Link to="/updates">Updates</Link>
          <Link to="/browse">Browse</Link>
        </nav>
        <div className="ml-auto">
          {isConnected
            ? <Badge variant="default">Spotify Connected</Badge>
            : <Badge variant="secondary">Spotify Disconnected</Badge>}
        </div>
      </header>
      <main className="flex-1 min-h-0 flex flex-col">
        {children}
      </main>
    </div>
  );
}
