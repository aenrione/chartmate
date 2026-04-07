import {useEffect, useState, useCallback} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {type Setlist, type SetlistItem, getSetlistItems} from '@/lib/local-db/setlists';
import {getSetlists} from '@/lib/local-db/setlists';
import {abandonOrphanedSessions} from '@/lib/local-db/playbook';
import {PlaybookProvider, usePlaybook} from './PlaybookProvider';
import PlaybookTopBar from './PlaybookTopBar';
import SongHeader from './SongHeader';
import PlaybookSidebar from './PlaybookSidebar';
import ChartViewer from './ChartViewer';
import PlaybackControls from './PlaybackControls';

// ── Keyboard Shell ───────────────────────────────────────────────────

function PlaybookShell() {
  const navigate = useNavigate();
  const {
    prevSong,
    nextSong,
    togglePlay,
    toggleSidebar,
    setLoopSectionId,
    loopSectionId,
    speed,
    setSpeed,
    sections,
    goToSong,
  } = usePlaybook();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in an input
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        prevSong();
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextSong();
        break;
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case '[':
        e.preventDefault();
        toggleSidebar();
        break;
      case 'l':
        e.preventDefault();
        setLoopSectionId(loopSectionId !== null ? null : (sections[0]?.id ?? null));
        break;
      case '+':
      case '=':
        e.preventDefault();
        setSpeed(Math.min(200, speed + 5));
        break;
      case '-':
        e.preventDefault();
        setSpeed(Math.max(25, speed - 5));
        break;
      case 'Escape':
        e.preventDefault();
        navigate('/setlists');
        break;
      default:
        // 1-9 jump to section
        if (e.key >= '1' && e.key <= '9') {
          const idx = parseInt(e.key, 10) - 1;
          if (idx < sections.length) {
            e.preventDefault();
            setLoopSectionId(sections[idx].id);
          }
        }
        break;
    }
  }, [prevSong, nextSong, togglePlay, toggleSidebar, setLoopSectionId, loopSectionId, speed, setSpeed, sections, goToSong, navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col h-full bg-surface">
      <PlaybookTopBar />
      <SongHeader />
      <div className="flex-1 flex min-h-0 relative">
        <PlaybookSidebar />
        <ChartViewer />
        <PlaybackControls />
      </div>
    </div>
  );
}

// ── Page (data loader) ───────────────────────────────────────────────

export default function PlaybookPage() {
  const {setlistId} = useParams<{setlistId: string}>();
  const navigate = useNavigate();
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [items, setItems] = useState<SetlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!setlistId) {
        navigate('/setlists');
        return;
      }

      // Abandon any orphaned practice sessions
      await abandonOrphanedSessions();

      const id = parseInt(setlistId, 10);
      if (isNaN(id)) {
        navigate('/setlists');
        return;
      }

      const allSetlists = await getSetlists();
      const found = allSetlists.find(s => s.id === id);
      if (!found) {
        navigate('/setlists');
        return;
      }

      const setlistItems = await getSetlistItems(id);
      if (setlistItems.length === 0) {
        navigate('/setlists');
        return;
      }

      setSetlist(found);
      setItems(setlistItems);
      setLoading(false);
    };

    load();
  }, [setlistId, navigate]);

  if (loading || !setlist) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface text-sm text-outline">
        Loading playbook...
      </div>
    );
  }

  return (
    <PlaybookProvider setlist={setlist} items={items}>
      <PlaybookShell />
    </PlaybookProvider>
  );
}
