import {useNavigate} from 'react-router-dom';
import {ArrowLeft, ChevronLeft, ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {usePlaybook} from './PlaybookProvider';

export default function PlaybookTopBar() {
  const navigate = useNavigate();
  const {setlist, items, activeIndex, prevSong, nextSong} = usePlaybook();

  return (
    <header className="h-12 bg-surface flex items-center gap-3 px-4 border-b border-white/5 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => navigate('/setlists')}
        title="Back to Setlists"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <h1 className="text-sm font-headline font-bold text-on-surface truncate">
        {setlist.name}
      </h1>

      <div className="ml-auto flex items-center gap-2">
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
