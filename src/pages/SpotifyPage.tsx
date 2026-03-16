import Spotify from './spotify/Spotify';

export default function SpotifyPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <Spotify />
    </div>
  );
}
