import { useState } from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { SpotifyAuthProvider } from '@/contexts/SpotifyAuthContext';
import { SyncProvider } from '@/contexts/SyncContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { LayoutProvider } from '@/contexts/LayoutContext';
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
import FillsPage from '@/pages/fills/FillsPage';
import FillPracticePage from '@/pages/fills/FillPracticePage';
import SetlistsPage from '@/pages/SetlistsPage';
import PlaybookPage from '@/pages/playbook/PlaybookPage';
import LibraryPage from '@/pages/LibraryPage';
import SavedChartsPage from '@/pages/library/SavedChartsPage';
import PdfLibraryTab from '@/pages/library/PdfLibraryTab';
import ExplorerListsPage from '@/pages/library/ExplorerListsPage';
import DrumsHubPage from '@/pages/DrumsHubPage';
import TabEditorPage from '@/pages/tab-editor/TabEditorPage';
import StemPlayerPage from '@/pages/StemPlayerPage';
import FretboardIQPage from '@/pages/guitar/fretboard/FretboardIQPage';
import FretboardDrillPage from '@/pages/guitar/fretboard/FretboardDrillPage';
import FretboardProgressPage from '@/pages/guitar/fretboard/FretboardProgressPage';
import FretboardSummaryPage from '@/pages/guitar/fretboard/FretboardSummaryPage';
import ChordFinderPage from '@/pages/guitar/chords/ChordFinderPage';
import EarIQPage from '@/pages/guitar/ear/EarIQPage';
import EarSessionPage from '@/pages/guitar/ear/EarSessionPage';
import EarSummaryPage from '@/pages/guitar/ear/EarSummaryPage';
import EarProgressPage from '@/pages/guitar/ear/EarProgressPage';
import EarRecommendationsPage from '@/pages/guitar/ear/EarRecommendationsPage';
import RepertoireIQPage from '@/pages/guitar/repertoire/RepertoireIQPage';
import RepertoireSessionPage from '@/pages/guitar/repertoire/RepertoireSessionPage';
import RepertoireSummaryPage from '@/pages/guitar/repertoire/RepertoireSummaryPage';
import RepertoireProgressPage from '@/pages/guitar/repertoire/RepertoireProgressPage';
import RepertoireManagePage from '@/pages/guitar/repertoire/RepertoireManagePage';

function RootLayout() {
  const [setupComplete, setSetupComplete] = useState(false);
  return (
    <SpotifyAuthProvider>
      <SyncProvider>
        <SidebarProvider>
          <LayoutProvider>
          <Layout>
            <Outlet />
          </Layout>
          </LayoutProvider>
          {!setupComplete && (
            <FirstLaunchSetup onComplete={() => setSetupComplete(true)} />
          )}
          <Toaster />
        </SidebarProvider>
      </SyncProvider>
    </SpotifyAuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/sheet-music', element: <DrumsHubPage /> },
      { path: '/sheet-music/search', element: <SheetMusicPage /> },
      { path: '/sheet-music/:slug', element: <SheetMusicSongPage /> },
      { path: '/guitar', element: <GuitarPage /> },
      { path: '/guitar/song', element: <GuitarSongView /> },
      { path: '/guitar/test', element: <GuitarTestPage /> },
      { path: '/guitar/fretboard', element: <FretboardIQPage /> },
      { path: '/guitar/fretboard/drill/:drillType', element: <FretboardDrillPage /> },
      { path: '/guitar/fretboard/progress', element: <FretboardProgressPage /> },
      { path: '/guitar/fretboard/summary', element: <FretboardSummaryPage /> },
      { path: '/guitar/chords', element: <ChordFinderPage /> },
      { path: '/guitar/ear', element: <EarIQPage /> },
      { path: '/guitar/ear/session/:exerciseType', element: <EarSessionPage /> },
      { path: '/guitar/ear/summary', element: <EarSummaryPage /> },
      { path: '/guitar/ear/progress', element: <EarProgressPage /> },
      { path: '/guitar/ear/recommendations', element: <EarRecommendationsPage /> },
      { path: '/guitar/repertoire', element: <RepertoireIQPage /> },
      { path: '/guitar/repertoire/session', element: <RepertoireSessionPage /> },
      { path: '/guitar/repertoire/summary', element: <RepertoireSummaryPage /> },
      { path: '/guitar/repertoire/progress', element: <RepertoireProgressPage /> },
      { path: '/guitar/repertoire/manage', element: <RepertoireManagePage /> },
      { path: '/rudiments', element: <RudimentsPage /> },
      { path: '/rudiments/:id', element: <RudimentPracticePage /> },
      { path: '/fills', element: <FillsPage /> },
      { path: '/fills/:id', element: <FillPracticePage /> },
      { path: '/library/setlists', element: <SetlistsPage /> },
      { path: '/library/saved-charts', element: <SavedChartsPage /> },
      { path: '/library/pdf', element: <PdfLibraryTab /> },
      { path: '/library/explorer-lists', element: <ExplorerListsPage /> },
      { path: '/spotify', element: <SpotifyPage /> },
      { path: '/updates', element: <UpdatesPage /> },
      { path: '/setlists', element: <SetlistsPage /> },
      { path: '/playbook/:setlistId', element: <PlaybookPage /> },
      { path: '/browse', element: <BrowsePage /> },
      { path: '/library', element: <LibraryPage /> },
      { path: '/tab-editor', element: <TabEditorPage /> },
      { path: '/tab-editor/:id', element: <TabEditorPage /> },
      { path: '/stem-player', element: <StemPlayerPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
