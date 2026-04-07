import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SpotifyAuthProvider } from '@/contexts/SpotifyAuthContext';
import { SyncProvider } from '@/contexts/SyncContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
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
import SetlistsPage from '@/pages/SetlistsPage';
import PlaybookPage from '@/pages/playbook/PlaybookPage';
import LibraryPage from '@/pages/LibraryPage';
import DrumsHubPage from '@/pages/DrumsHubPage';
import TabEditorPage from '@/pages/tab-editor/TabEditorPage';
import FretboardIQPage from '@/pages/guitar/fretboard/FretboardIQPage';
import FretboardDrillPage from '@/pages/guitar/fretboard/FretboardDrillPage';
import FretboardProgressPage from '@/pages/guitar/fretboard/FretboardProgressPage';
import FretboardSummaryPage from '@/pages/guitar/fretboard/FretboardSummaryPage';
import ChordFinderPage from '@/pages/guitar/chords/ChordFinderPage';

export default function App() {
  const [setupComplete, setSetupComplete] = useState(false);

  return (
    <BrowserRouter>
      <SpotifyAuthProvider>
        <SyncProvider>
          <SidebarProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/sheet-music" element={<DrumsHubPage />} />
              <Route path="/sheet-music/search" element={<SheetMusicPage />} />
              <Route path="/sheet-music/:slug" element={<SheetMusicSongPage />} />
              <Route path="/guitar" element={<GuitarPage />} />
              <Route path="/guitar/song" element={<GuitarSongView />} />
              <Route path="/guitar/test" element={<GuitarTestPage />} />
              <Route path="/guitar/fretboard" element={<FretboardIQPage />} />
              <Route path="/guitar/fretboard/drill/:drillType" element={<FretboardDrillPage />} />
              <Route path="/guitar/fretboard/progress" element={<FretboardProgressPage />} />
              <Route path="/guitar/fretboard/summary" element={<FretboardSummaryPage />} />
              <Route path="/guitar/chords" element={<ChordFinderPage />} />
              <Route path="/rudiments" element={<RudimentsPage />} />
              <Route path="/rudiments/:id" element={<RudimentPracticePage />} />
              <Route path="/library/setlists" element={<SetlistsPage />} />
              <Route path="/spotify" element={<SpotifyPage />} />
              <Route path="/updates" element={<UpdatesPage />} />
              <Route path="/setlists" element={<SetlistsPage />} />
              <Route path="/playbook/:setlistId" element={<PlaybookPage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/tab-editor" element={<TabEditorPage />} />
              <Route path="/tab-editor/:id" element={<TabEditorPage />} />
            </Routes>
          </Layout>
          </SidebarProvider>
          {!setupComplete && (
            <FirstLaunchSetup onComplete={() => setSetupComplete(true)} />
          )}
          <Toaster />
        </SyncProvider>
      </SpotifyAuthProvider>
    </BrowserRouter>
  );
}
