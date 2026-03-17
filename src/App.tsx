import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SpotifyAuthProvider } from '@/contexts/SpotifyAuthContext';
import { SyncProvider } from '@/contexts/SyncContext';
import { Toaster } from 'sonner';
import Layout from '@/components/Layout';
import FirstLaunchSetup from '@/components/FirstLaunchSetup';
import Home from '@/pages/Home';
import SheetMusicPage from '@/pages/SheetMusicPage';
import SheetMusicSongPage from '@/pages/SheetMusicSongPage';
import SpotifyPage from '@/pages/SpotifyPage';
import UpdatesPage from '@/pages/UpdatesPage';
import BrowsePage from '@/pages/BrowsePage';
import GuitarPage from '@/pages/guitar/GuitarPage';
import GuitarSongView from '@/pages/guitar/GuitarSongView';
import GuitarTestPage from '@/pages/guitar/GuitarTestPage';
import RudimentsPage from '@/pages/rudiments/RudimentsPage';
import RudimentPracticePage from '@/pages/rudiments/RudimentPracticePage';

export default function App() {
  const [setupComplete, setSetupComplete] = useState(false);

  return (
    <BrowserRouter>
      <SpotifyAuthProvider>
        <SyncProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/sheet-music" element={<SheetMusicPage />} />
              <Route path="/sheet-music/:slug" element={<SheetMusicSongPage />} />
              <Route path="/guitar" element={<GuitarPage />} />
              <Route path="/guitar/song" element={<GuitarSongView />} />
              <Route path="/guitar/test" element={<GuitarTestPage />} />
              <Route path="/rudiments" element={<RudimentsPage />} />
              <Route path="/rudiments/:id" element={<RudimentPracticePage />} />
              <Route path="/spotify" element={<SpotifyPage />} />
              <Route path="/updates" element={<UpdatesPage />} />
              <Route path="/browse" element={<BrowsePage />} />
            </Routes>
          </Layout>
          {!setupComplete && (
            <FirstLaunchSetup onComplete={() => setSetupComplete(true)} />
          )}
          <Toaster />
        </SyncProvider>
      </SpotifyAuthProvider>
    </BrowserRouter>
  );
}
