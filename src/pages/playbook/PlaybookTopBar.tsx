import {useNavigate} from 'react-router-dom';
import {ArrowLeft, ChevronLeft, ChevronRight, ListMusic} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {usePlaybook} from './PlaybookProvider';

export default function PlaybookTopBar() {
  const navigate = useNavigate();
  const {setlist, items, activeIndex, prevSong, nextSong, mobileSidebarOpen, setMobileSidebarOpen} = usePlaybook();

  return (
    <header
      className="min-h-12 bg-surface flex items-center gap-2 px-3 lg:px-4 border-b border-white/5 shrink-0"
      style={{paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)', paddingBottom: '0.5rem'}}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => navigate('/setlists')}
        title="Back to Setlists"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {/* Mobile: hamburger for song list */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 lg:hidden"
        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        title="Song list"
      >
        <ListMusic className="h-4 w-4" />
      </Button>

      <h1 className="text-sm font-headline font-bold text-on-surface truncate flex-1">
        {setlist.name}
      </h1>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs font-mono text-on-surface-variant tabular-nums">
          {activeIndex + 1} / {items.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={activeIndex === 0}
          onClick={prevSong}
          title="Previous song"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={activeIndex === items.length - 1}
          onClick={nextSong}
          title="Next song"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
