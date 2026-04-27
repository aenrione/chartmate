import type {ChordDiagramActivity} from '@/lib/curriculum/types';
interface Props { activity: ChordDiagramActivity; onPass: () => void; }
export default function ChordDiagram({onPass}: Props) {
  return <div onClick={onPass} className="p-8 text-center text-on-surface-variant cursor-pointer">[Chord Diagram — tap to continue]</div>;
}
