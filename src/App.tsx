import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SpotifyAuthProvider } from '@/contexts/SpotifyAuthContext';
import { Toaster } from 'sonner';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import SheetMusicPage from '@/pages/SheetMusicPage';
import SheetMusicSongPage from '@/pages/SheetMusicSongPage';
import SpotifyPage from '@/pages/SpotifyPage';
import UpdatesPage from '@/pages/UpdatesPage';
import BrowsePage from '@/pages/BrowsePage';

export default function App() {
  return (
    <BrowserRouter>
      <SpotifyAuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/sheet-music" element={<SheetMusicPage />} />
            <Route path="/sheet-music/:slug" element={<SheetMusicSongPage />} />
            <Route path="/spotify" element={<SpotifyPage />} />
            <Route path="/updates" element={<UpdatesPage />} />
            <Route path="/browse" element={<BrowsePage />} />
          </Routes>
        </Layout>
        <Toaster />
      </SpotifyAuthProvider>
    </BrowserRouter>
  );
}
